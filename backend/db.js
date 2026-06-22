// PostgreSQL connection + small query helpers.
//
// Reads DATABASE_URL from the environment (Render/Heroku style connection string).
// Provides thin async helpers so route code reads close to the old sqlite3 style:
//   all(sql, params)  -> Promise<rows[]>
//   get(sql, params)  -> Promise<row | undefined>
//   run(sql, params)  -> Promise<{ rowCount, rows }>
//
// SQL uses $1, $2, ... placeholders (Postgres), not '?'.
const { Pool, types } = require('pg');

// ---- Timezone-safe timestamp/date handling ----
// By default the pg driver converts TIMESTAMP/DATE columns into JS Date objects
// interpreted in the SERVER's timezone (Render runs in UTC). For this app, clock
// times (clock_in/clock_out) and calendar dates are "wall-clock" values with no
// timezone meaning — converting them shifts the displayed time (EDT -> GMT). So we
// override the parsers to return the RAW value as a string, normalized to ISO form
// (space -> 'T') so the existing frontend parsers keep working. No timezone math,
// ever — what was entered is exactly what comes back.
const OID_TIMESTAMP = 1114;        // timestamp without time zone
const OID_TIMESTAMPTZ = 1184;      // timestamp with time zone
const OID_DATE = 1082;             // date
types.setTypeParser(OID_TIMESTAMP, (v) => (v == null ? v : String(v).replace(' ', 'T')));
types.setTypeParser(OID_TIMESTAMPTZ, (v) => (v == null ? v : String(v).replace(' ', 'T')));
types.setTypeParser(OID_DATE, (v) => v); // already 'YYYY-MM-DD'

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
