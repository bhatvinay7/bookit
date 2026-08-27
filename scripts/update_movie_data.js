const fs = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");
const Redis = require("ioredis");

const MOVIE_DATA_URL = "https://api.sampleapis.com/movies/classic";

function loadEnv(file) {
  const values = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1).replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const fileEnv = loadEnv(path.join(__dirname, "../apps/search-server/.env"));
const config = { ...fileEnv, ...process.env };
for (const key of ["MONGODB_URL", "MONGODB_DB", "ELASTICSEARCH_URL"]) {
  if (!config[key]) throw new Error(`${key} is required`);
}

async function fetchMovies(requiredCount) {
  const response = await fetch(MOVIE_DATA_URL, {
    headers: { "user-agent": "BookIt seed updater/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Movie data request failed (${response.status}): ${await response.text()}`);
  }

  const movies = (await response.json()).filter((movie) =>
    movie.title && movie.imdbId && /^https:\/\//.test(movie.posterURL || ""),
  );
  if (movies.length < requiredCount) {
    throw new Error(`Movie source returned ${movies.length} usable records; ${requiredCount} required`);
  }
  return movies.slice(0, requiredCount);
}

async function indexMovie(esUrl, movie) {
  const { _id, ...document } = movie;
  const response = await fetch(
    `${esUrl.replace(/\/$/, "")}/shows/_doc/${_id.toHexString()}?refresh=wait_for`,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(document) },
  );
  if (!response.ok) {
    throw new Error(`Elasticsearch update failed (${response.status}): ${await response.text()}`);
  }
}

async function invalidateCaches(redisUrl) {
  if (!redisUrl) return;
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  try {
    for (const pattern of ["cache:shows*", "cache:movies*", "cache:dashboard*"]) {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    }
  } finally {
    redis.disconnect();
  }
}

async function run() {
  const client = new MongoClient(config.MONGODB_URL);
  await client.connect();
  try {
    const shows = client.db(config.MONGODB_DB).collection("shows");
    const movieShows = await shows
      .find({ show_type: "Movie", deleted_at: null })
      .sort({ city: 1, _id: 1 })
      .toArray();
    const sourceMovies = await fetchMovies(movieShows.length);

    for (let index = 0; index < movieShows.length; index += 1) {
      const show = movieShows[index];
      const source = sourceMovies[index];
      const update = {
        title: source.title,
        description: `${source.title} is now showing in ${show.city || "your region"}. Movie metadata and poster are sourced from the SampleAPIs classic movie dataset.`,
        tags: ["movie", "classic", source.imdbId, String(show.city || "").toLowerCase()].filter(Boolean),
        genre: ["Classic"],
        language: "English",
        poster_url: source.posterURL,
        thumbnail_url: source.posterURL,
        backdrop_url: source.posterURL,
        director: null,
        director_photo_url: null,
        cast: null,
        data_source: "SampleAPIs Movies",
        source_id: source.imdbId,
        source_url: `https://www.imdb.com/title/${source.imdbId}/`,
        updated_at: new Date().toISOString(),
      };

      await shows.updateOne({ _id: show._id }, { $set: update });
      await indexMovie(config.ELASTICSEARCH_URL, { ...show, ...update });
      console.log(`[${index + 1}/${movieShows.length}] ${show.city}: ${source.title}`);
    }

    await invalidateCaches(config.REDIS_URL);
    console.log(`Updated ${movieShows.length} movie records; non-movie records were not changed.`);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
