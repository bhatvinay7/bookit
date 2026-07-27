const { MongoClient, ObjectId } = require('mongodb');
const { Client } = require('pg');

const mongoUri = 'mongodb+srv://bhatvinay74_db_user:ur5Sni3gnOZIjSJ1@cluster0.cz62ssn.mongodb.net/?appName=Cluster0';
const pgUri = 'postgresql://neondb_owner:npg_cCStswDNj87q@ep-quiet-base-aukgk05o-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require';

const mongoClient = new MongoClient(mongoUri);
const pgClient = new Client({ connectionString: pgUri });

async function run() {
  try {
    await mongoClient.connect();
    await pgClient.connect();

    const db = mongoClient.db('bookit');
    const shows = db.collection('shows');

    console.log('Clearing MongoDB shows...');
    await shows.deleteMany({});
    
    console.log('Clearing PostgreSQL schedules and seats...');
    await pgClient.query('DELETE FROM schedule_seats');
    await pgClient.query('DELETE FROM schedules');

    const layoutId = 3; 

    const types = ['Movie', 'Concert', 'Event', 'GameEvent'];
    
    const generateDates = () => {
      const now = new Date();
      const past = new Date(now.getTime() - 2 * 60 * 60 * 1000); 
      const near = new Date(now.getTime() + 1 * 60 * 60 * 1000); 
      const future = new Date(now.getTime() + 48 * 60 * 60 * 1000); 
      return [past, near, future];
    };

    let totalSchedules = 0;

    for (let t = 0; t < types.length; t++) {
      const type = types[t];
      console.log(`Generating 15 shows for ${type}...`);
      
      for (let i = 1; i <= 15; i++) {
        const _id = new ObjectId();
        const dates = generateDates();
        
        const nextDate = dates.find(d => d > new Date()) || dates[dates.length - 1];

        const showDoc = {
          _id,
          show_type: type,
          title: `${type} Experience ${i} - Elite Edition`,
          description: `An incredible ${type} experience that will leave you amazed. Featuring state of the art sound and visuals.`,
          tags: ['Premium', type.toLowerCase()],
          status: 'nowShowing',
          duration_minutes: 120 + i * 5,
          poster_url: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&h=900&fit=crop&auto=format',
          thumbnail_url: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&h=900&fit=crop&auto=format',
          backdrop_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&h=900&fit=crop&auto=format',
          language: 'English',
          genre: ['Epic', 'Action'],
          score: 7 + (i % 3),
          next_start_time: nextDate.toISOString(),
          created_at: new Date().toISOString(),
        };

        if (type === 'Movie') {
          showDoc.director = 'Christopher Nolan';
          showDoc.cast = [
            { name: 'Lead Actor', photo_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop' }
          ];
        } else if (type === 'Concert' || type === 'Event') {
          showDoc.host = 'Main Host';
          showDoc.performers = [
            { name: 'The Band', role: 'Headliner', photo_url: 'https://images.unsplash.com/photo-1516280440502-a25e24a0d922?w=200&h=200&fit=crop' }
          ];
        } else if (type === 'GameEvent') {
          showDoc.team_a = { name: 'Home Team', logo_url: 'https://images.unsplash.com/photo-1614028674026-a65e31bfd27c?w=200&h=200&fit=crop' };
          showDoc.team_b = { name: 'Away Team', logo_url: 'https://images.unsplash.com/photo-1629218559196-8eb5bd19242d?w=200&h=200&fit=crop' };
        }

        await shows.insertOne(showDoc);

        for (let d = 0; d < dates.length; d++) {
          const startTime = dates[d];
          const bookingOpen = new Date(startTime.getTime() - 7 * 24 * 60 * 60 * 1000);
          
          const scheduleRes = await pgClient.query(
            `INSERT INTO schedules (mongo_show_id, show_type, layout_id, start_time, booking_open_at, created_at, venue_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [_id.toHexString(), type, layoutId, startTime.toISOString(), bookingOpen.toISOString(), new Date().toISOString(), `Grand ${type} Arena`]
          );
          
          const scheduleId = scheduleRes.rows[0].id;
          
          await pgClient.query(
            `INSERT INTO schedule_seats (schedule_id, layout_seat_id, source, row_letter, seat_number, seat_class, price, status)
             SELECT DISTINCT ON (row_letter, seat_number) $1, id, 'base', row_letter, seat_number, seat_class, 
             CASE WHEN seat_class = 'VIP' THEN 50.00 WHEN seat_class = 'Premium' THEN 30.00 ELSE 15.00 END,
             'available'
             FROM seat_layout_seats WHERE layout_id = $2`,
            [scheduleId, layoutId]
          );
          
          totalSchedules++;
        }
      }
    }
    
    console.log(`Successfully seeded 60 shows and ${totalSchedules} schedules!`);

  } finally {
    await mongoClient.close();
    await pgClient.end();
  }
}

run().catch(console.error);
