// PostgreSQL connection + small query helpers.
//
// Reads DATABASE_URL from the environment (Render/Heroku style connection string).
// Provides thin async helpers so route code reads close to the old sqlite3 style:
//   all(sql, params)  -> Promise<rows[]>
//   get(sql, params)  -> Promise<row | undefined>
//   run(sql, params)  -> Promise<{ rowCount, rows }>
//
// SQL uses $1, $2, ... placeholders (Postgres), not '?'.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn(
    '[db] DATABASE_URL is not set. Set it in the environment (e.g. a Render Postgres ' +
    'connection string) before starting the server in production.'
  );
}

// On Render and most managed Postgres, SSL is required. Locally it usually is not.
// PGSSL=disable forces it off for local dev against a plain Postgres.
const useSSL = process.env.PGSSL !== 'disable' && process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error:', err);
});

// Run a query and return all rows.
const all = async (text, params = []) => {
  const result = await pool.query(text, params);
  return result.rows;
};

// Run a query and return the first row (or undefined).
const get = async (text, params = []) => {
  const result = await pool.query(text, params);
  return result.rows[0];
};

// Run a query for its side effect; returns { rowCount, rows }.
// Add "RETURNING *" to your SQL when you need the inserted/updated row back.
const run = async (text, params = []) => {
  const result = await pool.query(text, params);
  return { rowCount: result.rowCount, rows: result.rows };
};

module.exports = { pool, all, get, run };
