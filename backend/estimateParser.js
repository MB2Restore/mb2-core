// ===== XACTIMATE ESTIMATE READER =====
// Reads an Xactimate PDF and returns the repair budget inputs.
// Rules (see project doc "Trade_Budget_Logic.md"):
// - Source of truth = each "Recap by Category" page. A PDF can hold several estimates
//   (e.g. a mitigation estimate + a repair estimate); each recap is read separately.
// - Repairs only: an estimate with no Overhead & Profit is mitigation and is ignored, and
//   mitigation categories inside a repair estimate are stripped.
// - Bid items: line items written "<Trade> (Bid Item)". Budget = 100% of the bid.
//   Everything else in a category = budgetPct (75%) of its pre-O&P total.
// - Depreciation estimates use RCV. Sales tax is info only, never budgeted.

const MITIGATION_CATEGORIES = new Set([
  'WATER EXTRACTION & REMEDIATION',
  'HAZARDOUS MATERIAL REMEDIATION',
]);
const NUM = /-?[\d,]+\.\d{2}/g;
const toNum = (s) => parseFloat(String(s).replace(/[,()]/g, ''));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- 1. PDF -> text lines (layout-preserving, like `pdftotext -layout`) ----
async function extractLines(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, verbosity: 0,
  });
  const doc = await task.promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      const size = Math.hypot(it.transform[2], it.transform[3]) || 10;
      let row = rows.find((r) => Math.abs(r.y - y) <= size * 0.35);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, w: it.width, str: it.str, size });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      for (const it of r.items) {
        if (end !== null) {
          const gap = it.x - end;
          text += gap > it.size * 0.9 ? '    ' : (gap > it.size * 0.15 ? ' ' : '');
        }
        text += it.str;
        end = it.x + it.w;
      }
      lines.push(text);
    }
    lines.push('');
    page.cleanup();
  }
  await task.destroy();
  return lines;
}

// ---- 2. Recaps ----
function parseRecaps(lines) {
  const starts = [];
  lines.forEach((l, i) => { if (/^\s*Recap by Category/.test(l)) starts.push(i); });
  return starts.map((si) => {
    const depreciation = /Depreciation/.test(lines[si]);
    const categories = [], totals = {};
    for (let i = si + 1; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s || s.startsWith('Coverage:') || s.startsWith('MB2 Restore')) continue;
      if (/^Total\s+-?[\d,]+\.\d{2}/.test(s)) { totals.Total = toNum(s.match(NUM)[0]); break; }
      const m = s.match(/^([A-Za-z0-9&/,.:'\- ]+?)\s{2,}(-?[\d,]+\.\d{2})/);
      if (!m) continue;
      const name = m[1].trim(), val = toNum(m[2]);
      if (name === 'Subtotal' && categories.length) { totals.Subtotal = val; totals.Total = val; break; }
      if (/Subtotal/.test(name)) { totals[name.startsWith('O&P') ? 'O&P Subtotal' : 'Non-O&P Subtotal'] = val; continue; }
      if (name === 'Overhead' || name === 'Profit' || /Tax/.test(name)) { totals[name] = val; continue; }
      categories.push({ category: name, pre_op: val });
    }
    const hasOP = 'Overhead' in totals;
    const base = totals['O&P Subtotal'] ?? totals.Subtotal ?? 0;
    const tax = Object.entries(totals).filter(([k]) => /Tax/.test(k)).reduce((a, [, v]) => a + v, 0);
    return { start: si, depreciation, hasOP, categories, totals, base, tax };
  });
}

// ---- 3. Bid items ----
const tokens = (s) => (s.toUpperCase().match(/[A-Z]+/g) || []).filter((t) => !['AND', 'THE', 'OF'].includes(t));
function matchCategory(prefix, cats) {
  const pt = tokens(prefix); let best = null, score = 0;
  for (const c of cats) {
    const ct = tokens(c);
    const sc = pt.filter((a) => ct.some((b) => b.startsWith(a.slice(0, 5)) || a.startsWith(b.slice(0, 5)))).length;
    if (sc > score) { best = c; score = sc; }
  }
  return best;
}
function parseBids(lines, from, to, cats, depreciation) {
  const bids = [];
  for (const l of lines.slice(from, to)) {
    const m = l.match(/^\s*(?:\d+\.\s+)?(.+?)\(Bid/);
    if (!m) continue;
    const q = l.match(/([\d,]+\.\d{2})\s+(EA|LS|SF|LF|HR|SY)\b/);
    if (!q) continue;
    const after = l.slice(q.index + q[0].length);
    const v = (after.match(/\(?-?[\d,]+\.\d{2}\)?/g) || []).filter((n) => !n.startsWith('(')).map(toNum);
    let pre;
    if (depreciation) { if (v.length < 4) continue; pre = v[3] - v[1] - v[2]; }    // unit, tax, O&P, RCV
    else { if (v.length < 3) continue; pre = v[v.length - 1] - v[v.length - 2] - v[v.length - 3]; } // .., tax, O&P, total
    const description = l.replace(/^\s*\d+\.\s+/, '').replace(/\s{2,}.*$/, '').trim();
    bids.push({ category: matchCategory(m[1], cats), description, amount: round2(pre) });
  }
  return bids;
}

// ---- 4. Cover page facts (for the wrong-job check) ----
function coverInfo(lines) {
  const head = lines.slice(0, 600);
  const val = (label) => {
    const i = head.findIndex((l) => new RegExp(`^\\s*${label}:`).test(l));
    if (i < 0) return null;
    const first = head[i].replace(new RegExp(`^\\s*${label}:\\s*`), '').split(/\s{3,}/)[0].trim();
    const next = (head[i + 1] || '').trim();
    const second = next && !/:/.test(next) ? next.split(/\s{3,}/)[0].trim() : '';
    return [first, second].filter(Boolean).join(', ');
  };
  return { client: val('Client'), property: val('Property'), estimateName: val('Estimate') };
}

// ---- 5. Put it together ----
function buildFromLines(lines, { budgetPct = 0.75 } = {}) {
  const recaps = parseRecaps(lines);
  if (!recaps.length) throw new Error('No "Recap by Category" page found. Is this an Xactimate estimate?');
  const repairs = [], mitigation = [];
  let prev = 0;
  for (const r of recaps) {
    if (r.hasOP) r.bids = parseBids(lines, prev, r.start, r.categories.map((c) => c.category), r.depreciation);
    prev = r.start;
    (r.hasOP ? repairs : mitigation).push(r);
  }
  if (!repairs.length) throw new Error('This file only contains a mitigation estimate (no overhead & profit). Budgets are for repairs only.');

  // Merge every repair estimate in the file (normally just one).
  const byCat = new Map(); const bids = []; const stripped = [];
  let xactimateTotal = 0, tax = 0, check = [];
  for (const r of repairs) {
    xactimateTotal += r.totals.Total || 0;
    tax += r.tax;
    const sum = r.categories.reduce((a, c) => a + c.pre_op, 0);
    check.push(Math.abs(sum - r.base) < 0.05 &&
      Math.abs(r.base + r.tax + (r.totals.Overhead || 0) + (r.totals.Profit || 0) - (r.totals.Total || 0)) < 0.05);
    for (const c of r.categories) {
      if (MITIGATION_CATEGORIES.has(c.category)) { stripped.push(c); continue; }
      byCat.set(c.category, round2((byCat.get(c.category) || 0) + c.pre_op));
    }
    for (const b of r.bids) if (!MITIGATION_CATEGORIES.has(b.category)) bids.push(b);
  }
  const lines_ = [...byCat.entries()].map(([category, pre_op], i) => {
    const bid = round2(bids.filter((b) => b.category === category).reduce((a, b) => a + b.amount, 0));
    return { category, pre_op, bid_amount: bid, sort_order: i };
  });
  const result = summarize(lines_, budgetPct);
  return {
    ...coverInfo(lines),
    ...result,
    bids,
    xactimate_total: round2(xactimateTotal),
    sales_tax: round2(tax),
    mitigation_excluded: round2(mitigation.reduce((a, r) => a + r.base, 0) + stripped.reduce((a, c) => a + c.pre_op, 0)),
    mitigation_estimates: mitigation.length,
    stripped_categories: stripped.map((c) => c.category),
    ties_out: check.every(Boolean),
  };
}

// Budget for a set of category lines (also used to re-total after a supplement merge).
function summarize(lines, budgetPct = 0.75) {
  const out = lines.map((l) => {
    const nonBid = l.pre_op - l.bid_amount;
    const budget = round2(l.bid_amount + nonBid * budgetPct);
    const line_type = l.bid_amount && Math.abs(l.bid_amount - l.pre_op) < 0.01 ? 'Bid' : (l.bid_amount ? 'Bid + 75%' : '75%');
    return { ...l, budget, line_type };
  });
  return {
    lines: out,
    budget_pct: budgetPct,
    pre_op_total: round2(out.reduce((a, l) => a + l.pre_op, 0)),
    bid_total: round2(out.reduce((a, l) => a + l.bid_amount, 0)),
    budget_total: round2(out.reduce((a, l) => a + l.budget, 0)),
  };
}

// Wrong-job check: compare street number + first street word, ignoring typos in town names.
// Returns true / false, or null when either address is missing.
function addressMatches(jobAddress, estimateProperty) {
  const key = (a) => {
    const m = String(a || '').toUpperCase().match(/(\d+[A-Z]?)\s+([A-Z0-9]+)/);
    return m ? `${m[1]} ${m[2]}` : null;
  };
  const a = key(jobAddress), b = key(estimateProperty);
  if (!a || !b) return null;
  return a === b;
}

async function readEstimate(buffer, opts) {
  return buildFromLines(await extractLines(buffer), opts);
}

module.exports = { readEstimate, extractLines, buildFromLines, summarize, addressMatches, MITIGATION_CATEGORIES };
