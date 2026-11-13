import React, { useState, useEffect, useCallback } from 'react';
import './TradeBudget.css';

// Trade Budget section on Job Detail (Office/Admin only).
// Budgets come only from approved Xactimate repair estimates: original, full revision or supplement.
// Rules live in the backend (budgets.js / estimateParser.js) and the project doc "Trade_Budget_Logic.md".

const MAX_MB = 10;
const money = (v) => {
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return '–';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
const signed = (v) => (Number(v) > 0 ? '+' : '') + money(v);
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '–');
const KIND_LABEL = { original: 'Original estimate', revision: 'Full revised estimate', supplement: 'Supplement' };
const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US');
};
const typeClass = (t) => (t === 'Bid' || t === 'Bid + 75%' ? 'tb-pill tb-pill-bid' : 'tb-pill');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function TradeBudget({ job, apiUrl, token, onRepairAmountChanged }) {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Upload & review
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Components report (materials / labor split) for the current budget
  const [showComp, setShowComp] = useState(false);
  const [compFile, setCompFile] = useState(null);
  const [compPreview, setCompPreview] = useState(null);
  const [compBusy, setCompBusy] = useState(false);
  const [compError, setCompError] = useState('');

  const auth = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/jobs/${job.id}/budget`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not load the budget');
      setCurrent(d.current);
      setHistory(d.history || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, job.id, token]);

  useEffect(() => { load(); }, [load]);

  const openUpload = () => {
    setShowUpload(true); setFile(null); setPreview(null); setKind(''); setUploadError('');
  };
  const closeUpload = () => { if (!busy) setShowUpload(false); };

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    setPreview(null); setUploadError('');
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setUploadError('Please choose the Xactimate estimate PDF.'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setUploadError(`"${f.name}" is over ${MAX_MB} MB.`); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result).replace(/^data:[^;]*;/, 'data:application/pdf;');
      setFile({ name: f.name, dataUrl });
      setBusy(true);
      try {
        const res = await fetch(`${apiUrl}/api/jobs/${job.id}/budget/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ file: dataUrl }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Could not read this estimate');
        setPreview(d);
        setKind(d.suggested);
      } catch (err) {
        setUploadError(err.message);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const approve = async () => {
    if (!file || !preview || !kind) return;
    setBusy(true); setUploadError('');
    try {
      const res = await fetch(`${apiUrl}/api/jobs/${job.id}/budget`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ file: file.dataUrl, filename: file.name, kind }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save the budget');
      setShowUpload(false);
      await load();
      if (onRepairAmountChanged) onRepairAmountChanged(d.repair_amount_after);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openComp = () => { setShowComp(true); setCompFile(null); setCompPreview(null); setCompError(''); };
  const closeComp = () => { if (!compBusy) setShowComp(false); };

  const onPickComp = (e) => {
    const f = e.target.files && e.target.files[0];
    setCompPreview(null); setCompError('');
    if (!f || !current) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setCompError('Please choose the Xactimate components report PDF.'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setCompError(`"${f.name}" is over ${MAX_MB} MB.`); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result).replace(/^data:[^;]*;/, 'data:application/pdf;');
      setCompFile({ name: f.name, dataUrl });
      setCompBusy(true);
      try {
        const res = await fetch(`${apiUrl}/api/budgets/${current.id}/components/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ file: dataUrl }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Could not read this components report');
        setCompPreview(d);
      } catch (err) {
        setCompError(err.message);
      } finally {
        setCompBusy(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const saveComp = async () => {
    if (!compFile || !compPreview || !current) return;
    setCompBusy(true); setCompError('');
    try {
      const res = await fetch(`${apiUrl}/api/budgets/${current.id}/components`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ file: compFile.dataUrl, filename: compFile.name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save the components report');
      setShowComp(false);
      await load();
    } catch (err) {
      setCompError(err.message);
    } finally {
      setCompBusy(false);
    }
  };

  // Printer-friendly page (opens in a new tab and prints).
  const printBudget = async (budgetId) => {
    let b = current;
    if (budgetId && (!current || budgetId !== current.id)) {
      const res = await fetch(`${apiUrl}/api/budgets/${budgetId}`, { headers: auth });
      b = await res.json();
    }
    if (!b) return;
    const sp = Boolean(b.components_file_url);
    const splitCells = (l) => (sp ? `<td class="r">${l.materials_budget === null ? '–' : money(l.materials_budget)}</td><td class="r">${l.labor_budget === null ? '–' : money(l.labor_budget)}</td>` : '');
    const rows = b.lines.map((l) => `<tr><td>${esc(l.category)}</td><td class="r">${money(l.pre_op)}</td><td class="r b">${money(l.budget)}</td>${splitCells(l)}<td>${esc(l.line_type)}</td><td class="act"></td><td></td></tr>`).join('');
    const sumOf = (k) => b.lines.reduce((a, l) => a + (l[k] || 0), 0);
    const bids = b.bids.length ? b.bids.map((x) => `${esc(x.description)} ${money(x.amount)}`).join('; ') : 'None';
    const w = window.open('', '_blank');
    if (!w) { setError('Allow pop-ups to print the budget.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Trade Budget – ${esc(job.nickname || job.address)}</title>
<style>
@page{size:letter;margin:0.6in}
body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111;margin:0;font-size:12px}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
.k{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h1{margin:2px 0;font-size:22px}
.meta{text-align:right;line-height:1.5;font-size:11px}
.tot{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #111;margin-bottom:14px}
.tot div{padding:8px 10px;border-right:1px solid #111}.tot div:last-child{border-right:0}
.tot b{display:block;font-size:16px;margin-top:2px}
table{width:100%;border-collapse:collapse;border:1px solid #111}
th{background:#e6e6e6;text-align:left;padding:6px 8px;border-bottom:1px solid #111;font-size:11px}
td{padding:9px 8px;border-bottom:1px solid #999}
.r{text-align:right}.b{font-weight:700}.act{border-left:1px solid #111;width:13%}
tfoot td{font-weight:700;border-top:1px solid #111;border-bottom:0}
.notes{margin-top:12px;line-height:1.6;font-size:11px}
.ft{margin-top:18px;border-top:1px solid #999;padding-top:6px;font-size:10px;display:flex;justify-content:space-between}
</style></head><body>
<div class="hd"><div><div class="k">MB2 Restore · Trade Budget</div><h1>${esc(job.nickname || job.address)}</h1><div>${esc(job.address)}</div></div>
<div class="meta">Version ${b.version} · ${esc(KIND_LABEL[b.kind] || b.kind)}<br>${esc(b.filename || '')}<br>Approved ${fmtDate(b.created_date)} by ${esc(b.approved_by || '')} · Printed ${new Date().toLocaleDateString('en-US')}</div></div>
<div class="tot"><div>Xactimate total<b>${money(b.xactimate_total)}</b></div><div>Pre-O&amp;P (repairs)<b>${money(b.pre_op_total)}</b></div><div>Trade budget<b>${money(b.budget_total)}</b></div><div>Bid items (100%)<b>${money(b.bid_total)}</b></div></div>
<table><thead><tr><th>Xactimate category</th><th class="r">Pre-O&amp;P</th><th class="r">Budget</th>${sp ? '<th class="r">Materials</th><th class="r">Labor</th>' : ''}<th>Type</th><th class="r">Actual</th><th>Notes</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td>Total</td><td class="r">${money(b.pre_op_total)}</td><td class="r">${money(b.budget_total)}</td>${sp ? `<td class="r">${money(sumOf('materials_budget'))}</td><td class="r">${money(sumOf('labor_budget'))}</td>` : ''}<td></td><td class="act"></td><td></td></tr></tfoot></table>${sp ? '<div class="notes">Materials / Labor from the Xactimate components report (both at the budget %). "–" = not broken out.</div>' : ''}
<div class="notes"><b>Bid items:</b> ${bids}<br><b>Excluded:</b> mitigation ${money(b.mitigation_excluded)}. Budget covers repairs only.${b.sales_tax ? ` Sales tax ${money(b.sales_tax)} (not budgeted).` : ''}<br>
<b>How the budget is set:</b> bid items at 100% of the bid; all other work at ${Math.round((b.budget_pct || 0.75) * 100)}% of the Xactimate pre-O&amp;P total, before 10% overhead and 10% profit.</div>
<div class="ft"><span>MB2 Restore LLC · 933 Islington St, Portsmouth, NH 03801</span><span>Printed from MB2 Core</span></div>
<script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  const hasSplit = Boolean(current && current.components_file_url);
  const splitTotal = (k) => (current ? current.lines.reduce((a, l) => a + (l[k] || 0), 0) : 0);
  const opt = preview && kind ? preview.options[kind] : null;
  const changedRows = opt ? (kind === 'original' ? opt.changes : opt.changes.filter((c) => c.changed)) : [];
  const unchangedCount = opt && kind !== 'original' ? opt.changes.length - changedRows.length : 0;

  return (
    <div className="detail-section tb">
      <div className="tb-head">
        <div>
          <h3 className="tb-title">Trade Budget</h3>
          {current ? (
            <div className="tb-sub">Current: <strong>{KIND_LABEL[current.kind]}</strong> (version {current.version}) · {current.filename} · approved {fmtDate(current.created_date)} by {current.approved_by}</div>
          ) : (
            <div className="tb-sub">From the approved Xactimate repair estimate. Bid items at 100%, everything else at 75% of pre-O&amp;P.</div>
          )}
        </div>
        <div className="tb-actions">
          {current && <button type="button" className="tb-btn" onClick={() => printBudget()}>Print</button>}
          {current && <button type="button" className="tb-btn" onClick={openComp}>{current.components_file_url ? 'Replace components report' : 'Add components report'}</button>}
          {history.length > 0 && <button type="button" className="tb-btn" onClick={() => setShowHistory((v) => !v)}>History ({history.length})</button>}
          <button type="button" className="tb-btn tb-btn-primary" onClick={openUpload}>{current ? 'Upload revised estimate / supplement' : 'Upload repair estimate'}</button>
        </div>
      </div>

      {error && <div className="tb-alert tb-alert-error">{error}</div>}
      {loading && <div className="tb-muted">Loading budget…</div>}

      {!loading && !current && !error && (
        <div className="tb-empty">No budget yet. Upload the approved Xactimate repair estimate (PDF) to create one.</div>
      )}

      {showHistory && history.length > 0 && (
        <div className="tb-history">
          {history.map((v) => (
            <div key={v.id} className="tb-history-row">
              <span><strong>v{v.version}</strong> · {KIND_LABEL[v.kind]} · {fmtDate(v.created_date)} · {v.approved_by}</span>
              <span className="tb-history-right">
                <span>Budget {money(v.budget_total)}</span>
                {v.file_url && <a href={v.file_url} target="_blank" rel="noopener noreferrer">PDF</a>}
                <button type="button" className="tb-link" onClick={() => printBudget(v.id)}>Print</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {current && (
        <>
          <div className="tb-cards">
            <div className="tb-card"><div className="tb-card-k">Xactimate total</div><div className="tb-card-v">{money(current.xactimate_total)}</div><div className="tb-card-s">incl. 10% O + 10% P</div></div>
            <div className="tb-card"><div className="tb-card-k">Pre-O&amp;P (repairs)</div><div className="tb-card-v">{money(current.pre_op_total)}</div><div className="tb-card-s">what Xactimate pays for the work</div></div>
            <div className="tb-card"><div className="tb-card-k">Trade budget</div><div className="tb-card-v">{money(current.budget_total)}</div><div className="tb-card-s">{pct(current.budget_total, current.pre_op_total)} of pre-O&amp;P · target cost</div></div>
            <div className="tb-card tb-card-bid"><div className="tb-card-k">Bid items</div><div className="tb-card-v">{money(current.bid_total)}</div><div className="tb-card-s">{current.bids.length} bid{current.bids.length === 1 ? '' : 's'} · budgeted at 100%</div></div>
          </div>
          {(current.mitigation_excluded > 0 || current.sales_tax > 0) && (
            <div className="tb-note">
              {current.mitigation_excluded > 0 && <>Mitigation removed: {money(current.mitigation_excluded)} ignored. Budget covers repairs only. </>}
              {current.sales_tax > 0 && <>Sales tax {money(current.sales_tax)} shown for info, not budgeted.</>}
            </div>
          )}
          <div className="tb-table-wrap">
            <table className="tb-table">
              <thead><tr><th>Xactimate category</th><th className="r">Pre-O&amp;P total</th><th className="r">Budget</th>{hasSplit && <><th className="r">Materials</th><th className="r">Labor</th></>}<th>Type</th><th className="r tb-later">Actual</th><th className="r tb-later">Remaining</th></tr></thead>
              <tbody>
                {current.lines.map((l) => (
                  <tr key={l.id} className={l.bid_amount > 0 ? 'tb-row-bid' : ''}>
                    <td>{l.category}</td><td className="r">{money(l.pre_op)}</td><td className="r b">{money(l.budget)}</td>
                    {hasSplit && <><td className="r" title={l.materials_budget === null ? 'Not broken out' : undefined}>{l.materials_budget === null ? '–' : money(l.materials_budget)}</td><td className="r" title={l.labor_budget === null ? 'Not broken out' : undefined}>{l.labor_budget === null ? '–' : money(l.labor_budget)}</td></>}
                    <td><span className={typeClass(l.line_type)}>{l.line_type}</span></td><td className="r tb-later">–</td><td className="r tb-later">–</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="r">{money(current.pre_op_total)}</td><td className="r">{money(current.budget_total)}</td>{hasSplit && <><td className="r">{money(splitTotal('materials_budget'))}</td><td className="r">{money(splitTotal('labor_budget'))}</td></>}<td></td><td className="r tb-later">–</td><td className="r tb-later">–</td></tr></tfoot>
            </table>
          </div>
          {current.bids.length > 0 && (
            <div className="tb-bids"><strong>Bid items:</strong> {current.bids.map((b) => `${b.description} ${money(b.amount)}`).join(' · ')}</div>
          )}
          {hasSplit
            ? <div className="tb-muted">Materials / Labor from components report {current.components_filename} · added {fmtDate(current.components_added_date)} by {current.components_added_by} · <a href={current.components_file_url} target="_blank" rel="noopener noreferrer">PDF</a>. "–" = not broken out (e.g. supervision, bids are in Budget).</div>
            : <div className="tb-muted">Add the Xactimate components report to split each category into materials and labor.</div>}
          <div className="tb-muted">Actual and Remaining fill in later with job costing.</div>
        </>
      )}

      {showComp && current && (
        <div className="tb-modal-backdrop" onClick={closeComp}>
          <div className="tb-modal" role="dialog" aria-modal="true" aria-labelledby="tb-comp-title" onClick={(e) => e.stopPropagation()}>
            <div className="tb-modal-head">
              <div>
                <h3 id="tb-comp-title" className="tb-title">Add components report</h3>
                <div className="tb-sub">Splits budget version {current.version} into materials and labor. The budget totals don't change.{compFile ? ` · ${compFile.name}` : ''}</div>
              </div>
              <button type="button" className="tb-close" aria-label="Close" onClick={closeComp}>×</button>
            </div>
            <label className="tb-file">
              <span>Xactimate components report (PDF)</span>
              <input type="file" accept="application/pdf,.pdf" onChange={onPickComp} disabled={compBusy} />
            </label>
            {compBusy && !compPreview && <div className="tb-muted">Reading the components report…</div>}
            {compError && <div className="tb-alert tb-alert-error">{compError}</div>}
            {compPreview && (
              <>
                <div className="tb-alert">
                  {compPreview.lines.filter((l) => l.split).length} of {compPreview.lines.length} categories split.
                  {compPreview.unmapped_materials > 0 && ` ${money(compPreview.unmapped_materials)} of materials didn't match a category.`}
                </div>
                <div className="tb-table-wrap">
                  <table className="tb-table">
                    <thead><tr><th>Category</th><th className="r">Budget</th><th className="r">Materials</th><th className="r">Labor</th></tr></thead>
                    <tbody>
                      {compPreview.lines.map((l) => (
                        <tr key={l.category}>
                          <td>{l.category}</td><td className="r b">{money(l.budget)}</td>
                          {l.split
                            ? <><td className="r">{money(l.materials_budget)}</td><td className="r">{money(l.labor_budget)}</td></>
                            : <td className="tb-muted" colSpan={2}>Not broken out</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="tb-modal-foot">
                  <span className="tb-muted">A new revised estimate or supplement clears this split until a new components report is added.</span>
                  <span className="tb-actions">
                    <button type="button" className="tb-btn" onClick={closeComp} disabled={compBusy}>Cancel</button>
                    <button type="button" className="tb-btn tb-btn-primary" onClick={saveComp} disabled={compBusy}>{compBusy ? 'Saving…' : 'Save split'}</button>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showUpload && (
        <div className="tb-modal-backdrop" onClick={closeUpload}>
          <div className="tb-modal" role="dialog" aria-modal="true" aria-labelledby="tb-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="tb-modal-head">
              <div>
                <h3 id="tb-modal-title" className="tb-title">{current ? 'Review new estimate' : 'Upload repair estimate'}</h3>
                <div className="tb-sub">{job.nickname || job.address}{file ? ` · ${file.name}` : ''}</div>
              </div>
              <button type="button" className="tb-close" aria-label="Close" onClick={closeUpload}>×</button>
            </div>

            <label className="tb-file">
              <span>Xactimate estimate (PDF)</span>
              <input type="file" accept="application/pdf,.pdf" onChange={onPickFile} disabled={busy} />
            </label>

            {busy && !preview && <div className="tb-muted">Reading the estimate…</div>}
            {uploadError && <div className="tb-alert tb-alert-error">{uploadError}</div>}

            {preview && (
              <>
                <div className="tb-checks">
                  {preview.address_match === true && <div className="tb-alert tb-alert-ok">Address matches this job: {preview.file.property}</div>}
                  {preview.address_match === false && <div className="tb-alert tb-alert-warn">The estimate is for <strong>{preview.file.property || 'another address'}</strong>, but this job is <strong>{preview.job.address}</strong>. Make sure this is the right job before approving.</div>}
                  {preview.address_match === null && <div className="tb-alert">Couldn't read a property address from the estimate. Double-check it's the right job.</div>}
                  <div className="tb-alert">
                    {preview.file.mitigation_excluded > 0
                      ? `Mitigation removed: ${money(preview.file.mitigation_excluded)} ignored. `
                      : 'No mitigation found. '}
                    Repairs only · {preview.file.categories} categories · {preview.file.bids} bid item{preview.file.bids === 1 ? '' : 's'}
                  </div>
                  {!preview.file.ties_out && <div className="tb-alert tb-alert-warn">The categories on this estimate don't add up to its totals. Check the PDF before approving.</div>}
                </div>

                {preview.current && (
                  <fieldset className="tb-kind">
                    <legend>What kind of upload is this?</legend>
                    {['revision', 'supplement'].map((k) => (
                      <label key={k} className={`tb-kind-opt ${kind === k ? 'on' : ''}`}>
                        <input type="radio" name="tb-kind" checked={kind === k} onChange={() => setKind(k)} />
                        <span>
                          <strong>{KIND_LABEL[k]}</strong>
                          <span className="tb-sub">
                            {k === 'revision' ? 'Replaces the whole budget.' : 'Adds to the current budget. Every other category stays as it is.'}
                            {preview.suggested === k && <> <span className="tb-suggest">Suggested:</span> {preview.reason}</>}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}

                {opt && (
                  <>
                    <div className="tb-section-label">{kind === 'original' ? 'Budget' : 'What changes'}</div>
                    <div className="tb-table-wrap">
                      <table className="tb-table">
                        <thead>
                          {kind === 'original'
                            ? <tr><th>Category</th><th className="r">Pre-O&amp;P</th><th className="r">Budget</th><th>Type</th></tr>
                            : <tr><th>Category</th><th className="r">Pre-O&amp;P now</th><th className="r">Pre-O&amp;P new</th><th className="r">Budget now</th><th className="r">Budget new</th><th className="r">Change</th></tr>}
                        </thead>
                        <tbody>
                          {changedRows.map((c) => kind === 'original' ? (
                            <tr key={c.category}><td>{c.category}</td><td className="r">{money(c.pre_op_after)}</td><td className="r b">{money(c.budget_after)}</td><td><span className={typeClass(c.line_type)}>{c.line_type}</span></td></tr>
                          ) : (
                            <tr key={c.category} className="tb-row-bid">
                              <td>{c.category}{c.pre_op_before === 0 ? ' (new)' : ''}</td><td className="r">{money(c.pre_op_before)}</td><td className="r">{money(c.pre_op_after)}</td>
                              <td className="r">{money(c.budget_before)}</td><td className="r b">{money(c.budget_after)}</td><td className="r b">{signed(c.budget_after - c.budget_before)}</td>
                            </tr>
                          ))}
                          {unchangedCount > 0 && <tr><td colSpan={6} className="tb-muted">{unchangedCount} other categor{unchangedCount === 1 ? 'y' : 'ies'}: no change</td></tr>}
                          {kind !== 'original' && changedRows.length === 0 && <tr><td colSpan={6} className="tb-muted">No category changes.</td></tr>}
                        </tbody>
                        <tfoot>
                          {kind === 'original'
                            ? <tr><td>Total</td><td className="r">{money(opt.pre_op_total)}</td><td className="r">{money(opt.budget_total)}</td><td></td></tr>
                            : <tr><td>Job total</td><td className="r">{money(preview.current.pre_op_total)}</td><td className="r">{money(opt.pre_op_total)}</td><td className="r">{money(preview.current.budget_total)}</td><td className="r">{money(opt.budget_total)}</td><td className="r">{signed(opt.budget_total - preview.current.budget_total)}</td></tr>}
                        </tfoot>
                      </table>
                    </div>
                    <div className="tb-repair">
                      <span><strong>Project Financials → Repair Amount</strong> {kind === 'supplement' ? 'adds this supplement' : 'becomes the Xactimate repair total'}</span>
                      <span className="tb-nowrap">{money(preview.repair_amount_before || 0)} → <strong>{money(opt.repair_amount_after)}</strong></span>
                    </div>
                  </>
                )}

                <div className="tb-modal-foot">
                  <span className="tb-muted">{preview.current ? `The current budget stays in History as version ${preview.current.version}.` : 'This becomes version 1.'}</span>
                  <span className="tb-actions">
                    <button type="button" className="tb-btn" onClick={closeUpload} disabled={busy}>Cancel</button>
                    <button type="button" className="tb-btn tb-btn-primary" onClick={approve} disabled={busy || !kind}>{busy ? 'Saving…' : 'Approve & save'}</button>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeBudget;
