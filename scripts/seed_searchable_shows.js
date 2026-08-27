const fs = require("node:fs");
const path = require("node:path");
const { MongoClient, ObjectId } = require("mongodb");
const { Client: PostgresClient } = require("pg");
const Redis = require("ioredis");

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
for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_DB", "ELASTICSEARCH_URL"]) {
  if (!config[key]) throw new Error(`${key} is required`);
}

const image = (show, asset, width, height) =>
  `https://picsum.photos/seed/bookit-${show}-${asset}/${width}/${height}`;

const baseShows = [
  {
    seed_key: "aurora-protocol", show_type: "Movie", title: "The Aurora Protocol",
    description: "A climate scientist and a deep-space pilot race across a frozen Earth to decode an aurora that carries a warning from humanity's future.",
    tags: ["science-fiction", "thriller", "space", "aurora", "future"], genre: ["Science Fiction", "Thriller"], language: "English", score: 8.8,
    duration_minutes: 148, city: "Bengaluru", venue: "Orion Grand Cinema", director: "Mira Sen",
    cast: [{ name: "Anika Rao", role: "Dr. Leena Voss" }, { name: "Daniel Hart", role: "Commander Elias Cole" }],
  },
  {
    seed_key: "monsoon-letters", show_type: "Movie", title: "Letters After the Monsoon",
    description: "Two families discover a bundle of undelivered letters that reconnects a coastal town with the stories it nearly lost.",
    tags: ["drama", "romance", "monsoon", "family", "india"], genre: ["Drama", "Romance"], language: "Hindi", score: 8.4,
    duration_minutes: 132, city: "Mumbai", venue: "Regal Harbour Screens", director: "Kabir Mehta",
    cast: [{ name: "Ira Kapoor", role: "Naina" }, { name: "Aarav Bose", role: "Ritwik" }],
  },
  {
    seed_key: "neon-raga-live", show_type: "Concert", title: "Neon Raga: Live Under the Stars",
    description: "A cinematic open-air concert where Indian classical improvisation meets synthwave, percussion and responsive light art.",
    tags: ["live-music", "fusion", "classical", "synthwave", "concert"], genre: ["Indian Fusion", "Electronic"], language: "Hindi", score: 9.1,
    duration_minutes: 180, city: "Pune", venue: "Riverside Amphitheatre", host: "Rhea Malhotra",
    performers: [{ name: "Aditi Varma", role: "Vocalist" }, { name: "The Pulse Collective", role: "Live Ensemble" }],
  },
  {
    seed_key: "future-makers-summit", show_type: "Event", title: "Future Makers Summit 2027",
    description: "A practical day of product demos, founder stories and workshops about responsible AI, climate technology and accessible design.",
    tags: ["technology", "ai", "startup", "design", "conference"], genre: ["Technology", "Conference"], language: "English", score: 8.7,
    duration_minutes: 360, city: "Hyderabad", venue: "HITEX Innovation Hall", host: "Nikhil Suri",
    performers: [{ name: "Dr. Tara Menon", role: "AI Researcher" }, { name: "Omar Qureshi", role: "Climate Founder" }],
  },
  {
    seed_key: "titans-night-league", show_type: "GameEvent", title: "Titans Night League: Bengaluru vs Mumbai",
    description: "A high-intensity night cricket exhibition featuring emerging talent, immersive stadium audio and a festival-style fan zone.",
    tags: ["cricket", "sports", "night-league", "bengaluru", "mumbai"], genre: ["Cricket", "Sports"], language: "English", score: 8.9,
    duration_minutes: 240, city: "Bengaluru", venue: "Kanteerava Night Arena", sport: "Cricket", match_round: "League Stage",
    team_a: { name: "Bengaluru Titans", city: "Bengaluru", captain: "Arjun Dev" },
    team_b: { name: "Mumbai Mariners", city: "Mumbai", captain: "Veer Shah" },
  },
];

const REGIONS = [
  "Mumbai", "Bengaluru", "Delhi-NCR", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Chandigarh", "Kochi",
];

const CATEGORY_DEFINITIONS = [
  { show_type: "Movie", name: "Movies", slug: "movies", description: "Movies showing across India", image_url: null },
  { show_type: "Concert", name: "Concerts", slug: "concerts", description: "Live music and concert experiences", image_url: null },
  { show_type: "Event", name: "Events", slug: "events", description: "Conferences, festivals, and live events", image_url: null },
  { show_type: "GameEvent", name: "Sports", slug: "sports", description: "Live matches and sporting events", image_url: null },
];

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const templatesByType = new Map(
  CATEGORY_DEFINITIONS.map(({ show_type }) => [show_type, baseShows.find((show) => show.show_type === show_type)]),
);
const shows = REGIONS.flatMap((city) => CATEGORY_DEFINITIONS.map(({ show_type }) => {
  const template = templatesByType.get(show_type);
  return {
    ...template,
    seed_key: `regional-${slugify(city)}-${slugify(show_type)}`,
    title: `${template.title} — ${city}`,
    city,
    venue: `${city} ${show_type === "Movie" ? "Grand Screens" : show_type === "GameEvent" ? "Sports Arena" : "Convention Grounds"}`,
    tags: [...new Set([...template.tags, city.toLowerCase(), "regional"])],
  };
}));

const SLOT_CONFIG = [
  { slot: "Morning", hour: 10 }, { slot: "Afternoon", hour: 14 },
  { slot: "Evening", hour: 18 }, { slot: "Night", hour: 21 },
];

function indiaScheduleDate(baseDate, dayOffset, hour) {
  const date = new Date(baseDate);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const day = date.toISOString().slice(0, 10);
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+05:30`);
}

async function ensureLayout(pg, showType) {
  const existing = await pg.query(
    `SELECT id FROM seat_layouts WHERE show_type = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1`, [showType],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pg.query(
    `INSERT INTO seat_layouts (name, show_type, description, layout_shape)
     VALUES ($1, $2, $3, 'curved') RETURNING id`,
    [`${showType} Seed Hall`, showType, `Reusable detailed seed layout for ${showType} shows`],
  );
  const layoutId = created.rows[0].id;
  for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
    const row = String.fromCharCode(65 + rowIndex);
    for (let seat = 1; seat <= 10; seat += 1) {
      const seatClass = rowIndex === 0 ? "VIP" : rowIndex === 1 ? "Premium" : "Standard";
      await pg.query(
        `INSERT INTO seat_layout_seats
          (layout_id, row_letter, seat_number, seat_class, x_pos, y_pos, block_name)
         VALUES ($1, $2, $3, $4, $5, $6, 'Main')`,
        [layoutId, row, seat, seatClass, seat * 54, rowIndex * 58],
      );
    }
  }
  return layoutId;
}

function fullShowDocument(template, id, firstStart, categoryId) {
  const base = template.seed_key;
  return {
    _id: id, seed_key: template.seed_key, show_type: template.show_type, title: template.title,
    description: template.description, tags: template.tags, category_ids: [categoryId.toHexString()],
    poster_url: image(base, "poster", 720, 1080), backdrop_url: image(base, "backdrop", 1600, 900),
    thumbnail_url: image(base, "thumbnail", 640, 360), trailer_url: null, teaser_url: null,
    language: template.language, genre: template.genre, score: template.score, weight: 100,
    next_start_time: firstStart.toISOString(), status: "nowShowing", duration_minutes: template.duration_minutes,
    director: template.director || null, director_photo_url: template.director ? image(base, "director", 300, 300) : null,
    cast: template.cast?.map((person, index) => ({ ...person, display_order: index, photo_url: image(base, `cast-${index}`, 300, 300) })) || null,
    host: template.host || null, host_photo_url: template.host ? image(base, "host", 300, 300) : null,
    performers: template.performers?.map((person, index) => ({ ...person, bio: `${person.name} appears at ${template.title}.`, photo_url: image(base, `performer-${index}`, 300, 300) })) || null,
    sport: template.sport || null,
    team_a: template.team_a ? { ...template.team_a, logo_url: image(base, "team-a", 300, 300) } : null,
    team_b: template.team_b ? { ...template.team_b, logo_url: image(base, "team-b", 300, 300) } : null,
    venue: template.venue, match_round: template.match_round || null, city: template.city,
    created_at: new Date().toISOString(), deleted_at: null,
  };
}

async function indexShow(esUrl, id, document) {
  const { _id, ...searchDocument } = document;
  const response = await fetch(`${esUrl.replace(/\/$/, "")}/shows/_doc/${id}?refresh=wait_for`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(searchDocument),
  });
  if (!response.ok) throw new Error(`Elasticsearch indexing failed (${response.status}): ${await response.text()}`);
}

async function ensureSearchIndex(esUrl) {
  const indexUrl = `${esUrl.replace(/\/$/, "")}/shows`;
  const existing = await fetch(indexUrl, { method: "HEAD" });
  if (existing.ok) return;
  const response = await fetch(indexUrl, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      settings: { analysis: {
        analyzer: {
          autocomplete: { tokenizer: "autocomplete", filter: ["lowercase"] },
          autocomplete_search: { tokenizer: "lowercase" },
        },
        tokenizer: { autocomplete: { type: "edge_ngram", min_gram: 2, max_gram: 20, token_chars: ["letter", "digit"] } },
      } },
      mappings: { properties: {
        title: { type: "text", analyzer: "autocomplete", search_analyzer: "autocomplete_search" },
        description: { type: "text" }, venue: { type: "text" }, tags: { type: "keyword" }, show_type: { type: "keyword" },
      } },
    }),
  });
  if (!response.ok) throw new Error(`Elasticsearch index creation failed (${response.status}): ${await response.text()}`);
}

async function invalidatePublicCaches(redisUrl) {
  if (!redisUrl) return;
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  const patterns = ["cache:shows*", "cache:movies*", "cache:dashboard*", "categories:*:all"];
  try {
    for (const pattern of patterns) {
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
  const mongo = new MongoClient(config.MONGODB_URL);
  const pg = new PostgresClient({ connectionString: config.DATABASE_URL });
  await Promise.all([mongo.connect(), pg.connect()]);
  const database = mongo.db(config.MONGODB_DB);
  const collection = database.collection("shows");
  const categoriesCollection = database.collection("categories");
  let scheduleCount = 0;
  try {
    await ensureSearchIndex(config.ELASTICSEARCH_URL);
    await pg.query("BEGIN");
    const categoryIds = new Map();
    for (const category of CATEGORY_DEFINITIONS) {
      const now = new Date().toISOString();
      const result = await categoriesCollection.findOneAndUpdate(
        { slug: category.slug },
        { $set: { ...category, updated_at: now }, $setOnInsert: { created_at: now } },
        { upsert: true, returnDocument: "after" },
      );
      categoryIds.set(category.show_type, result._id);
    }

    for (let showIndex = 0; showIndex < shows.length; showIndex += 1) {
      const template = shows[showIndex];
      const existing = await collection.findOne({ seed_key: template.seed_key });
      const id = existing?._id || new ObjectId();
      const scheduleBase = new Date();
      const firstSlot = SLOT_CONFIG[showIndex % SLOT_CONFIG.length];
      let firstStart = indiaScheduleDate(scheduleBase, 0, firstSlot.hour);
      if (firstStart <= scheduleBase) {
        firstStart = indiaScheduleDate(scheduleBase, 1, firstSlot.hour);
      }
      const document = fullShowDocument(template, id, firstStart, categoryIds.get(template.show_type));
      await collection.replaceOne({ _id: id }, document, { upsert: true });
      await indexShow(config.ELASTICSEARCH_URL, id.toHexString(), document);

      const layoutId = await ensureLayout(pg, template.show_type);
      for (let day = 0; day < 15; day += 1) {
        const slotConfig = SLOT_CONFIG[(day + showIndex) % SLOT_CONFIG.length];
        const start = indiaScheduleDate(scheduleBase, day, slotConfig.hour);
        const end = new Date(start.getTime() + template.duration_minutes * 60_000);
        const bookingOpen = new Date(start.getTime() - 14 * 86_400_000);
        const date = start.toISOString().slice(0, 10);
        const result = await pg.query(
          `INSERT INTO schedules
            (mongo_show_id, show_type, layout_id, start_time, end_time, booking_open_at, date, slot,
             venue_name, venue_address, venue_city, venue_state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (mongo_show_id, date, slot) DO UPDATE SET
             start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time,
             booking_open_at=EXCLUDED.booking_open_at, layout_id=EXCLUDED.layout_id,
             venue_name=EXCLUDED.venue_name, venue_address=EXCLUDED.venue_address,
             venue_city=EXCLUDED.venue_city, venue_state=EXCLUDED.venue_state, deleted_at=NULL
           RETURNING id`,
          [id.toHexString(), template.show_type, layoutId, start, end, bookingOpen, date, slotConfig.slot,
           template.venue, `${template.venue}, central district`, template.city, "India"],
        );
        await pg.query(
          `INSERT INTO schedule_seats
            (schedule_id, layout_seat_id, source, row_letter, seat_number, seat_class, price, status)
           SELECT $1, id, 'base', row_letter, seat_number, seat_class,
             CASE seat_class WHEN 'VIP' THEN 1200 WHEN 'Premium' THEN 750 ELSE 400 END, 'available'
           FROM seat_layout_seats WHERE layout_id=$2
           ON CONFLICT (schedule_id, row_letter, seat_number) DO NOTHING`,
          [result.rows[0].id, layoutId],
        );
        scheduleCount += 1;
      }
    }
    await pg.query("COMMIT");
    await invalidatePublicCaches(config.REDIS_URL);
    console.log(`Seeded ${CATEGORY_DEFINITIONS.length} categories, ${shows.length} regional shows, and ${scheduleCount} schedules from today through the next 2 weeks.`);
  } catch (error) {
    await pg.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await Promise.all([mongo.close(), pg.end()]);
  }
}

run()
  .then(() => require("./update_movie_data").run())
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
