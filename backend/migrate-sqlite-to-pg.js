// One-time data migration: copy existing SQLite data into PostgreSQL.
//
// Use this to seed a fresh Postgres database (staging or production) with the
// data currently in backend/mb2restore.db.
//
// PREREQUISITES (run locally, where npm works):
//   npm install            # installs pg, dotenv, etc.
//   npm install sqlite3    # the reader side (dev-only; not a server dependency)
//
// USAGE:
//   DATABASE_URL="postgres://user:pass@host:5432/dbname" node migrate-sqlite-to-pg.js
//   (or put DATABASE_URL in backend/.env and just run: node migrate-sqlite-to-pg.js)
//
// SAFETY: this INSERTs rows. It skips rows whose id already exists (idempotent-ish),
// so re-running won't duplicate. It does NOT delete anything in Postgres.

require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { pool, run, get } = require('./db');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'mb2restore.db');

// Tables to copy, in FK-safe order (customers before jobs, jobs before children).
// For each: the SQLite source columns we read. Postgres columns share the same names.
const TABLES = [
  { name: 'customers', cols: ['id','name','email','phone','address','created_date'] },
  { name: 'jobs', cols: ['id','customer_id','nickname','address','type','status','lead_source','assigned_to','start_date','estimated_completion','amount','notes','customer_email','date_received','date_completed','date_invoiced','project_amount','mitigation_amount','repair_amount','other_amount','insurance_notes','next_steps','docusketch_url','created_date','updated_date'] },
  { name: 'time_entries', cols: ['id','job_id','technician_id','technician_name','clock_in','clock_out','duration_minutes','date','notes','created_date'] },
  { name: 'receipts', cols: ['id','job_id','time_entry_id','technician_id','technician_name','amount','category','date','vendor','description','photo_url','status','created_date','updated_date'] },
  { name: 'users', cols: ['id','name','email','phone','password','role','active','created_date'] },
  { name: 'project_notes', cols: ['id','job_id','note_text','created_by','created_date'] }
];

// Read all rows from a SQLite table (only the columns that actually exist there).
function readSqlite(sdb, table, wantedCols) {
  return new Promise((resolve, reject) => {
    sdb.all(`PRAGMA table_info(${table})`, (err, info) => {
      if (err) return reject(err);
      const have = new Set(info.map((c) => c.name));
      const cols = wantedCols.filter((c) => have.has(c));
      if (cols.length === 0) return resolve({ cols: [], rows: [] });
      sdb.all(`SELECT ${cols.join(',')} FROM ${table}`, (err2, rows) => {
        if (err2) return reject(err2);
        resolve({ cols, rows });
      });
    });
  });
}

// Coerce SQLite values to what Postgres expects (mainly: boolean active, 0/1 -> bool).
function coerce(table, col, val) {
  if (val === undefined) return null;
  if (table === 'users' && col === 'active') return val === 1 || val === true || val === '1';
  return val;
}

async function migrate() {
  console.log(`Reading SQLite from: ${SQLITE_PATH}`);
  const sdb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY);

  let grandTotal = 0;
  for (const t of TABLES) {
    const { cols, rows } = await readSqlite(sdb, t.name, t.cols);
    if (rows.length === 0) {
      console.log(`  ${t.name}: 0 rows (skipped)`);
      continue;
    }
    let inserted = 0, skipped = 0;
    for (const row of rows) {
      // Skip if a row with this id already exists in Postgres
      const exists = await get(`SELECT 1 FROM ${t.name} WHERE id = $1`, [row.id]);
      if (exists) { skipped++; continue; }

      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const values = cols.map((c) => coerce(t.name, c, row[c]));
      await run(
        `INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${placeholders})`,
        values
      );
      inserted++;
    }
    grandTotal += inserted;
    console.log(`  ${t.name}: ${inserted} inserted, ${skipped} skipped (already present)`);
  }

  sdb.close();
  await pool.end();
  console.log(`\nDone. ${grandTotal} new rows migrated into Postgres.`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
