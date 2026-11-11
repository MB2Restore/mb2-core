// ===== TRADE BUDGETS (from Xactimate repair estimates) =====
// Design: see project doc "Trade_Budget_Logic.md".
// - One job_budgets row per approved version (original, full revision, supplement).
//   Each version stores the RESULTING budget for the job (a supplement's row holds the
//   previous budget plus what it added), so "current" is simply the highest version.
// - job_budget_lines: one row per Xactimate category in that version.
// - job_budget_bids: the (Bid Item) lines behind that version's bid amounts.
// - The CORE job is the key. File / Xactimate estimate names are stored for reference only.
// Postgres returns NUMERIC as strings, so every money value is parseFloat'ed on the way out.

const num = (v) => (v === null || v === undefined ? null : parseFloat(v));

const initBudgetTables = async (run) => {
  await run(`
    CREATE TABLE IF NOT EXISTS job_budgets (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      kind TEXT NOT NULL,                 -- 'original' | 'revision' | 'supplement'
      filename TEXT,
      file_url TEXT,
      estimate_name TEXT,                 -- Xactimate estimate name (reference only, never a key)
      property_address TEXT,              -- from the estimate cover page (for the wrong-job check)
      file_total NUMERIC(12, 2),          -- this file's own Xactimate repair total (incl. O&P)
      xactimate_total NUMERIC(12, 2),     -- job's repair total after this version (incl. O&P)
      pre_op_total NUMERIC(12, 2),        -- repairs only, mitigation removed
      sales_tax NUMERIC(12, 2),           -- info only, never budgeted
      bid_total NUMERIC(12, 2),
      budget_total NUMERIC(12, 2),
      mitigation_excluded NUMERIC(12, 2),
      budget_pct NUMERIC(5, 4) DEFAULT 0.75,
      repair_amount_before NUMERIC(12, 2),
      repair_amount_after NUMERIC(12, 2),
      approved_by TEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (job_id, version)
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS job_budget_lines (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      category TEXT NOT NULL,
      pre_op NUMERIC(12, 2) NOT NULL DEFAULT 0,
      bid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
      line_type TEXT,                     -- 'Bid' | 'Bid + 75%' | '75%'
      sort_order INTEGER
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS job_budget_bids (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      category TEXT,
      description TEXT,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      source_version INTEGER              -- which upload this bid came from
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_job_budgets_job ON job_budgets (job_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_job_budget_lines_budget ON job_budget_lines (budget_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_job_budget_bids_budget ON job_budget_bids (budget_id)`);
};

const shapeBudget = (b) => b && ({
  ...b,
  file_total: num(b.file_total),
  xactimate_total: num(b.xactimate_total),
  pre_op_total: num(b.pre_op_total),
  sales_tax: num(b.sales_tax),
  bid_total: num(b.bid_total),
  budget_total: num(b.budget_total),
  mitigation_excluded: num(b.mitigation_excluded),
  budget_pct: num(b.budget_pct),
  repair_amount_before: num(b.repair_amount_before),
  repair_amount_after: num(b.repair_amount_after),
});

// Full detail of one version: the version row + its category lines + its bids.
const loadBudget = async (all, get, budgetId) => {
  const b = await get('SELECT * FROM job_budgets WHERE id = $1', [budgetId]);
  if (!b) return null;
  const lines = await all(
    'SELECT * FROM job_budget_lines WHERE budget_id = $1 ORDER BY sort_order, category', [budgetId]);
  const bids = await all(
    'SELECT * FROM job_budget_bids WHERE budget_id = $1 ORDER BY source_version, category', [budgetId]);
  return {
    ...shapeBudget(b),
    lines: lines.map((l) => ({ ...l, pre_op: num(l.pre_op), bid_amount: num(l.bid_amount), budget: num(l.budget) })),
    bids: bids.map((x) => ({ ...x, amount: num(x.amount) })),
  };
};

// Remove every budget row for a job (called when a job is deleted).
// Returns the stored PDF urls so the caller can delete the files from storage.
const deleteBudgetsForJob = async (all, run, jobId) => {
  const files = await all('SELECT file_url FROM job_budgets WHERE job_id = $1', [jobId]);
  await run('DELETE FROM job_budget_bids WHERE job_id = $1', [jobId]);
  await run('DELETE FROM job_budget_lines WHERE job_id = $1', [jobId]);
  await run('DELETE FROM job_budgets WHERE job_id = $1', [jobId]);
  return files.map((f) => f.file_url).filter(Boolean);
};

// ---------- Upload → analyze → approve ----------
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');
const { saveDocument } = require('./storage');
const { readEstimate, summarize, addressMatches } = require('./estimateParser');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const pdfBuffer = (dataUrl) => {
  const m = String(dataUrl || '').match(/^data:application\/pdf;base64,(.+)$/i);
  if (!m) { const e = new Error('Please upload the Xactimate estimate as a PDF.'); e.status = 400; throw e; }
  return Buffer.from(m[1], 'base64');
};

// Resulting budget for each upload type, given the job's current budget (or none).
const resultFor = (kind, current, parsed) => {
  if (kind !== 'supplement' || !current) {
    return {
      ...summarize(parsed.lines.map((l) => ({ category: l.category, pre_op: l.pre_op, bid_amount: l.bid_amount })), current?.budget_pct ?? 0.75),
      bids: parsed.bids.map((b) => ({ ...b, source_version: null })),
      xactimate_total: parsed.xactimate_total,
      repair_amount_after: parsed.xactimate_total,
      mitigation_excluded: parsed.mitigation_excluded,
      sales_tax: parsed.sales_tax,
    };
  }
  // Supplement: add to the current budget; every other category stays as it is.
  const map = new Map(current.lines.map((l) => [l.category, { category: l.category, pre_op: l.pre_op, bid_amount: l.bid_amount }]));
  for (const l of parsed.lines) {
    const row = map.get(l.category) || { category: l.category, pre_op: 0, bid_amount: 0 };
    row.pre_op = round2(row.pre_op + l.pre_op);
    row.bid_amount = round2(row.bid_amount + l.bid_amount);
    map.set(l.category, row);
  }
  return {
    ...summarize([...map.values()], current.budget_pct ?? 0.75),
    bids: [...current.bids.map((b) => ({ category: b.category, description: b.description, amount: b.amount, source_version: b.source_version })),
           ...parsed.bids.map((b) => ({ ...b, source_version: null }))],
    xactimate_total: round2((current.xactimate_total || 0) + parsed.xactimate_total),
    repair_amount_after: null, // filled from the job's Repair Amount below
    mitigation_excluded: round2((current.mitigation_excluded || 0) + parsed.mitigation_excluded),
    sales_tax: round2((current.sales_tax || 0) + parsed.sales_tax),
  };
};

// Category-by-category comparison: current budget vs. a proposed one.
const changesBetween = (current, next) => {
  const cur = new Map((current?.lines || []).map((l) => [l.category, l]));
  const out = [];
  const seen = new Set();
  for (const l of next.lines) {
    const c = cur.get(l.category); seen.add(l.category);
    out.push({ category: l.category, pre_op_before: c ? c.pre_op : 0, pre_op_after: l.pre_op,
      budget_before: c ? c.budget : 0, budget_after: l.budget, line_type: l.line_type,
      changed: !c || Math.abs(c.pre_op - l.pre_op) >= 0.005 || Math.abs(c.bid_amount - l.bid_amount) >= 0.005 });
  }
  for (const [cat, c] of cur) if (!seen.has(cat)) {
    out.push({ category: cat, pre_op_before: c.pre_op, pre_op_after: 0, budget_before: c.budget, budget_after: 0, line_type: 'Removed', changed: true });
  }
  return out;
};

const analyze = async (all, get, jobId, dataUrl) => {
  const job = await get('SELECT id, nickname, address, repair_amount, mitigation_amount, other_amount FROM jobs WHERE id = $1', [jobId]);
  if (!job) { const e = new Error('Job not found'); e.status = 404; throw e; }
  let parsed;
  try { parsed = await readEstimate(pdfBuffer(dataUrl)); }
  catch (err) { err.status = err.status || 400; throw err; }

  const latest = await get('SELECT id FROM job_budgets WHERE job_id = $1 ORDER BY version DESC LIMIT 1', [jobId]);
  const current = latest ? await loadBudget(all, get, latest.id) : null;
  const repairBefore = num(job.repair_amount);

  // Suggest the upload type from the file's content (never its name).
  let suggested = 'original', reason = 'This job has no budget yet.';
  if (current) {
    const have = new Set(parsed.lines.map((l) => l.category));
    const covered = current.lines.filter((l) => have.has(l.category)).length;
    const ratio = current.lines.length ? covered / current.lines.length : 0;
    if (ratio >= 0.8) { suggested = 'revision'; reason = `This file has ${covered} of the job's ${current.lines.length} current categories.`; }
    else { suggested = 'supplement'; reason = `This file only has ${parsed.lines.length} categor${parsed.lines.length === 1 ? 'y' : 'ies'} (${covered} of the job's ${current.lines.length}).`; }
  }

  const options = {};
  for (const kind of current ? ['revision', 'supplement'] : ['original']) {
    const r = resultFor(kind, current, parsed);
    if (kind === 'supplement') r.repair_amount_after = round2((repairBefore || 0) + parsed.xactimate_total);
    options[kind] = { ...r, changes: changesBetween(current, r) };
  }

  return {
    job: { id: job.id, nickname: job.nickname, address: job.address },
    file: {
      client: parsed.client, property: parsed.property, estimate_name: parsed.estimateName,
      xactimate_total: parsed.xactimate_total, pre_op_total: parsed.pre_op_total, bid_total: parsed.bid_total,
      categories: parsed.lines.length, bids: parsed.bids.length, sales_tax: parsed.sales_tax,
      mitigation_excluded: parsed.mitigation_excluded, mitigation_estimates: parsed.mitigation_estimates,
      stripped_categories: parsed.stripped_categories, ties_out: parsed.ties_out,
    },
    address_match: addressMatches(job.address, parsed.property),
    current: current && { version: current.version, kind: current.kind, budget_total: current.budget_total, pre_op_total: current.pre_op_total },
    repair_amount_before: repairBefore,
    suggested, reason, options,
  };
};

const registerBudgetRoutes = (app, { all, get, h, requireAuth, requireOfficeOrAdmin }) => {
  const fail = (res, err) => res.status(err.status || 500).json({ error: err.message });

  // Preview an uploaded estimate. Nothing is saved.
  app.post('/api/jobs/:jobId/budget/preview', requireAuth, requireOfficeOrAdmin, async (req, res) => {
    try { res.json(await analyze(all, get, req.params.jobId, req.body.file)); }
    catch (err) { console.error('Budget preview:', err.message); fail(res, err); }
  });

  // Approve: re-read the file on the server, save it, store the new version, update Repair Amount.
  app.post('/api/jobs/:jobId/budget', requireAuth, requireOfficeOrAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      const { file, filename, kind } = req.body;
      const a = await analyze(all, get, req.params.jobId, file);
      const allowed = Object.keys(a.options);
      if (!allowed.includes(kind)) return res.status(400).json({ error: `Upload type must be one of: ${allowed.join(', ')}` });
      const r = a.options[kind];

      const saved = await saveDocument(file, filename || 'estimate.pdf');
      if (saved.error) return res.status(400).json({ error: saved.error });

      const prev = await get('SELECT COALESCE(MAX(version), 0)::int AS v FROM job_budgets WHERE job_id = $1', [req.params.jobId]);
      const version = prev.v + 1;
      const budgetId = uuidv4();

      await client.query('BEGIN');
      await client.query(
        `INSERT INTO job_budgets (id, job_id, version, kind, filename, file_url, estimate_name, property_address,
           file_total, xactimate_total, pre_op_total, sales_tax, bid_total, budget_total, mitigation_excluded,
           budget_pct, repair_amount_before, repair_amount_after, approved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [budgetId, req.params.jobId, version, kind, filename || null, saved.url, a.file.estimate_name, a.file.property,
         a.file.xactimate_total, r.xactimate_total, r.pre_op_total, r.sales_tax, r.bid_total, r.budget_total,
         r.mitigation_excluded, r.budget_pct, a.repair_amount_before, r.repair_amount_after, req.user.name || req.user.email]
      );
      for (const l of r.lines) {
        await client.query(
          `INSERT INTO job_budget_lines (id, budget_id, job_id, category, pre_op, bid_amount, budget, line_type, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [uuidv4(), budgetId, req.params.jobId, l.category, l.pre_op, l.bid_amount, l.budget, l.line_type, l.sort_order]
        );
      }
      for (const b of r.bids) {
        await client.query(
          `INSERT INTO job_budget_bids (id, budget_id, job_id, category, description, amount, source_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), budgetId, req.params.jobId, b.category, b.description, b.amount, b.source_version ?? version]
        );
      }
      // Repair Amount = Xactimate repair total incl. O&P; Project Total = Mitigation + Repair + Other.
      await client.query(
        `UPDATE jobs SET repair_amount = $1,
                project_amount = COALESCE(mitigation_amount, 0) + $1 + COALESCE(other_amount, 0),
                updated_date = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [r.repair_amount_after, req.params.jobId]
      );
      await client.query('COMMIT');
      res.json(await loadBudget(all, get, budgetId));
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
      console.error('Budget approve:', err.message);
      fail(res, err);
    } finally {
      client.release();
    }
  });

  // Current budget for a job + version history (Office/Admin only; field staff never see budgets).
  app.get('/api/jobs/:jobId/budget', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const versions = await all(
      `SELECT id, version, kind, filename, file_url, file_total, xactimate_total, pre_op_total,
              bid_total, budget_total, approved_by, created_date
         FROM job_budgets WHERE job_id = $1 ORDER BY version DESC`,
      [req.params.jobId]
    );
    const history = versions.map(shapeBudget);
    const current = history.length ? await loadBudget(all, get, history[0].id) : null;
    res.json({ current, history });
  }));

  // One specific version (for History and Print).
  app.get('/api/budgets/:id', requireAuth, requireOfficeOrAdmin, h(async (req, res) => {
    const budget = await loadBudget(all, get, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    res.json(budget);
  }));
};

module.exports = { initBudgetTables, registerBudgetRoutes, deleteBudgetsForJob, loadBudget };
