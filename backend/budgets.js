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

const registerBudgetRoutes = (app, { all, get, h, requireAuth, requireOfficeOrAdmin }) => {
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
