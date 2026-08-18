const { MongoClient, ObjectId } = require('mongodb');
const { Client } = require('pg');

const mongoUri = 'mongodb+srv://bhatvinay74_db_user:ur5Sni3gnOZIjSJ1@cluster0.cz62ssn.mongodb.net/?appName=Cluster0';
const pgUri = 'postgresql://neondb_owner:npg_cCStswDNj87q@ep-quiet-base-aukgk05o-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require';

const mongoClient = new MongoClient(mongoUri);
const pgClient = new Client({ connectionString: pgUri });
const baseLayoutId = 3;

const unsplashImage = (width, height, sig, keyword = 'entertainment') =>
  `https://picsum.photos/seed/${encodeURIComponent(keyword + sig)}/${width}/${height}`;

const slotForHour = (hour) => {
  if (hour < 12) return 'Morning';
  if (hour < 16) return 'Afternoon';
  if (hour < 20) return 'Evening';
  return 'Night';
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

const seedCities = [
  'Mumbai',
  'Bengaluru',
  'Delhi-NCR',
  'Hyderabad',
  'Chennai',
  'Pune',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Chandigarh',
  'Kochi',
];

const showTemplates = [
  {
    show_type: 'Movie',
    title: 'Oppenheimer: Atomic Vision',
    description: 'A sweeping historical drama that explores the life of J. Robert Oppenheimer and the dawn of the atomic age.',
    tags: ['Drama', 'Biography', 'History'],
    genre: ['Historical Drama', 'Thriller'],
    language: 'English',
    score: 9.1,
    duration_minutes: 140,
    director: 'Christopher Nolan',
    directors_photo_sig: 1,
    cast: [
      { name: 'Cillian Murphy', role: 'J. Robert Oppenheimer', photo_sig: 2 },
      { name: 'Emily Blunt', role: 'Katherine Oppenheimer', photo_sig: 3 },
    ],
    city: 'Bengaluru',
    venue: 'Lincoln Center Theater',
    image_sig_start: 10,
  },
  {
    show_type: 'Movie',
    title: 'Dune: Sand Sea',
    description: 'The next chapter in a desert science-fiction saga featuring political intrigue and epic landscapes.',
    tags: ['Sci-Fi', 'Adventure', 'Epic'],
    genre: ['Science Fiction', 'Adventure'],
    language: 'English',
    score: 8.8,
    duration_minutes: 155,
    director: 'Denis Villeneuve',
    directors_photo_sig: 4,
    cast: [
      { name: 'Timothée Chalamet', role: 'Paul Atreides', photo_sig: 5 },
      { name: 'Zendaya', role: 'Chani', photo_sig: 6 },
    ],
    city: 'Bengaluru',
    venue: 'Burj Khalifa Cinema',
    image_sig_start: 20,
  },
  {
    show_type: 'Movie',
    title: 'Spider-Man: Beyond The Veil',
    description: 'A thrilling multiverse adventure with emotional stakes, vivid animation, and a fresh take on the iconic web-slinger.',
    tags: ['Animation', 'Superhero', 'Action'],
    genre: ['Animated', 'Action'],
    language: 'English',
    score: 8.5,
    duration_minutes: 125,
    director: 'Joaquim Dos Santos',
    directors_photo_sig: 7,
    cast: [
      { name: 'Shameik Moore', role: 'Miles Morales', photo_sig: 8 },
      { name: 'Hailee Steinfeld', role: 'Gwen Stacy', photo_sig: 9 },
    ],
    city: 'Bengaluru',
    venue: 'Dolby Theater',
    image_sig_start: 30,
  },
  {
    show_type: 'Movie',
    title: 'The Marvels: Cosmic Symphony',
    description: 'A visually spectacular superhero adventure that merges cosmic stakes with ensemble character drama.',
    tags: ['Superhero', 'Fantasy', 'Adventure'],
    genre: ['Action', 'Fantasy'],
    language: 'English',
    score: 8.0,
    duration_minutes: 130,
    director: 'Nia DaCosta',
    directors_photo_sig: 10,
    cast: [
      { name: 'Brie Larson', role: 'Carol Danvers', photo_sig: 11 },
      { name: 'Iman Vellani', role: 'Kamala Khan', photo_sig: 12 },
    ],
    city: 'Bengaluru',
    venue: 'Mission Bay Arena',
    image_sig_start: 40,
  },
  {
    show_type: 'Movie',
    title: 'Indiana Jones and the Dial of Destiny',
    description: 'A globe-spanning action adventure with ancient mysteries, daring escapes, and one final heroic journey.',
    tags: ['Adventure', 'Action', 'Thriller'],
    genre: ['Adventure', 'Action'],
    language: 'English',
    score: 7.7,
    duration_minutes: 128,
    director: 'James Mangold',
    directors_photo_sig: 13,
    cast: [
      { name: 'Harrison Ford', role: 'Indiana Jones', photo_sig: 14 },
      { name: 'Phoebe Waller-Bridge', role: 'Helena', photo_sig: 15 },
    ],
    city: 'Bengaluru',
    venue: 'Grand Palais Cinema',
    image_sig_start: 50,
  },
  {
    show_type: 'Concert',
    title: 'Taylor Swift: The Eras Encore',
    description: 'A massive pop spectacle with theatrical staging, chart-topping hits, and immersive production design.',
    tags: ['Pop', 'Tour', 'Live'],
    genre: ['Pop', 'Live'],
    language: 'English',
    score: 9.4,
    duration_minutes: 180,
    host: 'Taylor Swift Management',
    host_photo_sig: 16,
    performers: [
      { name: 'Taylor Swift', role: 'Headliner', photo_sig: 17 },
      { name: 'Olivia Rodrigo', role: 'Special Guest', photo_sig: 18 },
    ],
    city: 'Bengaluru',
    venue: 'Wembley Stadium',
    image_sig_start: 60,
  },
  {
    show_type: 'Concert',
    title: 'Beyoncé Renaissance Live',
    description: 'A bold R&B and Afrobeats concert event, featuring powerhouse vocals, choreography, and cinematic visuals.',
    tags: ['R&B', 'Live', 'Dance'],
    genre: ['R&B', 'Live'],
    language: 'English',
    score: 9.2,
    duration_minutes: 170,
    host: 'Beyoncé Presents',
    host_photo_sig: 19,
    performers: [
      { name: 'Beyoncé', role: 'Headliner', photo_sig: 20 },
      { name: 'SZA', role: 'Special Guest', photo_sig: 21 },
    ],
    city: 'Bengaluru',
    venue: 'Accor Arena',
    image_sig_start: 70,
  },
  {
    show_type: 'Concert',
    title: 'Coldplay: Spheres In Motion',
    description: 'A stadium concert with immersive visuals, uplifting anthems, and a cosmic live experience.',
    tags: ['Alternative', 'Rock', 'Stadium'],
    genre: ['Alternative', 'Rock'],
    language: 'English',
    score: 8.9,
    duration_minutes: 165,
    host: 'Coldplay Presents',
    host_photo_sig: 22,
    performers: [
      { name: 'Coldplay', role: 'Headliner', photo_sig: 23 },
      { name: 'Dua Lipa', role: 'Special Guest', photo_sig: 24 },
    ],
    city: 'Bengaluru',
    venue: 'Waldbühne Arena',
    image_sig_start: 80,
  },
  {
    show_type: 'Concert',
    title: 'Billie Eilish: Midnight Cinema',
    description: 'A dark pop production with cinematic lighting, haunting melodies, and cinematic stagecraft.',
    tags: ['Pop', 'Indie', 'Live'],
    genre: ['Pop', 'Indie'],
    language: 'English',
    score: 8.7,
    duration_minutes: 150,
    host: 'Billie Eilish Productions',
    host_photo_sig: 25,
    performers: [
      { name: 'Billie Eilish', role: 'Headliner', photo_sig: 26 },
      { name: 'Finneas', role: 'Live Producer', photo_sig: 27 },
    ],
    city: 'Bengaluru',
    venue: 'Tokyo Dome',
    image_sig_start: 90,
  },
  {
    show_type: 'Concert',
    title: 'Ed Sheeran: Autumn Acoustic',
    description: 'An intimate acoustic performance with storytelling, live loops, and the biggest contemporary ballads.',
    tags: ['Acoustic', 'Singer-songwriter', 'Live'],
    genre: ['Acoustic', 'Pop'],
    language: 'English',
    score: 8.5,
    duration_minutes: 145,
    host: 'Sheeran Live',
    host_photo_sig: 28,
    performers: [
      { name: 'Ed Sheeran', role: 'Headliner', photo_sig: 29 },
      { name: 'Passenger', role: 'Special Guest', photo_sig: 30 },
    ],
    city: 'Bengaluru',
    venue: 'Qudos Bank Arena',
    image_sig_start: 100,
  },
  {
    show_type: 'Event',
    title: 'Global Tech Summit 2026',
    description: 'A major technology leadership conference with keynote talks, product launches, and interactive innovation labs.',
    tags: ['Technology', 'Conference', 'Innovation'],
    genre: ['Business', 'Technology'],
    language: 'English',
    score: 8.4,
    duration_minutes: 240,
    host: 'World Innovation Forum',
    host_photo_sig: 31,
    performers: [
      { name: 'Sundar Pichai', role: 'Keynote', photo_sig: 32 },
      { name: 'Satya Nadella', role: 'Fireside Chat', photo_sig: 33 },
    ],
    city: 'Bengaluru',
    venue: 'Moscone Center',
    image_sig_start: 110,
  },
  {
    show_type: 'Event',
    title: 'Comic-Con International Live',
    description: 'A fan culture extravaganza with celebrity panels, exclusive premieres, and cosplay competitions.',
    tags: ['Pop Culture', 'Fandom', 'Expo'],
    genre: ['Entertainment', 'Fan Event'],
    language: 'English',
    score: 8.6,
    duration_minutes: 210,
    host: 'Comic-Con Global',
    host_photo_sig: 34,
    performers: [
      { name: 'Celebrity Panel', role: 'Stars', photo_sig: 35 },
      { name: 'Cosplay Showcase', role: 'Featured Artists', photo_sig: 36 },
    ],
    city: 'Bengaluru',
    venue: 'San Diego Convention Center',
    image_sig_start: 120,
  },
  {
    show_type: 'Event',
    title: 'Wellness Festival: Mind & Motion',
    description: 'A wellness gathering with guided movement, meditation, nutrition talks, and live performance experiences.',
    tags: ['Health', 'Wellness', 'Lifestyle'],
    genre: ['Lifestyle', 'Health'],
    language: 'English',
    score: 8.2,
    duration_minutes: 180,
    host: 'Global Wellness Collective',
    host_photo_sig: 37,
    performers: [
      { name: 'Wellness Speakers', role: 'Keynote', photo_sig: 38 },
      { name: 'Yoga Ensemble', role: 'Live Movement', photo_sig: 39 },
    ],
    city: 'Bengaluru',
    venue: 'RAI Amsterdam',
    image_sig_start: 130,
  },
  {
    show_type: 'Event',
    title: 'International Film Critics Forum',
    description: 'A curated gathering of critics, directors, screenings, and roundtable discussions on the latest cinema releases.',
    tags: ['Film', 'Festival', 'Cinema'],
    genre: ['Film', 'Discussion'],
    language: 'English',
    score: 8.3,
    duration_minutes: 210,
    host: 'Cannes Media Group',
    host_photo_sig: 40,
    performers: [
      { name: 'Critics Panel', role: 'Moderators', photo_sig: 41 },
      { name: 'Director Spotlight', role: 'Featured Guests', photo_sig: 42 },
    ],
    city: 'Bengaluru',
    venue: 'Palais des Festivals',
    image_sig_start: 140,
  },
  {
    show_type: 'Event',
    title: 'Culinary Arts Showcase',
    description: 'A live food festival featuring chef demonstrations, tasting stages, and immersive dining experiences.',
    tags: ['Food', 'Cooking', 'Festival'],
    genre: ['Food', 'Lifestyle'],
    language: 'English',
    score: 8.1,
    duration_minutes: 190,
    host: 'Global Chef Collective',
    host_photo_sig: 43,
    performers: [
      { name: 'Chef Demonstrations', role: 'Live Cooking', photo_sig: 44 },
      { name: 'Tasting Stage', role: 'Food Experts', photo_sig: 45 },
    ],
    city: 'Bengaluru',
    venue: 'Tokyo Big Sight',
    image_sig_start: 150,
  },
  {
    show_type: 'GameEvent',
    title: 'Champions League Final',
    description: 'A world-class football championship final with elite teams, strategic drama, and iconic stadium atmosphere.',
    tags: ['Football', 'Sports', 'Final'],
    genre: ['Sports', 'Football'],
    language: 'English',
    score: 9.6,
    duration_minutes: 150,
    sport: 'Football',
    team_a: { name: 'Manchester Titans', logo_sig: 46, city: 'Bengaluru', captain: 'Ethan James' },
    team_b: { name: 'Madrid Royals', logo_sig: 47, city: 'Bengaluru', captain: 'Alejandro Silva' },
    venue: 'Olympic Stadium',
    match_round: 'Final',
    city: 'Bengaluru',
    image_sig_start: 160,
  },
  {
    show_type: 'GameEvent',
    title: 'NBA All-Star Weekend',
    description: 'A high-flying basketball showcase with celebrity matchups, slam-dunk contests, and premium fan activations.',
    tags: ['Basketball', 'Sports', 'All-Star'],
    genre: ['Sports', 'Basketball'],
    language: 'English',
    score: 9.0,
    duration_minutes: 160,
    sport: 'Basketball',
    team_a: { name: 'Skyline Shooters', logo_sig: 48, city: 'Bengaluru', captain: 'Jordan Blair' },
    team_b: { name: 'Pacific Flyers', logo_sig: 49, city: 'Bengaluru', captain: 'Mason Lee' },
    venue: 'Arena Center',
    match_round: 'All-Star',
    city: 'Bengaluru',
    image_sig_start: 170,
  },
  {
    show_type: 'GameEvent',
    title: 'World Series Showdown',
    description: 'A championship baseball series with legendary ballparks, dramatic innings, and playoff-level intensity.',
    tags: ['Baseball', 'Sports', 'Championship'],
    genre: ['Sports', 'Baseball'],
    language: 'English',
    score: 8.8,
    duration_minutes: 145,
    sport: 'Baseball',
    team_a: { name: 'Coastal Mariners', logo_sig: 171, city: 'Bengaluru', captain: 'Noah Cruz' },
    team_b: { name: 'Desert Stallions', logo_sig: 172, city: 'Bengaluru', captain: 'Liam Brooks' },
    venue: 'Diamond Field',
    match_round: 'Championship',
    city: 'Bengaluru',
    image_sig_start: 180,
  },
  {
    show_type: 'GameEvent',
    title: 'World Cup Cricket Final',
    description: 'A global cricket final with dramatic batting, precision bowling, and a champion crowned on the world stage.',
    tags: ['Cricket', 'Sports', 'Final'],
    genre: ['Sports', 'Cricket'],
    language: 'English',
    score: 9.3,
    duration_minutes: 170,
    sport: 'Cricket',
    team_a: { name: 'India Royals', logo_sig: 181, city: 'Bengaluru', captain: 'Aarav Patel' },
    team_b: { name: 'Australia Storm', logo_sig: 182, city: 'Bengaluru', captain: 'Liam Smith' },
    venue: 'International Cricket Stadium',
    match_round: 'Final',
    city: 'Bengaluru',
    image_sig_start: 190,
  },
  {
    show_type: 'GameEvent',
    title: 'Olympic Gymnastics Finals',
    description: 'A high-stakes gymnastics finale featuring elite routines, precision artistry, and Olympic-level competition.',
    tags: ['Gymnastics', 'Sports', 'Finals'],
    genre: ['Sports', 'Gymnastics'],
    language: 'English',
    score: 8.7,
    duration_minutes: 135,
    sport: 'Gymnastics',
    team_a: { name: 'East Coast Stars', logo_sig: 191, city: 'Bengaluru', captain: 'Mina Sasaki' },
    team_b: { name: 'Western Flyers', logo_sig: 192, city: 'Bengaluru', captain: 'Sophia Chen' },
    venue: 'Olympic Gym Arena',
    match_round: 'Finals',
    city: 'Bengaluru',
    image_sig_start: 200,
  },
];

async function run() {
  try {
    await mongoClient.connect();
    await pgClient.connect();

    const db = mongoClient.db('bookit');
    const showsCollection = db.collection('shows');

    console.log('Clearing MongoDB shows...');
    await showsCollection.deleteMany({});

    console.log('Clearing PostgreSQL schedules, layouts, and seats...');
    await pgClient.query('DELETE FROM schedule_seats');
    await pgClient.query('DELETE FROM schedules');
    await pgClient.query('DELETE FROM seat_layout_seats');
    await pgClient.query('DELETE FROM seat_layouts');

    console.log('Creating Base Seat Layout...');
    const layoutRes = await pgClient.query(
      `INSERT INTO seat_layouts (name, show_type, description) VALUES ($1, $2, $3) RETURNING id`,
      ['Standard Layout', 'Movie', 'Default layout for seeding']
    );
    const generatedLayoutId = layoutRes.rows[0].id;

    // Generate some basic rows for this layout
    const layoutRows = ['A', 'B', 'C', 'D', 'E'];
    let globalSeatCounter = 1;
    for (const r of layoutRows) {
      for (let s = 1; s <= 10; s++) {
        const seatClass = r === 'A' ? 'VIP' : (r === 'B' ? 'Premium' : 'Standard');
        await pgClient.query(
          `INSERT INTO seat_layout_seats (layout_id, row_letter, seat_number, seat_class) VALUES ($1, $2, $3, $4)`,
          [generatedLayoutId, r, globalSeatCounter++, seatClass]
        );
      }
    }

    let totalSchedules = 0;
    let totalShows = 0;

    for (const template of showTemplates) {
      const _id = new ObjectId();
      const scheduleBase = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const scheduleTimes = [0, 1, 2].map((offset) => {
        const date = new Date(scheduleBase.getTime() + offset * 24 * 60 * 60 * 1000);
        date.setHours(10 + offset * 4, 30, 0, 0);
        return date;
      });

      const showDoc = {
        _id,
        show_type: template.show_type,
        title: template.title,
        description: template.description,
        tags: template.tags,
        category_ids: null,
        poster_url: unsplashImage(600, 900, template.image_sig_start, template.title),
        thumbnail_url: unsplashImage(600, 900, template.image_sig_start + 1, template.title + ' thumb'),
        backdrop_url: unsplashImage(1600, 900, template.image_sig_start + 2, template.title + ' backdrop'),
        trailer_url: `https://www.youtube.com/watch?v=video${template.image_sig_start}`,
        teaser_url: `https://www.youtube.com/watch?v=teaser${template.image_sig_start}`,
        language: template.language,
        genre: template.genre,
        score: template.score,
        weight: 0,
        next_start_time: scheduleTimes[0].toISOString(),
        status: 'nowShowing',
        duration_minutes: template.duration_minutes,
        director: template.director || null,
        director_photo_url: template.director ? unsplashImage(200, 200, template.directors_photo_sig, template.title + ' director') : null,
        cast: template.cast
          ? template.cast.map((member) => ({
              name: member.name,
              role: member.role,
              photo_url: unsplashImage(200, 200, member.photo_sig, template.title + ' cast'),
            }))
          : null,
        host: template.host || null,
        host_photo_url: template.host ? unsplashImage(200, 200, template.host_photo_sig, template.title + ' host') : null,
        performers: template.performers
          ? template.performers.map((performer, index) => ({
              name: performer.name,
              role: performer.role,
              photo_url: unsplashImage(200, 200, performer.photo_sig, template.title + ' performer'),
              bio: `Live ${performer.role} for ${template.title}`,
            }))
          : null,
        sport: template.sport || null,
        team_a: template.team_a
          ? {
              name: template.team_a.name,
cd              logo_url: unsplashImage(200, 200, template.team_a.logo_sig, template.title + ' team'),
              city: template.team_a.city,
              captain: template.team_a.captain,
            }
          : null,
        team_b: template.team_b
          ? {
              name: template.team_b.name,
              logo_url: unsplashImage(200, 200, template.team_b.logo_sig, template.title + ' team'),
              city: template.team_b.city,
              captain: template.team_b.captain,
            }
          : null,
        venue: template.venue || null,
        match_round: template.match_round || null,
        city: template.city || null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      };

      await showsCollection.insertOne(showDoc);
      totalShows += 1;

      for (const startTime of scheduleTimes) {
        const endTime = addMinutes(startTime, template.duration_minutes);
        const bookingOpenAt = new Date(startTime.getTime() - 7 * 24 * 60 * 60 * 1000);
        const dateValue = startTime.toISOString().split('T')[0];
        const slot = slotForHour(startTime.getHours());

        const scheduleRes = await pgClient.query(
          `INSERT INTO schedules (mongo_show_id, show_type, layout_id, start_time, end_time, booking_open_at, created_at, date, slot, venue_name, venue_address, venue_city, venue_state)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [
            _id.toHexString(),
            template.show_type,
            generatedLayoutId,
            startTime.toISOString(),
            endTime.toISOString(),
            bookingOpenAt.toISOString(),
            new Date().toISOString(),
            dateValue,
            slot,
            template.venue || `${template.show_type} Hall`,
            `${template.venue || 'Main Street Event Center'}`,
            template.city || 'Unknown City',
            'State',
          ]
        );

        const scheduleId = scheduleRes.rows[0].id;
        await pgClient.query(
          `INSERT INTO schedule_seats (schedule_id, layout_seat_id, source, row_letter, seat_number, seat_class, price, status)
           SELECT DISTINCT ON (row_letter, seat_number) $1, id, 'base', row_letter, seat_number, seat_class,
             CASE WHEN seat_class = 'VIP' THEN 75.00 WHEN seat_class = 'Premium' THEN 45.00 ELSE 20.00 END,
             'available'
           FROM seat_layout_seats WHERE layout_id = $2`,
          [scheduleId, generatedLayoutId]
        );
        totalSchedules += 1;
      }
    }

    console.log(`Successfully seeded ${totalShows} shows and ${totalSchedules} schedules!`);
  } finally {
    await mongoClient.close();
    await pgClient.end();
  }
}

run().catch(console.error);
