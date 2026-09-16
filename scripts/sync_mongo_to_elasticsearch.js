#!/usr/bin/env node
/**
 * sync_mongo_to_elasticsearch.js
 *
 * Reads every document in the MongoDB `shows` collection and bulk-upserts
 * them into the Elasticsearch `shows` index in configurable batches.
 *
 * Environment variables (loaded from apps/search-server/.env, then overridden
 * by process.env):
 *   MONGODB_URL          – MongoDB connection string  (required)
 *   MONGODB_DB           – MongoDB database name      (default: bookit)
 *   ELASTICSEARCH_URL    – Elasticsearch base URL     (required)
 *   SYNC_BATCH_SIZE      – documents per bulk request (default: 100)
 *
 * Usage:
 *   node scripts/sync_mongo_to_elasticsearch.js
 *   SYNC_BATCH_SIZE=200 node scripts/sync_mongo_to_elasticsearch.js
 */

"use strict";

const fs   = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");

// ── Environment loading ────────────────────────────────────────────────────

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep < 1) continue;
    values[line.slice(0, sep)] = line.slice(sep + 1).replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const fileEnv = loadEnv(path.join(__dirname, "../apps/search-server/.env"));
const config  = { ...fileEnv, ...process.env };

for (const key of ["MONGODB_URL", "ELASTICSEARCH_URL"]) {
  if (!config[key]) {
    console.error(`[sync] ERROR: ${key} is required`);
    process.exit(1);
  }
}

const MONGO_URL   = config.MONGODB_URL;
const MONGO_DB    = config.MONGODB_DB || "bookit";
const ES_URL      = config.ELASTICSEARCH_URL.replace(/\/$/, "");
const BATCH_SIZE  = Math.max(1, parseInt(config.SYNC_BATCH_SIZE || "100", 10));

// ── Elasticsearch helpers ─────────────────────────────────────────────────

/**
 * Ensure the `shows` index exists with the same mapping used by the
 * search-server (autocomplete + phonetic analysers, keyword facets).
 */
async function ensureIndex() {
  const url = `${ES_URL}/shows`;
  const headRes = await fetch(url, { method: "HEAD" });
  if (headRes.ok) {
    console.log("[sync] Elasticsearch index 'shows' already exists – skipping creation.");
    return;
  }

  const settings = {
    settings: {
      analysis: {
        filter: {
          phonetic_filter: {
            type: "phonetic",
            encoder: "double_metaphone",
            replace: false,
          },
        },
        analyzer: {
          autocomplete:        { tokenizer: "autocomplete",  filter: ["lowercase"] },
          autocomplete_search: { tokenizer: "lowercase" },
          phonetic_analyzer:   { tokenizer: "standard", filter: ["lowercase", "phonetic_filter"] },
        },
        tokenizer: {
          autocomplete: {
            type: "edge_ngram",
            min_gram: 2,
            max_gram: 20,
            token_chars: ["letter", "digit"],
          },
        },
      },
    },
    mappings: {
      properties: {
        title: {
          type: "text",
          analyzer: "autocomplete",
          search_analyzer: "autocomplete_search",
          fields: { phonetic: { type: "text", analyzer: "phonetic_analyzer" } },
        },
        description:    { type: "text" },
        city:           { type: "keyword", fields: { text: { type: "text" } } },
        venue:          { type: "text",    fields: { keyword: { type: "keyword", ignore_above: 256 } } },
        thumbnail_url:  { type: "keyword", index: false },
        poster_url:     { type: "keyword", index: false },
        category_ids:   { type: "keyword" },
        tags:           { type: "keyword" },
        show_type:      { type: "keyword" },
      },
    },
  };

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!putRes.ok) {
    throw new Error(`Failed to create 'shows' index (${putRes.status}): ${await putRes.text()}`);
  }
  console.log("[sync] Created Elasticsearch index 'shows'.");
}

/**
 * Send a bulk request to Elasticsearch.
 * @param {Array<{id: string, doc: object}>} batch
 * @returns {{ indexed: number, errors: number }}
 */
async function bulkIndex(batch) {
  const lines = [];
  for (const { id, doc } of batch) {
    lines.push(JSON.stringify({ index: { _index: "shows", _id: id } }));
    lines.push(JSON.stringify(doc));
  }
  const body = lines.join("\n") + "\n";

  const res = await fetch(`${ES_URL}/_bulk`, {
    method: "POST",
    headers: { "content-type": "application/x-ndjson" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Bulk request failed (${res.status}): ${await res.text()}`);
  }

  const result = await res.json();
  let indexed = 0;
  let errors  = 0;
  for (const item of result.items || []) {
    const action = item.index || item.create || item.update;
    if (action && (action.result === "created" || action.result === "updated")) {
      indexed++;
    } else {
      errors++;
      if (action?.error) {
        console.error("[sync] Bulk item error:", JSON.stringify(action.error));
      }
    }
  }
  return { indexed, errors };
}

// ── MongoDB helpers ───────────────────────────────────────────────────────

/**
 * Convert a MongoDB show document to the shape stored in Elasticsearch.
 * Strips the internal `_id` field; the caller passes it separately as the ES _id.
 */
function toSearchDocument(mongoDoc) {
  const { _id, ...rest } = mongoDoc;  // eslint-disable-line no-unused-vars
  return rest;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function run() {
  console.log("[sync] Starting MongoDB → Elasticsearch sync");
  console.log(`[sync]   MongoDB  : ${MONGO_URL} / ${MONGO_DB}`);
  console.log(`[sync]   ES URL   : ${ES_URL}`);
  console.log(`[sync]   Batch    : ${BATCH_SIZE} documents`);
  console.log("");

  const mongo = new MongoClient(MONGO_URL);
  try {
    await mongo.connect();
    const db         = mongo.db(MONGO_DB);
    const collection = db.collection("shows");

    await ensureIndex();

    const total = await collection.countDocuments({ deleted_at: null });
    console.log(`[sync] ${total} active show(s) found in MongoDB.`);
    if (total === 0) {
      console.log("[sync] Nothing to sync.");
      return;
    }

    let batch        = [];
    let totalIndexed = 0;
    let totalErrors  = 0;
    let processed    = 0;

    const cursor = collection.find({ deleted_at: null });

    for await (const doc of cursor) {
      const id = doc._id.toHexString();
      batch.push({ id, doc: toSearchDocument(doc) });

      if (batch.length >= BATCH_SIZE) {
        const { indexed, errors } = await bulkIndex(batch);
        totalIndexed += indexed;
        totalErrors  += errors;
        processed    += batch.length;
        console.log(
          `[sync] Progress: ${processed}/${total} | indexed=${totalIndexed} errors=${totalErrors}`
        );
        batch = [];
      }
    }

    // Flush remaining documents in the last (possibly partial) batch
    if (batch.length > 0) {
      const { indexed, errors } = await bulkIndex(batch);
      totalIndexed += indexed;
      totalErrors  += errors;
      processed    += batch.length;
    }

    console.log("");
    console.log(`[sync] Done. ${processed} document(s) processed.`);
    console.log(`[sync]   indexed : ${totalIndexed}`);
    console.log(`[sync]   errors  : ${totalErrors}`);

    if (totalErrors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await mongo.close();
  }
}

run().catch((err) => {
  console.error("[sync] Fatal error:", err.message);
  process.exit(1);
});
