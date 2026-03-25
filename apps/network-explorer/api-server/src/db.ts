import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 60,
  connect_timeout: 10,
  connection: {
    statement_timeout: 30000,
  },
});

// Points DB (separate database, survives devnet resets)
const POINTS_DATABASE_URL = process.env.POINTS_DATABASE_URL;
export const pointsDb = POINTS_DATABASE_URL
  ? postgres(POINTS_DATABASE_URL, {
      max: 5,
      idle_timeout: 60,
      connect_timeout: 10,
      connection: {
        statement_timeout: 30000,
      },
    })
  : null;
