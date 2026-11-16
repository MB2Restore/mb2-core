// ===== BILLING STATEMENTS (direct-bill work) =====
// Design: project doc "Billing_Statements.md".
// - A Billing Statement explains the charges; the Controller then creates the invoice in
//   QuickBooks Desktop. No invoice number or payment terms here.
// - One statement per job (a second visit gets its own job).
// - Numbering: year + 3-digit sequence starting at 101, resets each January (2026101, 2026102…).
// - Lines come from an Admin-editable rate list. Each statement copies the rates it was made
//   with, so later price changes never alter old statements.
// - Saving creates a PDF on the MB2 letterhead, attaches it to the job's Documents and sets
//   the job's Mitigation amount (Project Total recalculated).
// - "Send to Controller" emails the PDF to every active Admin. Editing a sent statement marks
//   it "changed" until it is sent again.
// Postgres returns NUMERIC as strings, so money is parseFloat'ed on the way out.

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { pool } = require('./db');
const { saveDocument, deletePhoto } = require('./storage');
const { sendEmail } = require('./email');

const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const KINDS = ['one_time', 'daily', 'hourly', 'misc'];

// Starting rate list (DJ, Nov 16, 2026). Only used when the table is empty.
const DEFAULT_RATES = [
  { name: 'Emergency service call – during business hours', kind: 'one_time', rate: 195, exclusive_group: 'emergency_call' },
  { name: 'Emergency service call – after business hours', kind: 'one_time', rate: 275, exclusive_group: 'emergency_call' },
  { name: 'Dehumidifier', kind: 'daily', rate: 105 },
  { name: 'Air Mover', kind: 'daily', rate: 25 },
  { name: 'Negative air fan / Air scrubber', kind: 'daily', rate: 70.5 },
  { name: 'Water Extraction & Remediation', kind: 'hourly', rate: 65 },
  { name: 'Water Extraction & Remediation – After Hours', kind: 'hourly', rate: 100 },
  { name: 'Project Management', kind: 'hourly', rate: 80 },
  { name: 'Equipment setup, take down, and monitoring', kind: 'hourly', rate: 65 },
];

const initBillingTables = async (run, get) => {
  await run(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS billing_customer_name TEXT`);
  await run(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS billing_address TEXT`);
  await run(`
    CREATE TABLE IF NOT EXISTS rate_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,                 -- 'one_time' | 'daily' | 'hourly'
      rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
      exclusive_group TEXT,               -- items in the same group: only one per statement
      sort_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      updated_by TEXT,
      updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS billing_statements (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'sent' | 'changed'
      statement_date DATE,
      date_of_loss DATE,
      service_start DATE,
      service_end DATE,
      description TEXT,
      bill_to_name TEXT,
      bill_to_address TEXT,
      property_contact TEXT,
      property_address TEXT,
      work_type TEXT,
      total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      pdf_url TEXT,
      document_id TEXT,
      created_by TEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sent_by TEXT,
      sent_date TIMESTAMP,
      sent_to TEXT,
      UNIQUE (year, seq)
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS billing_statement_lines (
      id TEXT PRIMARY KEY,
      statement_id TEXT NOT NULL,
      rate_item_id TEXT,
      kind TEXT NOT NULL,
      description TEXT NOT NULL,
      units NUMERIC(10, 2),
      quantity NUMERIC(10, 2),
      rate NUMERIC(12, 2),
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      sort_order INTEGER
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_bsl_statement ON billing_statement_lines (statement_id)`);

  const row = await get('SELECT COUNT(*)::int AS n FROM rate_items');
  if (row && row.n === 0) {
    let i = 0;
    for (const r of DEFAULT_RATES) {
      await run(
        'INSERT INTO rate_items (id, name, kind, rate, exclusive_group, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
        [uuidv4(), r.name, r.kind, r.rate, r.exclusive_group || null, i++]
      );
    }
    console.log('Seeded billing rate list');
  }
};

const shapeRate = (r) => ({ ...r, rate: num(r.rate) });
const shapeStatement = (s) => s && ({ ...s, total: num(s.total) });
const shapeLine = (l) => ({ ...l, units: num(l.units), quantity: num(l.quantity), rate: num(l.rate), amount: num(l.amount) });

// ---------- Line math (server is the source of truth) ----------
// Input lines: { rate_item_id, units, quantity } for rate-list items, or
//              { kind: 'misc', description, amount } for Miscellaneous.
const buildLines = (input, rateItems) => {
  const byId = new Map(rateItems.map((r) => [r.id, r]));
  const out = []; const groups = new Map();
  for (const l of input || []) {
    if (l.kind === 'misc' || !l.rate_item_id) {
      const description = String(l.description || '').trim();
      const amount = round2(parseFloat(l.amount) || 0);
      if (!description && !amount) continue;
      if (!description) throw Object.assign(new Error('Each Miscellaneous line needs a description.'), { status: 400 });
      out.push({ rate_item_id: null, kind: 'misc', description, units: null, quantity: null, rate: null, amount });
      continue;
    }
    const item = byId.get(l.rate_item_id);
    if (!item) throw Object.assign(new Error('A line refers to a rate that no longer exists. Refresh and try again.'), { status: 400 });
    const rate = num(item.rate);
    let units = null, quantity = null, amount;
    if (item.kind === 'one_time') { quantity = 1; amount = rate; }
    else if (item.kind === 'daily') {
      units = parseFloat(l.units) || 0; quantity = parseFloat(l.quantity) || 0;
      if (!units || !quantity) continue;
      amount = round2(units * quantity * rate);
    } else {
      quantity = parseFloat(l.quantity) || 0;
      if (!quantity) continue;
      amount = round2(quantity * rate);
    }
    if (units < 0 || quantity < 0) throw Object.assign(new Error('Units and days/hours must be positive.'), { status: 400 });
    if (item.exclusive_group) {
      if (groups.has(item.exclusive_group)) {
        throw Object.assign(new Error('Only one emergency service call per statement (business hours OR after hours).'), { status: 400 });
      }
      groups.set(item.exclusive_group, true);
    }
    out.push({ rate_item_id: item.id, kind: item.kind, description: item.name, units, quantity, rate, amount });
  }
  return out.map((l, i) => ({ ...l, sort_order: i }));
};

// Today's date in Eastern time as YYYY-MM-DD (the app's business timezone).
const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// ---------- PDF on the MB2 letterhead ----------
// Standard PDF fonts only cover basic Latin, so swap characters they can't draw.
const pdfSafe = (s) => String(s ?? '')
  .replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"')
  .replace(/—/g, '-').replace(/…/g, '...').replace(/[   ]/g, ' ')
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–•€]/g, '');
const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return `${m}/${d}/${y}`;
};
const longDate = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const qtyText = (l) => {
  const n = (v) => (Number.isInteger(v) ? String(v) : String(v));
  if (l.kind === 'daily') return `${n(l.units)} unit${l.units === 1 ? '' : 's'} × ${n(l.quantity)} day${l.quantity === 1 ? '' : 's'}`;
  if (l.kind === 'hourly') return `${n(l.quantity)} hour${l.quantity === 1 ? '' : 's'}`;
  return '1';
};
const rateText = (l) => (l.kind === 'daily' ? `${money(l.rate)}/day` : l.kind === 'hourly' ? `${money(l.rate)}/hr` : l.kind === 'one_time' ? money(l.rate) : '–');

const LOGO_PATH = path.join(__dirname, 'assets', 'mb2-letterhead-logo.png');

async function buildStatementPdf(st, lines) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Billing Statement ${st.number}`);
  doc.setAuthor('MB2 Restore LLC');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await doc.embedPng(fs.readFileSync(LOGO_PATH)); } catch (e) { /* letterhead logo missing: text header instead */ }

  const W = 612, H = 792, M = 54, BOTTOM = 60;
  const black = rgb(0.07, 0.07, 0.07), grey = rgb(0.3, 0.3, 0.3), rule = rgb(0.6, 0.6, 0.6), band = rgb(0.9, 0.9, 0.9);
  let page, y;

  const wrap = (text, f, size, maxW) => {
    const out = [];
    for (const para of pdfSafe(text).split(/\n/)) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) <= maxW) line = t;
        else { if (line) out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  };
  const text = (s, x, yy, f = font, size = 10, color = black) => page.drawText(pdfSafe(s), { x, y: yy, size, font: f, color });
  const right = (s, xr, yy, f = font, size = 10) => text(s, xr - f.widthOfTextAtSize(pdfSafe(s), size), yy, f, size);
  const footer = () => {
    const parts = ['MB2 Restore LLC', '933 Islington Street Portsmouth, NH 03801', 'mb2restore.com'];
    const fy = 30;
    text(parts[0], M + 20, fy, font, 8, grey);
    const mid = parts[1]; text(mid, W / 2 - font.widthOfTextAtSize(mid, 8) / 2, fy, font, 8, grey);
    right(parts[2], W - M - 20, fy, font, 8);
  };
  const newPage = (first) => {
    page = doc.addPage([W, H]);
    footer();
    y = H - 40;
    if (first && logo) {
      const lw = 175, lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: W / 2 - lw / 2, y: y - lh, width: lw, height: lh });
      y -= lh + 22;
    } else if (first) {
      text('MB2 RESTORE LLC', M, y - 14, bold, 16); y -= 40;
    } else {
      text(`Billing Statement ${st.number} (continued)`, M, y - 10, bold, 10); y -= 30;
    }
  };
  const ensure = (h) => { if (y - h < BOTTOM) newPage(false); };

  newPage(true);
  // Title row
  text('BILLING STATEMENT', M, y - 16, bold, 17);
  right(`Statement No. ${st.number}`, W - M, y - 8, bold, 10);
  right(`Statement date: ${longDate(st.statement_date)}`, W - M, y - 21, font, 10);
  y -= 28;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: black });
  y -= 20;

  // Bill To / Property
  const colW = (W - 2 * M - 24) / 2, x2 = M + colW + 24;
  text('BILL TO', M, y, bold, 8, grey); text('PROPERTY', x2, y, bold, 8, grey);
  y -= 14;
  const left = [st.bill_to_name, ...String(st.bill_to_address || '').split(/\n/)].filter((s) => String(s || '').trim());
  const svc = st.service_start || st.service_end
    ? `Service dates: ${fmtDate(st.service_start)}${st.service_end && st.service_end !== st.service_start ? ` – ${fmtDate(st.service_end)}` : ''}` : null;
  const rightCol = [st.property_contact, st.property_address,
    st.date_of_loss ? `Date of loss: ${fmtDate(st.date_of_loss)}` : null, svc].filter(Boolean);
  const lw1 = left.flatMap((s) => wrap(s, font, 10, colW));
  const lw2 = rightCol.flatMap((s) => wrap(s, font, 10, colW));
  for (let i = 0; i < Math.max(lw1.length, lw2.length); i++) {
    if (lw1[i]) text(lw1[i], M, y); if (lw2[i]) text(lw2[i], x2, y);
    y -= 13;
  }
  y -= 10;

  // Description
  if (String(st.description || '').trim()) {
    text('DESCRIPTION OF SERVICES', M, y, bold, 8, grey); y -= 14;
    for (const l of wrap(st.description, font, 10, W - 2 * M)) { ensure(14); text(l, M, y); y -= 13.5; }
    y -= 10;
  }

  // Charges table
  const cols = [M, M + 232, M + 330, W - M];       // description | quantity | rate (right edge = cols[2]+RATE_W) | amount (right)
  const RATE_W = 95;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: band });
    text('Description', cols[0] + 6, y, bold, 9); text('Quantity', cols[1] + 6, y, bold, 9);
    right('Rate', cols[2] + RATE_W, y, bold, 9); right('Amount', cols[3] - 6, y, bold, 9);
    y -= 22;
  };
  ensure(60); header();
  for (const l of lines) {
    const dl = wrap(l.description, font, 9.5, cols[1] - cols[0] - 12);
    const h = dl.length * 12 + 8;
    if (y - h < BOTTOM) { newPage(false); header(); }
    dl.forEach((t, i) => text(t, cols[0] + 6, y - i * 12, font, 9.5));
    text(qtyText(l), cols[1] + 6, y, font, 9.5);
    right(rateText(l), cols[2] + RATE_W, y, font, 9.5);
    right(money(l.amount), cols[3] - 6, y, font, 9.5);
    y -= h - 4;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: rule });
    y -= 6;
  }
  ensure(40);
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 1.2, color: black });
  y -= 10;
  right('TOTAL', cols[2] + RATE_W, y, bold, 12); right(money(st.total), cols[3] - 6, y, bold, 12);
  y -= 34;

  ensure(20);
  text('Questions: MB2 Restore  ·  603-294-9972  ·  mb2banking@gmail.com', M, y, font, 10);

  return Buffer.from(await doc.save());
}

// ---------- Routes ----------
const registerBillingRoutes = (app, { all, get, run, h, requireAuth, requireAdmin, requireOfficeOrAdmin }) => {
  const fail = (res, err) => res.status(err.status || 500).json({ error: err.message });

  const loadStatement = async (id) => {
    const s = await get(
      `SELECT bs.*, j.nickname AS job_nickname, j.status AS job_status
         FROM billing_statements bs LEFT JOIN jobs j ON j.id = bs.job_id WHERE bs.id = $1`, [id]);
    if (!s) return null;
    const lines = await all('SELECT * FROM billing_statement_lines WHERE statement_id = $1 ORDER BY sort_order', [id]);
    return { ...shapeStatement(s), lines: lines.map(shapeLine) };
  };

  // Rate list ----------------------------------------------------------------
  app.get('/api/rate-items', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const rows = await all('SELECT * FROM rate_items WHERE active = TRUE ORDER BY sort_order, name');
    res.json(rows.map(shapeRate));
  }));

  // Admin saves the whole list at once. Items left out are deactivated (old statements keep their copied rates).
  app.put('/api/rate-items', requireAuth, requireAdmin, h(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    for (const it of items) {
      if (!String(it.name || '').trim()) return res.status(400).json({ error: 'Every rate needs a name.' });
      if (!['one_time', 'daily', 'hourly'].includes(it.kind)) return res.status(400).json({ error: `"${it.name}": choose One-time, Daily or Hourly.` });
      if (!(parseFloat(it.rate) >= 0)) return res.status(400).json({ error: `"${it.name}": rate must be a number.` });
    }
    const keep = new Set();
    let i = 0;
    for (const it of items) {
      const id = it.id || uuidv4(); keep.add(id);
      const exists = it.id && (await get('SELECT id FROM rate_items WHERE id = $1', [it.id]));
      const vals = [String(it.name).trim(), it.kind, round2(parseFloat(it.rate)), it.exclusive_group || null, i++, req.user.name || req.user.email];
      if (exists) {
        await run(`UPDATE rate_items SET name=$1, kind=$2, rate=$3, exclusive_group=$4, sort_order=$5, active=TRUE,
                   updated_by=$6, updated_date=CURRENT_TIMESTAMP WHERE id=$7`, [...vals, id]);
      } else {
        await run(`INSERT INTO rate_items (name, kind, rate, exclusive_group, sort_order, updated_by, id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...vals, id]);
      }
    }
    const active = await all('SELECT id FROM rate_items WHERE active = TRUE');
    for (const r of active) if (!keep.has(r.id)) await run('UPDATE rate_items SET active = FALSE WHERE id = $1', [r.id]);
    const rows = await all('SELECT * FROM rate_items WHERE active = TRUE ORDER BY sort_order, name');
    res.json(rows.map(shapeRate));
  }));

  // Statements ---------------------------------------------------------------
  app.get('/api/billing-statements', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const rows = await all(
      `SELECT bs.id, bs.job_id, bs.number, bs.status, bs.statement_date, bs.bill_to_name, bs.property_address,
              bs.total, bs.pdf_url, bs.created_by, bs.created_date, bs.updated_date, bs.sent_by, bs.sent_date,
              j.nickname AS job_nickname
         FROM billing_statements bs LEFT JOIN jobs j ON j.id = bs.job_id
        ORDER BY bs.year DESC, bs.seq DESC`);
    res.json(rows.map(shapeStatement));
  }));

  app.get('/api/billing-statements/:id', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const s = await loadStatement(req.params.id);
    if (!s) return res.status(404).json({ error: 'Statement not found' });
    res.json(s);
  }));

  // The job's statement (if it has one) — used to jump from a job to its statement.
  app.get('/api/jobs/:jobId/billing-statement', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const s = await get('SELECT id FROM billing_statements WHERE job_id = $1', [req.params.jobId]);
    res.json(s ? await loadStatement(s.id) : null);
  }));

  // Create or update. Body: { job_id, date_of_loss, service_start, service_end, description,
  //   bill_to_name, bill_to_address, lines: [...] }  (id in the URL for updates)
  const saveStatement = async (req, res, existingId) => {
    const client = await pool.connect();
    let newPdfUrl = null;
    try {
      const b = req.body || {};
      const existing = existingId ? await get('SELECT * FROM billing_statements WHERE id = $1', [existingId]) : null;
      if (existingId && !existing) return res.status(404).json({ error: 'Statement not found' });
      const jobId = existing ? existing.job_id : b.job_id;
      const job = await get(
        `SELECT j.*, c.name AS customer_name FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id WHERE j.id = $1`, [jobId]);
      if (!job) return res.status(400).json({ error: 'Pick a job for this statement.' });
      if (!existing) {
        const other = await get('SELECT id, number FROM billing_statements WHERE job_id = $1', [jobId]);
        if (other) return res.status(409).json({ error: `This job already has billing statement ${other.number}. Open it to make changes, or create a new job for a second visit.`, id: other.id });
      }
      const billToName = String(b.bill_to_name ?? '').trim();
      if (!billToName) return res.status(400).json({ error: 'Enter the Billing Customer Name (Bill To).' });

      const rateItems = await all('SELECT * FROM rate_items');
      const prevLines = existing ? await all('SELECT * FROM billing_statement_lines WHERE statement_id = $1', [existing.id]) : [];
      // Keep each existing line's copied rate when it is edited (rates are locked per statement).
      const locked = rateItems.map((r) => {
        const prev = prevLines.find((p) => p.rate_item_id === r.id);
        return prev ? { ...r, rate: prev.rate } : r;
      });
      const lines = buildLines(b.lines, locked);
      if (!lines.length) return res.status(400).json({ error: 'Add at least one charge.' });
      const total = round2(lines.reduce((a, l) => a + l.amount, 0));

      const clean = (v) => (v ? String(v).slice(0, 10) : null);
      const st = {
        id: existing ? existing.id : uuidv4(),
        job_id: jobId,
        statement_date: existing ? String(existing.statement_date).slice(0, 10) : todayET(),
        date_of_loss: clean(b.date_of_loss), service_start: clean(b.service_start), service_end: clean(b.service_end),
        description: String(b.description || '').trim(),
        bill_to_name: billToName,
        bill_to_address: String(b.bill_to_address || '').trim(),
        property_contact: job.customer_name || '',
        property_address: job.address || '',
        work_type: job.type || '',
        total,
      };

      await client.query('BEGIN');
      if (!existing) {
        // Next number for this year (Eastern time). Lock the table so two people can't get the same number.
        await client.query('LOCK TABLE billing_statements IN SHARE ROW EXCLUSIVE MODE');
        const year = parseInt(st.statement_date.slice(0, 4), 10);
        const r = await client.query('SELECT COALESCE(MAX(seq), 100)::int AS s FROM billing_statements WHERE year = $1', [year]);
        st.year = year; st.seq = r.rows[0].s + 1; st.number = `${year}${String(st.seq).padStart(3, '0')}`;
      } else {
        st.year = existing.year; st.seq = existing.seq; st.number = existing.number;
      }

      const pdf = await buildStatementPdf(st, lines);
      const filename = `Billing_Statement_${st.number}.pdf`;
      const saved = await saveDocument(`data:application/pdf;base64,${pdf.toString('base64')}`, filename);
      if (saved.error) throw Object.assign(new Error(saved.error), { status: 400 });
      newPdfUrl = saved.url;

      const by = req.user.name || req.user.email;
      const status = existing ? (existing.status === 'draft' ? 'draft' : 'changed') : 'draft';
      if (!existing) {
        await client.query(
          `INSERT INTO billing_statements (id, job_id, number, year, seq, status, statement_date, date_of_loss, service_start,
             service_end, description, bill_to_name, bill_to_address, property_contact, property_address, work_type, total,
             pdf_url, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)`,
          [st.id, jobId, st.number, st.year, st.seq, status, st.statement_date, st.date_of_loss, st.service_start, st.service_end,
           st.description, st.bill_to_name, st.bill_to_address, st.property_contact, st.property_address, st.work_type, total,
           saved.url, by]);
      } else {
        await client.query(
          `UPDATE billing_statements SET status=$1, date_of_loss=$2, service_start=$3, service_end=$4, description=$5,
             bill_to_name=$6, bill_to_address=$7, property_contact=$8, property_address=$9, work_type=$10, total=$11,
             pdf_url=$12, updated_by=$13, updated_date=CURRENT_TIMESTAMP WHERE id=$14`,
          [status, st.date_of_loss, st.service_start, st.service_end, st.description, st.bill_to_name, st.bill_to_address,
           st.property_contact, st.property_address, st.work_type, total, saved.url, by, st.id]);
        await client.query('DELETE FROM billing_statement_lines WHERE statement_id = $1', [st.id]);
        if (existing.document_id) await client.query('DELETE FROM documents WHERE id = $1', [existing.document_id]);
      }
      for (const l of lines) {
        await client.query(
          `INSERT INTO billing_statement_lines (id, statement_id, rate_item_id, kind, description, units, quantity, rate, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [uuidv4(), st.id, l.rate_item_id, l.kind, l.description, l.units, l.quantity, l.rate, l.amount, l.sort_order]);
      }
      // Attach to the job's Documents. No amount: this is billing (revenue), not a job cost.
      const docId = uuidv4();
      await client.query(
        `INSERT INTO documents (id, job_id, description, filename, file_url, file_type, amount, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,$7)`,
        [docId, jobId, `Billing Statement ${st.number}`, filename, saved.url, 'pdf', by]);
      await client.query('UPDATE billing_statements SET document_id = $1 WHERE id = $2', [docId, st.id]);
      // Billing details live on the job; the statement total sets Mitigation (Project Total recalculated).
      await client.query(
        `UPDATE jobs SET billing_customer_name = $1, billing_address = $2, mitigation_amount = $3,
                project_amount = $3 + COALESCE(repair_amount, 0) + COALESCE(other_amount, 0),
                updated_date = CURRENT_TIMESTAMP WHERE id = $4`,
        [st.bill_to_name, st.bill_to_address || null, total, jobId]);
      await client.query('COMMIT');

      if (existing && existing.pdf_url) { try { await deletePhoto(existing.pdf_url); } catch (e) { /* ignore */ } }
      res.json(await loadStatement(st.id));
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
      if (newPdfUrl) { try { await deletePhoto(newPdfUrl); } catch (e) { /* ignore */ } }
      console.error('Billing statement save:', err.message);
      fail(res, err);
    } finally {
      client.release();
    }
  };

  app.post('/api/billing-statements', requireAuth, requireOfficeOrAdmin, (req, res) => saveStatement(req, res, null));
  app.put('/api/billing-statements/:id', requireAuth, requireOfficeOrAdmin, (req, res) => saveStatement(req, res, req.params.id));

  // Delete — drafts only (anything already sent to the Controller stays on record).
  app.delete('/api/billing-statements/:id', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const s = await get('SELECT * FROM billing_statements WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Statement not found' });
    if (s.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be deleted. This statement was already sent to the Controller.' });
    await run('DELETE FROM billing_statement_lines WHERE statement_id = $1', [s.id]);
    if (s.document_id) await run('DELETE FROM documents WHERE id = $1', [s.document_id]);
    await run('DELETE FROM billing_statements WHERE id = $1', [s.id]);
    if (s.pdf_url) { try { await deletePhoto(s.pdf_url); } catch (e) { /* ignore */ } }
    res.json({ success: true });
  }));

  // Send to Controller: email the PDF to every active Admin.
  app.post('/api/billing-statements/:id/send', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const s = await loadStatement(req.params.id);
    if (!s) return res.status(404).json({ error: 'Statement not found' });
    const admins = await all(`SELECT name, email FROM users WHERE role = 'admin' AND active = TRUE AND email IS NOT NULL AND email <> ''`);
    if (!admins.length) return res.status(400).json({ error: 'No active Admin users with an email address.' });

    // Rebuild the PDF from the saved statement (same as the stored copy) to attach it.
    const pdf = await buildStatementPdf({ ...s, statement_date: String(s.statement_date).slice(0, 10) }, s.lines);
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const by = req.user.name || req.user.email;
    const resend = s.status !== 'draft';
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
        <p>${resend ? '<strong>Updated</strong> billing statement' : 'New billing statement'} ready for invoicing in QuickBooks.</p>
        <table style="border-collapse:collapse">
          <tr><td style="padding:3px 12px 3px 0;color:#555">Statement</td><td><strong>${esc(s.number)}</strong></td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#555">Bill To</td><td>${esc(s.bill_to_name)}${s.bill_to_address ? '<br>' + esc(s.bill_to_address).replace(/\n/g, '<br>') : ''}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#555">Property</td><td>${esc(s.property_address)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#555">Total</td><td><strong>${money(s.total)}</strong></td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#555">Sent by</td><td>${esc(by)}</td></tr>
        </table>
        <p>The statement PDF is attached.${resend ? ' This replaces the earlier version of this statement.' : ''}</p>
      </div>`;
    const result = await sendEmail({
      to: admins.map((a) => a.email),
      subject: `${resend ? 'UPDATED ' : ''}Billing Statement ${s.number} – ${s.bill_to_name} – ${money(s.total)}`,
      html,
      attachments: [{ filename: `Billing_Statement_${s.number}.pdf`, content: pdf.toString('base64') }],
    });
    if (!result.ok) {
      return res.status(502).json({ error: result.skipped ? 'Email is not configured on the server (RESEND_API_KEY).' : `Email failed: ${result.error}` });
    }
    await run(`UPDATE billing_statements SET status = 'sent', sent_by = $1, sent_date = CURRENT_TIMESTAMP, sent_to = $2 WHERE id = $3`,
      [by, admins.map((a) => a.email).join(', '), s.id]);
    res.json(await loadStatement(s.id));
  }));
};

// Called when a job is deleted. Returns stored PDF urls for the caller to delete from storage.
const deleteBillingForJob = async (all, run, jobId) => {
  const rows = await all('SELECT id, pdf_url FROM billing_statements WHERE job_id = $1', [jobId]);
  for (const r of rows) await run('DELETE FROM billing_statement_lines WHERE statement_id = $1', [r.id]);
  await run('DELETE FROM billing_statements WHERE job_id = $1', [jobId]);
  return rows.map((r) => r.pdf_url).filter(Boolean);
};

module.exports = { initBillingTables, registerBillingRoutes, deleteBillingForJob, buildStatementPdf, buildLines };
