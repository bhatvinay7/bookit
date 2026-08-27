const fs = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");
const { Client: PostgresClient } = require("pg");
const Redis = require("ioredis");

const DAYS_INCLUSIVE = 15;
const SLOT_CONFIG = [
  { slot: "Morning", hour: 10 },
  { slot: "Afternoon", hour: 14 },
  { slot: "Evening", hour: 18 },
  { slot: "Night", hour: 21 },
];

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

const config = {
  ...loadEnv(path.join(__dirname, "../apps/search-server/.env")),
  ...process.env,
};
for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_DB", "ELASTICSEARCH_URL"]) {
  if (!config[key]) throw new Error(`${key} is required`);
}

function currentIndiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const TODAY_INDIA = currentIndiaDate();

function indiaDateParts(dayOffset = 0) {
  const date = new Date(`${TODAY_INDIA}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function indiaScheduleDate(dayOffset, hour) {
  return new Date(`${indiaDateParts(dayOffset)}T${String(hour).padStart(2, "0")}:00:00+05:30`);
}

async function ensureLayout(pg, showType) {
  const existing = await pg.query(
    "SELECT id FROM seat_layouts WHERE show_type=$1 AND deleted_at IS NULL ORDER BY id LIMIT 1",
    [showType],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await pg.query(
    `INSERT INTO seat_layouts (name, show_type, description, layout_shape)
     VALUES ($1,$2,$3,'curved') RETURNING id`,
    [`${showType} Two Week Layout`, showType, `Default ${showType} schedule layout`],
  );
  const layoutId = created.rows[0].id;
  for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
    const row = String.fromCharCode(65 + rowIndex);
    for (let seat = 1; seat <= 10; seat += 1) {
      const seatClass = rowIndex === 0 ? "VIP" : rowIndex === 1 ? "Premium" : "Standard";
      await pg.query(
        `INSERT INTO seat_layout_seats
          (layout_id,row_letter,seat_number,seat_class,x_pos,y_pos,block_name)
         VALUES ($1,$2,$3,$4,$5,$6,'Main')`,
        [layoutId, row, seat, seatClass, seat * 54, rowIndex * 58],
      );
    }
  }
  return layoutId;
}

async function invalidateCaches(redisUrl) {
  if (!redisUrl) return;
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  try {
    for (const pattern of ["cache:shows*", "cache:movies*", "cache:dashboard*", "cache:schedules:active", "categories:public:all"]) {
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

async function indexShow(esUrl, show, nextStart) {
  const { _id, ...document } = show;
  const response = await fetch(`${esUrl.replace(/\/$/, "")}/shows/_doc/${_id.toHexString()}?refresh=wait_for`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...document, next_start_time: nextStart }),
  });
  if (!response.ok) throw new Error(`Elasticsearch update failed for ${_id}: ${await response.text()}`);
}

async function run() {
  const mongo = new MongoClient(config.MONGODB_URL);
  const pg = new PostgresClient({ connectionString: config.DATABASE_URL });
  await Promise.all([mongo.connect(), pg.connect()]);
  const showsCollection = mongo.db(config.MONGODB_DB).collection("shows");
  let insertedSchedules = 0;

  try {
    const shows = await showsCollection.find({ deleted_at: null }).sort({ show_type: 1, city: 1, _id: 1 }).toArray();
    await pg.query("BEGIN");

    for (let showIndex = 0; showIndex < shows.length; showIndex += 1) {
      const show = shows[showIndex];
      const showId = show._id.toHexString();
      const showType = show.show_type;
      const layoutId = await ensureLayout(pg, showType);
      const slotConfig = SLOT_CONFIG[showIndex % SLOT_CONFIG.length];
      const dates = Array.from({ length: DAYS_INCLUSIVE }, (_, day) => indiaDateParts(day));
      const existing = await pg.query(
        `SELECT DISTINCT date::text FROM schedules
         WHERE mongo_show_id=$1 AND deleted_at IS NULL AND date = ANY($2::date[])`,
        [showId, dates],
      );
      const existingDates = new Set(existing.rows.map((row) => row.date));
      let insertedForShow = 0;

      for (let day = 0; day < DAYS_INCLUSIVE; day += 1) {
        const date = dates[day];
        if (existingDates.has(date)) continue;
        const start = indiaScheduleDate(day, slotConfig.hour);
        const duration = Number(show.duration_minutes) || 120;
        const end = new Date(start.getTime() + duration * 60_000);
        const bookingOpen = new Date(start.getTime() - 14 * 86_400_000);
        const result = await pg.query(
          `INSERT INTO schedules
            (mongo_show_id,show_type,layout_id,start_time,end_time,booking_open_at,date,slot,
             venue_name,venue_address,venue_city,venue_state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'India')
           ON CONFLICT (mongo_show_id,date,slot) DO UPDATE SET deleted_at=NULL
           RETURNING id`,
          [showId, showType, layoutId, start, end, bookingOpen, date, slotConfig.slot,
           show.venue || `${showType} Hall`, `${show.venue || "BookIt Venue"}, central district`, show.city || "Unknown City"],
        );
        await pg.query(
          `INSERT INTO schedule_seats
            (schedule_id,layout_seat_id,source,row_letter,seat_number,seat_class,price,status)
           SELECT $1,id,'base',row_letter,seat_number,seat_class,
             CASE seat_class WHEN 'VIP' THEN 1200 WHEN 'Premium' THEN 750 ELSE 400 END,'available'
           FROM seat_layout_seats WHERE layout_id=$2
           ON CONFLICT (schedule_id,row_letter,seat_number) DO NOTHING`,
          [result.rows[0].id, layoutId],
        );
        insertedSchedules += 1;
        insertedForShow += 1;
      }

      let nextStart = indiaScheduleDate(0, slotConfig.hour);
      if (nextStart <= new Date()) nextStart = indiaScheduleDate(1, slotConfig.hour);
      const nextStartIso = nextStart.toISOString();
      if (insertedForShow > 0 || show.next_start_time !== nextStartIso) {
        await showsCollection.updateOne({ _id: show._id }, { $set: { next_start_time: nextStartIso } });
        await indexShow(config.ELASTICSEARCH_URL, show, nextStartIso);
      }
    }

    await pg.query("COMMIT");
    await invalidateCaches(config.REDIS_URL);
    console.log(`Ensured ${DAYS_INCLUSIVE} days of schedules for ${shows.length} shows; inserted ${insertedSchedules} missing schedules.`);
  } catch (error) {
    await pg.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await Promise.all([mongo.close(), pg.end()]);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
