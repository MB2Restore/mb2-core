require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// PostgreSQL helpers (async). SQL uses $1,$2,... placeholders.
const { pool, all, get, run } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// JWT secret — set JWT_SECRET in the environment for production.
const JWT_SECRET = process.env.JWT_SECRET || 'mb2-core-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '30d';

const isBcryptHash = (str) => typeof str === 'string' && /^\$2[aby]\$/.test(str);
const hashPassword = (plain) => bcrypt.hashSync(plain, 10);

// Middleware
// CORS allowlist: only these origins may call the API. Add/adjust via the
// CORS_ORIGINS env var (comma-separated) without changing code. Localhost is
// always allowed for development. Requests with no Origin (curl, health checks,
// same-origin) are allowed through.
const defaultOrigins = [
  'https://core.mb2restore.com',
  'https://super-kangaroo-4e4b87.netlify.app'
];
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // non-browser or same-origin
    if (origin.startsWith('http://localhost')) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS: ' + origin));
  }
}));
app.use(bodyParser.json({ limit: '15mb' }));
app.use(bodyParser.urlencoded({ limit: '15mb', extended: true }));

// ===== DATABASE SCHEMA =====
// Postgres-native. Full schema created up front (no PRAGMA auto-migration needed).
const initializeDatabase = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      address TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'Lead',
      lead_source TEXT,
      assigned_to TEXT,
      start_date DATE,
      estimated_completion DATE,
      amount NUMERIC(12, 2),
      notes TEXT,
      customer_email TEXT,
      date_received DATE DEFAULT CURRENT_DATE,
      date_completed DATE,
      date_invoiced DATE,
      project_amount NUMERIC(12, 2),
      mitigation_amount NUMERIC(12, 2),
      repair_amount NUMERIC(12, 2),
      other_amount NUMERIC(12, 2),
      insurance_notes TEXT,
      next_steps TEXT,
      docusketch_url TEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      technician_id TEXT,
      technician_name TEXT,
      clock_in TIMESTAMP,
      clock_out TIMESTAMP,
      duration_minutes INTEGER,
      date DATE,
      notes TEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      time_entry_id TEXT,
      technician_id TEXT,
      technician_name TEXT,
      amount NUMERIC(12, 2),
      category TEXT,
      date DATE,
      vendor TEXT,
      description TEXT,
      photo_url TEXT,
      status TEXT DEFAULT 'pending',
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_date TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      password TEXT,
      role TEXT DEFAULT 'field',
      active BOOLEAN DEFAULT TRUE,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS project_notes (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_by TEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default admin if no users exist
  const row = await get('SELECT COUNT(*)::int AS count FROM users');
  if (row && row.count === 0) {
    await run(
      `INSERT INTO users (id, name, email, role, password, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [uuidv4(), 'DJ Haskins', 'djh@mb2cares.com', 'admin', hashPassword('admin123')]
    );
    console.log('Seeded default admin: djh@mb2cares.com / admin123');
  }

  console.log('Database schema initialized');
};

// Small wrapper so async route handlers forward errors to a 500 instead of crashing.
const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('Route error:', err.message);
  res.status(500).json({ error: err.message });
});

// ===== CUSTOMER ENDPOINTS =====

app.get('/api/customers', h(async (req, res) => {
  const rows = await all('SELECT * FROM customers ORDER BY created_date DESC');
  res.json(rows);
}));

app.get('/api/customers/:id', h(async (req, res) => {
  const row = await get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  res.json(row);
}));

// Create or get customer (dedupe on name + phone)
app.post('/api/customers', h(async (req, res) => {
  const { name, email, phone, address } = req.body;
  const existing = await get('SELECT * FROM customers WHERE name = $1 AND phone = $2', [name, phone]);
  if (existing) return res.json(existing);

  const customerId = uuidv4();
  await run(
    'INSERT INTO customers (id, name, email, phone, address) VALUES ($1, $2, $3, $4, $5)',
    [customerId, name, email, phone, address]
  );
  res.json({ id: customerId, name, email, phone, address, created_date: new Date() });
}));

app.put('/api/customers/:id', h(async (req, res) => {
  const { name, email, phone, address } = req.body;
  await run(
    'UPDATE customers SET name = $1, email = $2, phone = $3, address = $4 WHERE id = $5',
    [name, email, phone, address, req.params.id]
  );
  res.json({ success: true });
}));

// ===== JOB ENDPOINTS =====

app.get('/api/jobs', h(async (req, res) => {
  const rows = await all(`
    SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
    FROM jobs j
    LEFT JOIN customers c ON j.customer_id = c.id
    ORDER BY j.created_date DESC
  `);
  res.json(rows);
}));

app.get('/api/jobs/:id', h(async (req, res) => {
  const row = await get(`
    SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
    FROM jobs j
    LEFT JOIN customers c ON j.customer_id = c.id
    WHERE j.id = $1
  `, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  res.json(row);
}));

app.post('/api/jobs', h(async (req, res) => {
  const { customer_id, nickname, address, type, lead_source, emergency } = req.body;
  const jobId = uuidv4();
  const today = new Date().toISOString().split('T')[0];
  const status = emergency ? 'In Process' : 'Lead';

  await run(
    `INSERT INTO jobs (id, customer_id, nickname, address, type, status, lead_source, date_received)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [jobId, customer_id, nickname, address, type, status, lead_source, today]
  );
  res.json({ id: jobId, customer_id, nickname, address, type, status, lead_source, date_received: today });
}));

// Update job — dynamic column set, $N placeholders
app.put('/api/jobs/:id', h(async (req, res) => {
  const b = req.body;
  const fields = [
    'nickname', 'address', 'type', 'status', 'lead_source', 'date_received',
    'assigned_to', 'notes', 'amount', 'customer_email', 'start_date',
    'date_completed', 'date_invoiced', 'project_amount', 'mitigation_amount',
    'repair_amount', 'other_amount', 'insurance_notes', 'next_steps', 'docusketch_url'
  ];
  // These columns coerce '' to NULL (dates / numerics)
  const nullable = new Set([
    'date_received', 'start_date', 'date_completed', 'date_invoiced',
    'project_amount', 'mitigation_amount', 'repair_amount', 'other_amount', 'amount'
  ]);

  const updates = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (b[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(nullable.has(f) ? (b[f] || null) : b[f]);
    }
  }

  updates.push('updated_date = CURRENT_TIMESTAMP');
  if (updates.length === 1) return res.json({ success: true });

  values.push(req.params.id);
  await run(`UPDATE jobs SET ${updates.join(', ')} WHERE id = $${i}`, values);
  res.json({ success: true });
}));

// ===== TIME ENTRY ENDPOINTS =====

app.get('/api/jobs/:jobId/time-entries', h(async (req, res) => {
  const rows = await all(
    'SELECT * FROM time_entries WHERE job_id = $1 ORDER BY clock_in DESC',
    [req.params.jobId]
  );
  res.json(rows);
}));

app.get('/api/time-entries', h(async (req, res) => {
  const rows = await all(`
    SELECT te.*, j.nickname AS job_name, j.address AS job_address
    FROM time_entries te
    LEFT JOIN jobs j ON te.job_id = j.id
    ORDER BY te.clock_in DESC
  `);
  res.json(rows);
}));

app.post('/api/time-entries/manual', h(async (req, res) => {
  const { job_id, technician_id, technician_name, date, clock_in, clock_out, duration_minutes, notes } = req.body;
  const entryId = uuidv4();
  await run(
    `INSERT INTO time_entries (id, job_id, technician_id, technician_name, clock_in, clock_out, date, duration_minutes, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [entryId, job_id, technician_id, technician_name || null, clock_in, clock_out, date, duration_minutes, notes || null]
  );
  res.json({ id: entryId, job_id, technician_id, technician_name, clock_in, clock_out, date, duration_minutes, notes });
}));

app.put('/api/time-entries/:id', h(async (req, res) => {
  const b = req.body;
  const fields = ['job_id', 'technician_name', 'date', 'clock_in', 'clock_out', 'duration_minutes', 'notes'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (b[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(b[f]); }
  }
  if (updates.length === 0) return res.json({ success: true });

  values.push(req.params.id);
  const { rowCount } = await run(`UPDATE time_entries SET ${updates.join(', ')} WHERE id = $${i}`, values);
  if (rowCount === 0) return res.status(404).json({ error: 'Time entry not found' });
  res.json({ success: true });
}));

app.delete('/api/time-entries/:id', h(async (req, res) => {
  const { rowCount } = await run('DELETE FROM time_entries WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Time entry not found' });
  res.json({ success: true });
}));

app.post('/api/time-entries/clock-in', h(async (req, res) => {
  const { job_id, technician_id } = req.body;
  const entryId = uuidv4();
  const now = new Date().toISOString();
  const date = now.split('T')[0];
  await run(
    `INSERT INTO time_entries (id, job_id, technician_id, clock_in, date) VALUES ($1, $2, $3, $4, $5)`,
    [entryId, job_id, technician_id, now, date]
  );
  res.json({ id: entryId, job_id, technician_id, clock_in: now, date });
}));

app.post('/api/time-entries/:id/clock-out', h(async (req, res) => {
  const clockOut = new Date().toISOString();
  const row = await get('SELECT clock_in FROM time_entries WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Time entry not found' });

  const durationMinutes = Math.round((new Date(clockOut) - new Date(row.clock_in)) / 60000);
  await run(
    'UPDATE time_entries SET clock_out = $1, duration_minutes = $2 WHERE id = $3',
    [clockOut, durationMinutes, req.params.id]
  );
  res.json({ id: req.params.id, clock_out: clockOut, duration_minutes: durationMinutes });
}));

// ===== RECEIPT ENDPOINTS =====
//
// Photo storage is handled by ./storage — Cloudflare R2 in production (when the
// R2_* env vars are set) or local disk for development. savePhoto/deletePhoto are async.
const express_static = express.static;
const { savePhoto, deletePhoto, R2_ENABLED, uploadsDir } = require('./storage');

// When using local-disk storage, serve the uploads folder. (No-op route under R2,
// but harmless — R2 URLs are absolute and never hit this path.)
if (!R2_ENABLED) {
  app.use('/uploads', express_static(uploadsDir));
}

app.get('/api/jobs/:jobId/receipts', h(async (req, res) => {
  const rows = await all('SELECT * FROM receipts WHERE job_id = $1 ORDER BY date DESC', [req.params.jobId]);
  res.json(rows);
}));

app.get('/api/receipts', h(async (req, res) => {
  const rows = await all(`
    SELECT r.*, j.nickname AS job_name, j.address AS job_address
    FROM receipts r
    LEFT JOIN jobs j ON r.job_id = j.id
    ORDER BY r.date DESC
  `);
  res.json(rows);
}));

app.post('/api/receipts', h(async (req, res) => {
  const { job_id, technician_id, technician_name, amount, description, vendor, date, photo } = req.body;
  if (!job_id) return res.status(400).json({ error: 'A job is required' });

  const photo_url = await savePhoto(photo);
  const receiptId = uuidv4();
  const receiptDate = date || new Date().toISOString().split('T')[0];

  await run(
    `INSERT INTO receipts (id, job_id, technician_id, technician_name, amount, description, vendor, date, photo_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [receiptId, job_id, technician_id || null, technician_name || null, amount || null,
     description || null, vendor || null, receiptDate, photo_url]
  );
  res.json({ id: receiptId, job_id, technician_id, technician_name, amount, description, vendor, date: receiptDate, photo_url });
}));

app.put('/api/receipts/:id', h(async (req, res) => {
  const b = req.body;
  const fields = ['job_id', 'amount', 'description', 'vendor', 'date'];
  const nullable = new Set(['amount']);
  const updates = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (b[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(nullable.has(f) ? (b[f] || null) : b[f]);
    }
  }

  if (b.photo && typeof b.photo === 'string' && b.photo.startsWith('data:image')) {
    const newUrl = await savePhoto(b.photo);
    if (newUrl) { updates.push(`photo_url = $${i++}`); values.push(newUrl); }
  }

  updates.push('updated_date = CURRENT_TIMESTAMP');
  if (updates.length === 1) return res.json({ success: true });

  values.push(req.params.id);
  const { rowCount } = await run(`UPDATE receipts SET ${updates.join(', ')} WHERE id = $${i}`, values);
  if (rowCount === 0) return res.status(404).json({ error: 'Receipt not found' });
  res.json({ success: true });
}));

app.delete('/api/receipts/:id', h(async (req, res) => {
  const row = await get('SELECT photo_url FROM receipts WHERE id = $1', [req.params.id]);
  const { rowCount } = await run('DELETE FROM receipts WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Receipt not found' });
  if (row && row.photo_url) {
    await deletePhoto(row.photo_url);
  }
  res.json({ success: true });
}));

// ===== PROJECT NOTES ENDPOINTS =====

app.get('/api/jobs/:jobId/notes', h(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;
  const rows = await all(
    `SELECT id, job_id, note_text, created_by, created_date
     FROM project_notes WHERE job_id = $1
     ORDER BY created_date DESC LIMIT $2 OFFSET $3`,
    [req.params.jobId, limit, offset]
  );
  res.json(rows);
}));

app.post('/api/jobs/:jobId/notes', h(async (req, res) => {
  const { note_text, created_by } = req.body;
  if (!note_text || note_text.trim().length === 0) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  const noteId = uuidv4();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO project_notes (id, job_id, note_text, created_by, created_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [noteId, req.params.jobId, note_text, created_by || 'Unknown', now]
  );
  res.json({ id: noteId, job_id: req.params.jobId, note_text, created_by: created_by || 'Unknown', created_date: now });
}));

// ===== AUTH & USER ENDPOINTS =====
// Passwords hashed with bcryptjs; sessions via signed JWT. Legacy plain-text
// passwords auto-upgrade to bcrypt on first successful login. Roles: admin, office, field.

const safeUser = (u) => {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
};

// Postgres unique-violation error code
const isUniqueViolation = (err) => err && err.code === '23505';

// Read the current user from a signed JWT in the Authorization header
const getUserFromToken = async (req) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null; // invalid/expired
  }
  const row = await get('SELECT * FROM users WHERE id = $1 AND active = TRUE', [payload.id]);
  return row || null;
};

const issueToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Middleware: require any logged-in active user
const requireAuth = (req, res, next) => {
  getUserFromToken(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      req.user = user;
      next();
    })
    .catch((err) => res.status(500).json({ error: err.message }));
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Delete a job and its child records (time entries, receipts, project notes).
// Office or Admin only. Photos for the job's receipts are removed from storage too.
app.delete('/api/jobs/:id', requireAuth, h(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'office') {
    return res.status(403).json({ error: 'Office or Admin access required to delete jobs' });
  }
  const jobId = req.params.id;

  const job = await get('SELECT id FROM jobs WHERE id = $1', [jobId]);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Clean up receipt photos from storage before deleting the rows
  const photos = await all('SELECT photo_url FROM receipts WHERE job_id = $1', [jobId]);
  for (const p of photos) {
    if (p.photo_url) { try { await deletePhoto(p.photo_url); } catch (e) { /* ignore */ } }
  }

  // Delete children first (no DB-level cascade defined), then the job
  await run('DELETE FROM receipts WHERE job_id = $1', [jobId]);
  await run('DELETE FROM time_entries WHERE job_id = $1', [jobId]);
  await run('DELETE FROM project_notes WHERE job_id = $1', [jobId]);
  await run('DELETE FROM jobs WHERE id = $1', [jobId]);

  res.json({ success: true });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = await get('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.active) return res.status(403).json({ error: 'This account is deactivated' });

  const stored = user.password || '';
  let ok = false;
  if (isBcryptHash(stored)) {
    ok = bcrypt.compareSync(password, stored);
  } else {
    ok = stored === password;
    if (ok) {
      // self-heal: upgrade legacy plain-text password to a hash
      await run('UPDATE users SET password = $1 WHERE id = $2', [hashPassword(password), user.id]);
    }
  }
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token: issueToken(user), user: safeUser(user) });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

app.post('/api/auth/change-password', requireAuth, h(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  const stored = req.user.password || '';
  const currentOk = isBcryptHash(stored)
    ? bcrypt.compareSync(currentPassword, stored)
    : stored === currentPassword;
  if (!currentOk) return res.status(400).json({ error: 'Current password is incorrect' });

  await run('UPDATE users SET password = $1 WHERE id = $2', [hashPassword(newPassword), req.user.id]);
  res.json({ success: true });
}));

app.get('/api/users', requireAuth, requireAdmin, h(async (req, res) => {
  const rows = await all('SELECT * FROM users ORDER BY name ASC');
  res.json(rows.map(safeUser));
}));

app.get('/api/users/active', requireAuth, h(async (req, res) => {
  const rows = await all("SELECT id, name, email, role FROM users WHERE active = TRUE ORDER BY name ASC");
  res.json(rows);
}));

app.get('/api/users/all', requireAuth, h(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'office') {
    return res.status(403).json({ error: 'Office or Admin access required' });
  }
  const rows = await all("SELECT id, name, email, role, active FROM users ORDER BY active DESC, name ASC");
  res.json(rows);
}));

app.post('/api/users', requireAuth, requireAdmin, h(async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  const validRoles = ['admin', 'office', 'field'];
  const userRole = validRoles.includes(role) ? role : 'field';
  const userId = uuidv4();
  try {
    await run(
      `INSERT INTO users (id, name, email, phone, password, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [userId, name, email, phone || null, hashPassword(password), userRole]
    );
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ error: 'A user with that email already exists' });
    throw err;
  }
  res.json(safeUser({ id: userId, name, email, phone, role: userRole, active: true }));
}));

app.put('/api/users/:id', requireAuth, requireAdmin, h(async (req, res) => {
  const { name, email, phone, role, active, password } = req.body;
  const updates = [];
  const values = [];
  let i = 1;

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
  if (email !== undefined) { updates.push(`email = $${i++}`); values.push(email); }
  if (phone !== undefined) { updates.push(`phone = $${i++}`); values.push(phone); }
  if (role !== undefined) {
    if (!['admin', 'office', 'field'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    updates.push(`role = $${i++}`); values.push(role);
  }
  if (active !== undefined) { updates.push(`active = $${i++}`); values.push(!!active); }
  if (password !== undefined && password !== '') { updates.push(`password = $${i++}`); values.push(hashPassword(password)); }

  if (updates.length === 0) return res.json({ success: true });

  // Guard: don't let an admin deactivate or demote the last active admin
  const wouldRemoveAdmin =
    (active !== undefined && !active) ||
    (role !== undefined && role !== 'admin');

  if (wouldRemoveAdmin) {
    const target = await get('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (target && target.role === 'admin') {
      const row = await get("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND active = TRUE");
      if (row.count <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate or demote the last active admin' });
      }
    }
  }

  values.push(req.params.id);
  try {
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ error: 'A user with that email already exists' });
    throw err;
  }
  res.json({ success: true });
}));

// ===== WEEKLY RECAP ENDPOINTS (office ops + field) =====
const { buildOfficeRecap, officeRecapHtml, buildFieldRecap, fieldRecapHtml } = require('./recap');

const fetchAllJobsForRecap = () =>
  all(`SELECT j.*, c.name AS customer_name FROM jobs j LEFT JOIN customers c ON j.customer_id = c.id`);

app.get('/api/recap/office', requireAuth, h(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'office') {
    return res.status(403).json({ error: 'Office or Admin access required' });
  }
  const jobs = await fetchAllJobsForRecap();
  const recap = buildOfficeRecap(jobs, req.query.week);
  if (req.query.format === 'json') return res.json(recap);
  res.set('Content-Type', 'text/html').send(officeRecapHtml(recap));
}));

app.get('/api/recap/field/:userId', requireAuth, h(async (req, res) => {
  const targetId = req.params.userId;
  const isManager = req.user.role === 'admin' || req.user.role === 'office';
  if (!isManager && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const user = await get('SELECT id, name FROM users WHERE id = $1', [targetId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const times = await all(
    `SELECT te.*, j.nickname AS job_name FROM time_entries te LEFT JOIN jobs j ON te.job_id = j.id WHERE te.technician_id = $1`,
    [targetId]
  );
  const receipts = await all(
    `SELECT r.*, j.nickname AS job_name FROM receipts r LEFT JOIN jobs j ON r.job_id = j.id WHERE r.technician_id = $1`,
    [targetId]
  );
  const recap = buildFieldRecap(user.name, times || [], receipts || [], req.query.week);
  if (req.query.format === 'json') return res.json(recap);
  res.set('Content-Type', 'text/html').send(fieldRecapHtml(recap));
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running' });
});

// Start server after the schema is ready
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`MB2 Core backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(0);
});
