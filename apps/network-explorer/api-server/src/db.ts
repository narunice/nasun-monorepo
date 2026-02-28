import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = postgres(DATABASE_URL, {
  max: 75,
  idle_timeout: 60,
  connect_timeout: 10,
  connection: {
    statement_timeout: 30000,
  },
});
