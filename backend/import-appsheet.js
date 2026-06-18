// Import jobs + customers from the AppSheet CSV export into MB2 Core (Postgres).
//
// SCOPE RULE: import a job only if date_received >= 2026-01-01 OR status is "In Process".
//
// Handles the messy copy-paste:
//   - Orphan rows (text in col 0, no customer/address) are continuation text that
//     belongs to the PREVIOUS real job's Next Steps / Old Notes — they get reattached.
//   - Fully blank rows are skipped.
//   - Old Notes are appended under Next Steps (labeled), per DJ's choice (option A).
//   - Status spellings are normalized to the app's official names.
//   - Amounts like "$40,688" -> 40688.  Dates like "1/27/25, 10:51 AM" -> 2025-01-27.
//
// USAGE:
//   node import-appsheet.js            # DRY RUN — parses + prints a preview, no DB writes
//   node import-appsheet.js --commit   # writes to the database in DATABASE_URL
//
// CSV path defaults to ../Import Data - Sheet1.csv (project root). Override with CSV_PATH.

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const COMMIT = process.argv.includes('--commit');
const CSV_PATH = process.env.CSV_PATH || path.join(__dirname, '..', 'Import Data - Sheet1.csv');

// ---- tiny CSV parser (handles quoted fields + embedded newlines/commas) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---- normalizers ----
const STATUS_MAP = {
  'estimated delivered': 'Estimate Delivered',
  'send final bill': 'Send Final Bill',
  'send final bil': 'Send Final Bill',
};
function normStatus(s) {
  const t = (s || '').trim();
  const mapped = STATUS_MAP[t.toLowerCase()];
  return mapped || t;
}

function parseDate(s) {
  const raw = (s || '').trim();
  if (!raw) return null;
  const datepart = raw.split(',')[0].trim(); // drop the ", 10:51 AM"
  const m = datepart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, d, y] = m;
  y = y.length === 2 ? '20' + y : y;
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`; // ISO date for Postgres
}

function parseAmount(s) {
  const raw = (s || '').replace(/[$,]/g, '').trim();
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function isRealRow(r) {
  return (r[1] || '').trim() && (r[4] || '').trim(); // Customer Name + Address
}
function isBlankRow(r) {
  return !r.some(x => (x || '').trim());
}

// ---- main ----
function build() {
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const all = parseCSV(text);
  const header = all[0];
  const dataRows = all.slice(1).map(r => { const c = r.slice(); while (c.length < 15) c.push(''); return c; });

  // Column indexes
  const C = {
    nickname: 0, customer: 1, phone: 2, email: 3, address: 4, type: 5,
    leadSource: 6, dateReceived: 7, dateStarted: 8, dateCompleted: 9,
    status: 10, amount: 11, dateInvoiced: 12, nextSteps: 13, oldNotes: 14
  };

  // Pass 1: build job objects, reattaching orphan continuation rows to the previous job.
  const jobs = [];
  let current = null;
  for (const r of dataRows) {
    if (isBlankRow(r)) continue;
    if (isRealRow(r)) {
      current = {
        nickname: (r[C.nickname] || '').trim(),
        customer: (r[C.customer] || '').trim(),
        phone: (r[C.phone] || '').trim(),
        email: (r[C.email] || '').trim(),
        address: (r[C.address] || '').trim(),
        type: (r[C.type] || '').trim(),
        leadSource: (r[C.leadSource] || '').trim(),
        dateReceived: parseDate(r[C.dateReceived]),
        dateStarted: parseDate(r[C.dateStarted]),
        dateCompleted: parseDate(r[C.dateCompleted]),
        status: normStatus(r[C.status]),
        amount: parseAmount(r[C.amount]),
        dateInvoiced: parseDate(r[C.dateInvoiced]),
        nextSteps: (r[C.nextSteps] || '').trim(),
        oldNotes: (r[C.oldNotes] || '').trim(),
        _extraNotes: []
      };
      jobs.push(current);
    } else if (current) {
      // orphan continuation row — its meaningful text is in col 0 (and maybe col 13/14)
      const bits = [r[C.nickname], r[C.nextSteps], r[C.oldNotes]]
        .map(x => (x || '').trim()).filter(Boolean);
      if (bits.length) current._extraNotes.push(bits.join(' '));
    }
  }

  // Pass 2: merge Old Notes + extras into Next Steps (option A), apply scope rule.
  const CUTOFF = '2026-01-01';
  const kept = [];
  for (const j of jobs) {
    const keep = (j.dateReceived && j.dateReceived >= CUTOFF) || j.status.toLowerCase() === 'in process';
    if (!keep) continue;

    // Compose Next Steps: nextSteps + reattached orphan text + Old Notes (labeled)
    let parts = [];
    if (j.nextSteps) parts.push(j.nextSteps);
    if (j._extraNotes.length) parts.push(j._extraNotes.join('\n'));
    if (j.oldNotes) parts.push('--- Old Notes ---\n' + j.oldNotes);
    j.nextStepsFinal = parts.join('\n').trim();
    kept.push(j);
  }

  return { header, totalRows: dataRows.length, totalJobs: jobs.length, kept };
}

async function main() {
  const { totalRows, totalJobs, kept } = build();

  console.log('========================================');
  console.log('  MB2 Core — AppSheet Import');
  console.log('  Mode:', COMMIT ? 'COMMIT (writing to DB)' : 'DRY RUN (no DB writes)');
  console.log('========================================');
  console.log(`CSV rows parsed:        ${totalRows}`);
  console.log(`Real jobs found:        ${totalJobs}`);
  console.log(`Jobs matching scope:    ${kept.length}`);
  console.log(`  (date >= 2026-01-01 OR status = "In Process")`);

  // status breakdown of kept
  const byStatus = {};
  for (const j of kept) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  console.log('\nKept jobs by status:');
  Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => console.log(`   ${String(c).padStart(4)}  ${s}`));

  console.log('\n--- Sample of 5 mapped jobs ---');
  for (const j of kept.slice(0, 5)) {
    console.log(`\n• ${j.nickname || '(no nickname)'}  [${j.status}]`);
    console.log(`    Customer:  ${j.customer}  |  ${j.phone || 'no phone'}  |  ${j.email || 'no email'}`);
    console.log(`    Address:   ${j.address}`);
    console.log(`    Type:      ${j.type}  |  Lead: ${j.leadSource}`);
    console.log(`    Received:  ${j.dateReceived || '—'}  Completed: ${j.dateCompleted || '—'}  Invoiced: ${j.dateInvoiced || '—'}`);
    console.log(`    Amount:    ${j.amount != null ? '$'+j.amount : '—'}`);
    const ns = (j.nextStepsFinal || '').replace(/\n/g, ' / ');
    console.log(`    NextSteps: ${ns.slice(0, 160)}${ns.length>160?'…':''}`);
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing was written. Re-run with --commit to import.)');
    return;
  }

  // ---- COMMIT path ----
  const { all, get, run, pool } = require('./db');
  let customersCreated = 0, jobsCreated = 0, skipped = 0;
  for (const j of kept) {
    // find or create customer (dedupe on name + phone, like the app)
    let cust = await get('SELECT id FROM customers WHERE name = $1 AND phone = $2', [j.customer, j.phone]);
    let customerId;
    if (cust) {
      customerId = cust.id;
    } else {
      customerId = uuidv4();
      await run(
        'INSERT INTO customers (id, name, email, phone, address) VALUES ($1,$2,$3,$4,$5)',
        [customerId, j.customer, j.email || null, j.phone || null, j.address]
      );
      customersCreated++;
    }

    // dedupe job on nickname + address to keep re-runs idempotent
    const existing = await get('SELECT id FROM jobs WHERE nickname = $1 AND address = $2', [j.nickname, j.address]);
    if (existing) { skipped++; continue; }

    await run(
      `INSERT INTO jobs (id, customer_id, nickname, address, type, status, lead_source,
                         date_received, start_date, date_completed, date_invoiced,
                         amount, next_steps, customer_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [uuidv4(), customerId, j.nickname, j.address, j.type || 'Water Mitigation', j.status || 'Lead',
       j.leadSource || null, j.dateReceived, j.dateStarted, j.dateCompleted, j.dateInvoiced,
       j.amount, j.nextStepsFinal || null, j.email || null]
    );
    jobsCreated++;
  }
  await pool.end();
  console.log(`\nDONE. Customers created: ${customersCreated}, Jobs created: ${jobsCreated}, Jobs skipped (already present): ${skipped}`);
}

main().catch(e => { console.error('Import failed:', e); process.exit(1); });
