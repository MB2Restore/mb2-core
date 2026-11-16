import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './BillingStatements.css';

// Billing Statements (Office/Admin). Design: project doc "Billing_Statements.md".
// The server does all the math, numbering, PDF and email; this screen collects the inputs.

const money = (v) => {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || Number.isNaN(n)) return '–';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
const fmtStamp = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleDateString('en-US') : '');
const toDateInput = (s) => (s ? String(s).slice(0, 10) : '');
const KIND_LABEL = { one_time: 'One-time', daily: 'Daily', hourly: 'Hourly' };
const STATUS = {
  draft: { label: 'Draft', cls: 'bs-pill' },
  sent: { label: 'Sent', cls: 'bs-pill bs-pill-ok' },
  changed: { label: 'Changed since sent', cls: 'bs-pill bs-pill-warn' },
};
const num = (v) => (v === '' || v === null || v === undefined ? 0 : parseFloat(v) || 0);

function BillingStatements({ jobs, apiUrl, token, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [view, setView] = useState('list'); // list | edit
  const [list, setList] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showRates, setShowRates] = useState(false);

  const flash = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch(`${apiUrl}/api/billing-statements`, { headers: auth }),
        fetch(`${apiUrl}/api/rate-items`, { headers: auth }),
      ]);
      const la = await a.json().catch(() => []); const lb = await b.json().catch(() => []);
      if (!a.ok) throw new Error(la.error || 'Could not load statements');
      if (!b.ok) throw new Error(lb.error || 'Could not load the rate list');
      setList(la); setRates(lb); setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [apiUrl, auth]);

  useEffect(() => { load(); }, [load]);

  // ---------- Editor ----------
  const [editing, setEditing] = useState(null);   // saved statement (or null for new)
  const [jobId, setJobId] = useState('');
  const [form, setForm] = useState({});
  const [qty, setQty] = useState({});             // rate_item_id -> { units, quantity }
  const [call, setCall] = useState('');           // rate_item_id of the emergency call, or ''
  const [misc, setMisc] = useState([]);           // [{ description, amount }]
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const job = jobs.find((j) => j.id === jobId);
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => String(a.nickname || a.address).localeCompare(String(b.nickname || b.address), undefined, { numeric: true })), [jobs]);
  const takenJobs = useMemo(() => new Map(list.map((s) => [s.job_id, s])), [list]);

  // Rows shown in the editor: the active rate list, plus any retired item a saved statement still uses
  // (with the rate the statement locked in).
  const rows = useMemo(() => {
    const locked = new Map((editing?.lines || []).filter((l) => l.rate_item_id).map((l) => [l.rate_item_id, l]));
    const base = rates.map((r) => (locked.has(r.id) ? { ...r, rate: locked.get(r.id).rate } : r));
    for (const [id, l] of locked) if (!rates.some((r) => r.id === id)) base.push({ id, name: l.description, kind: l.kind, rate: l.rate, retired: true });
    return base;
  }, [rates, editing]);
  const callRows = rows.filter((r) => r.exclusive_group === 'emergency_call' || (r.retired && r.kind === 'one_time'));
  const otherRows = rows.filter((r) => !callRows.includes(r));

  const lineAmount = (r) => {
    const q = qty[r.id] || {};
    if (r.kind === 'daily') return num(q.units) * num(q.quantity) * r.rate;
    if (r.kind === 'hourly') return num(q.quantity) * r.rate;
    if (r.kind === 'one_time') return q.on ? r.rate : 0;
    return 0;
  };
  const total = useMemo(() => {
    let t = 0;
    for (const r of otherRows) t += lineAmount(r);
    const c = callRows.find((r) => r.id === call); if (c) t += c.rate;
    for (const m of misc) t += num(m.amount);
    return Math.round(t * 100) / 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, call, misc, rows]);

  const startNew = () => {
    setEditing(null); setJobId(''); setForm({}); setQty({}); setCall(''); setMisc([{ description: '', amount: '' }]);
    setFormError(''); setView('edit');
  };
  const pickJob = (id) => {
    setJobId(id);
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    setForm({
      bill_to_name: j.billing_customer_name || '',
      bill_to_address: j.billing_address || '',
      date_of_loss: toDateInput(j.date_received),
      service_start: toDateInput(j.start_date || j.date_received),
      service_end: toDateInput(j.date_completed),
      description: '',
    });
  };
  const openStatement = async (id) => {
    setFormError('');
    try {
      const res = await fetch(`${apiUrl}/api/billing-statements/${id}`, { headers: auth });
      const s = await res.json();
      if (!res.ok) throw new Error(s.error || 'Could not open the statement');
      setEditing(s); setJobId(s.job_id);
      setForm({
        bill_to_name: s.bill_to_name || '', bill_to_address: s.bill_to_address || '',
        date_of_loss: toDateInput(s.date_of_loss), service_start: toDateInput(s.service_start), service_end: toDateInput(s.service_end),
        description: s.description || '',
      });
      const q = {}; let c = ''; const m = [];
      for (const l of s.lines) {
        if (l.kind === 'misc') m.push({ description: l.description, amount: String(l.amount) });
        else if (l.kind === 'one_time' && (rates.find((r) => r.id === l.rate_item_id)?.exclusive_group === 'emergency_call' || !rates.some((r) => r.id === l.rate_item_id))) c = l.rate_item_id;
        else if (l.kind === 'one_time') q[l.rate_item_id] = { on: true };
        else q[l.rate_item_id] = { units: l.units ?? '', quantity: l.quantity ?? '' };
      }
      setQty(q); setCall(c); setMisc(m.length ? m : [{ description: '', amount: '' }]);
      setView('edit');
    } catch (e) { setError(e.message); }
  };

  const payload = () => {
    const lines = [];
    if (call) lines.push({ rate_item_id: call });
    for (const r of otherRows) {
      const q = qty[r.id] || {};
      if (r.kind === 'daily' && num(q.units) && num(q.quantity)) lines.push({ rate_item_id: r.id, units: num(q.units), quantity: num(q.quantity) });
      if (r.kind === 'hourly' && num(q.quantity)) lines.push({ rate_item_id: r.id, quantity: num(q.quantity) });
      if (r.kind === 'one_time' && q.on) lines.push({ rate_item_id: r.id });
    }
    for (const m of misc) if (String(m.description).trim() || num(m.amount)) lines.push({ kind: 'misc', description: m.description, amount: num(m.amount) });
    return { job_id: jobId, ...form, lines };
  };

  const save = async (andSend) => {
    if (!jobId) { setFormError('Pick a job first.'); return; }
    if (andSend && editing?.status === 'sent' && !window.confirm(`Statement ${editing.number} was already sent. Save and send it again?`)) return;
    setBusy(true); setFormError('');
    try {
      const res = await fetch(editing ? `${apiUrl}/api/billing-statements/${editing.id}` : `${apiUrl}/api/billing-statements`, {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(payload()),
      });
      let s = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(s.error || 'Could not save the statement');
      if (andSend) {
        const r2 = await fetch(`${apiUrl}/api/billing-statements/${s.id}/send`, { method: 'POST', headers: auth });
        const d2 = await r2.json().catch(() => ({}));
        if (!r2.ok) { setEditing(s); await load(); throw new Error(`Saved, but not sent: ${d2.error || 'email failed'}`); }
        s = d2;
      }
      await load();
      if (andSend) {
        // Back to the list after sending, so nobody hits Send twice.
        setEditing(null); setView('list');
        flash(`Statement ${s.number} sent to the Controller (all Admins).`);
      } else {
        setEditing(s);
        flash(`Statement ${s.number} saved. Mitigation set to ${money(s.total)}.`);
      }
    } catch (e) { setFormError(e.message); } finally { setBusy(false); }
  };

  const sendOnly = async () => {
    if (!editing) return;
    if (editing.status === 'sent' && !window.confirm(`Statement ${editing.number} was already sent on ${fmtStamp(editing.sent_date)}. Send it again?`)) return;
    setBusy(true); setFormError('');
    try {
      const r = await fetch(`${apiUrl}/api/billing-statements/${editing.id}/send`, { method: 'POST', headers: auth });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send');
      await load(); setEditing(null); setView('list'); flash(`Statement ${d.number} sent to the Controller (all Admins).`);
    } catch (e) { setFormError(e.message); } finally { setBusy(false); }
  };

  const removeDraft = async () => {
    if (!editing || editing.status !== 'draft') return;
    if (!window.confirm(`Delete draft statement ${editing.number}? Its PDF is removed from the job's Documents.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiUrl}/api/billing-statements/${editing.id}`, { method: 'DELETE', headers: auth });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete');
      await load(); setView('list'); flash(`Draft ${editing.number} deleted.`);
    } catch (e) { setFormError(e.message); } finally { setBusy(false); }
  };

  const setQ = (id, k, v) => setQty((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const dirtyNote = editing && editing.status !== 'draft' ? 'Saving changes marks this statement "Changed since sent" until it is sent again.' : '';

  // ---------- List ----------
  const filtered = list.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [s.number, s.job_nickname, s.bill_to_name, s.property_address].some((v) => String(v || '').toLowerCase().includes(q));
  });

  if (view === 'edit') {
    const taken = jobId && !editing && takenJobs.get(jobId);
    return (
      <div className="bs">
        <div className="bs-head">
          <div>
            <button type="button" className="bs-link" onClick={() => { setView('list'); setEditing(null); }}>← Billing Statements</button>
            <h2 className="bs-title">{editing ? `Billing statement ${editing.number}` : 'New billing statement'}</h2>
          </div>
          {editing && <span className={STATUS[editing.status]?.cls}>{STATUS[editing.status]?.label}{editing.sent_date ? ` · sent ${fmtStamp(editing.sent_date)} by ${editing.sent_by}` : ''}</span>}
        </div>
        {message && <div className="bs-alert bs-alert-ok">{message}</div>}

        <section className="bs-card">
          <h3>1. Job</h3>
          <label className="bs-field">Job (all jobs, including Completed)
            <select value={jobId} onChange={(e) => pickJob(e.target.value)} disabled={Boolean(editing)}>
              <option value="">Choose a job…</option>
              {sortedJobs.map((j) => (
                <option key={j.id} value={j.id}>{j.nickname || j.address} · {j.type} · {j.status}{takenJobs.has(j.id) ? ` · has statement ${takenJobs.get(j.id).number}` : ''}</option>
              ))}
            </select>
          </label>
          {taken && (
            <div className="bs-alert bs-alert-warn">This job already has statement {taken.number}. <button type="button" className="bs-link" onClick={() => openStatement(taken.id)}>Open it</button>, or create a new job for a second visit.</div>
          )}
          {(job || editing) && !taken && (
            <div className="bs-grid2">
              <div className="bs-box">
                <div className="bs-k">Property (from job)</div>
                <div>{editing ? editing.property_contact : job?.customer_name}</div>
                <div>{editing ? editing.property_address : job?.address}</div>
                <div className="bs-muted">{editing ? editing.work_type : job?.type}</div>
              </div>
              <div className="bs-stack">
                <label className="bs-field">Billing Customer Name
                  <input type="text" value={form.bill_to_name || ''} onChange={(e) => setForm({ ...form, bill_to_name: e.target.value })} placeholder="e.g. CP Management: Sterling Hill Condo Association" />
                </label>
                <label className="bs-field">Billing Address
                  <textarea rows="2" value={form.bill_to_address || ''} onChange={(e) => setForm({ ...form, bill_to_address: e.target.value })} placeholder={'Street / PO Box\nTown, ST ZIP'} />
                </label>
                <div className="bs-muted">Saved back to the job.</div>
              </div>
            </div>
          )}
        </section>

        {(job || editing) && !taken && (
          <>
            <section className="bs-card">
              <h3>2. Dates &amp; description</h3>
              <div className="bs-grid3">
                <label className="bs-field">Date of loss<input type="date" value={form.date_of_loss || ''} onChange={(e) => setForm({ ...form, date_of_loss: e.target.value })} /></label>
                <label className="bs-field">Service start<input type="date" value={form.service_start || ''} onChange={(e) => setForm({ ...form, service_start: e.target.value })} /></label>
                <label className="bs-field">Service end<input type="date" value={form.service_end || ''} onChange={(e) => setForm({ ...form, service_end: e.target.value })} /></label>
              </div>
              <label className="bs-field">Description of services
                <textarea rows="4" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What happened and what MB2 did." />
              </label>
            </section>

            <section className="bs-card">
              <h3>3. Charges</h3>
              {callRows.length > 0 && (
                <fieldset className="bs-calls">
                  <legend>Emergency service call (one per job)</legend>
                  <label><input type="radio" name="bs-call" checked={!call} onChange={() => setCall('')} />None</label>
                  {callRows.map((r) => (
                    <label key={r.id}><input type="radio" name="bs-call" checked={call === r.id} onChange={() => setCall(r.id)} />{r.name.replace(/^Emergency service call – /i, '')} · {money(r.rate)}</label>
                  ))}
                </fieldset>
              )}
              <div className="bs-table-wrap">
                <table className="bs-table">
                  <thead><tr><th>Item</th><th>Units</th><th>Days / Hours</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
                  <tbody>
                    {otherRows.map((r) => {
                      const q = qty[r.id] || {}; const amt = lineAmount(r);
                      return (
                        <tr key={r.id} className={amt ? 'bs-row-on' : ''}>
                          <td>{r.name}{r.retired ? ' (retired rate)' : ''}</td>
                          <td>{r.kind === 'daily'
                            ? <input className="bs-num" inputMode="decimal" aria-label={`${r.name} units`} value={q.units ?? ''} onChange={(e) => setQ(r.id, 'units', e.target.value)} />
                            : <span className="bs-muted">–</span>}</td>
                          <td>{r.kind === 'one_time'
                            ? <label className="bs-inline"><input type="checkbox" checked={Boolean(q.on)} onChange={(e) => setQ(r.id, 'on', e.target.checked)} />Include</label>
                            : <><input className="bs-num" inputMode="decimal" aria-label={`${r.name} ${r.kind === 'daily' ? 'days' : 'hours'}`} value={q.quantity ?? ''} onChange={(e) => setQ(r.id, 'quantity', e.target.value)} />
                              <span className="bs-unit">{r.kind === 'daily' ? 'days' : 'hrs'}</span></>}</td>
                          <td className="r bs-muted">{money(r.rate)}{r.kind === 'daily' ? '/day' : r.kind === 'hourly' ? '/hr' : ''}</td>
                          <td className="r b">{amt ? money(amt) : '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bs-stack">
                <div className="bs-k">Miscellaneous (free-form, fixed amount)</div>
                {misc.map((m, i) => (
                  <div key={i} className="bs-misc">
                    <input type="text" aria-label="Description" value={m.description} placeholder="e.g. Set up containment" onChange={(e) => setMisc(misc.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
                    <input type="text" inputMode="decimal" aria-label="Amount" className="r" value={m.amount} placeholder="0.00" onChange={(e) => setMisc(misc.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
                    <button type="button" className="bs-x" aria-label="Remove line" onClick={() => setMisc(misc.filter((_, k) => k !== i))}>×</button>
                  </div>
                ))}
                <button type="button" className="bs-btn bs-btn-dashed" onClick={() => setMisc([...misc, { description: '', amount: '' }])}>+ Add miscellaneous line</button>
              </div>
              <div className="bs-total">
                <span className="bs-muted">Total sets the job's <strong>Mitigation</strong> amount{job && job.mitigation_amount ? ` (currently ${money(job.mitigation_amount)})` : ''}.</span>
                <span className="bs-total-v">Total {money(total)}</span>
              </div>
            </section>

            {formError && <div className="bs-alert bs-alert-error">{formError}</div>}
            {dirtyNote && <div className="bs-muted">{dirtyNote}</div>}
            <div className="bs-actions">
              {editing?.status === 'draft' && <button type="button" className="bs-btn bs-btn-danger" onClick={removeDraft} disabled={busy}>Delete draft</button>}
              <span className="bs-spacer" />
              {editing?.pdf_url && <a className="bs-btn" href={editing.pdf_url} target="_blank" rel="noopener noreferrer">Open PDF</a>}
              <button type="button" className="bs-btn" onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}</button>
              {editing && editing.status !== 'draft' && <button type="button" className="bs-btn" onClick={sendOnly} disabled={busy}>Send again</button>}
              <button type="button" className="bs-btn bs-btn-primary" onClick={() => save(true)} disabled={busy}>Save &amp; send to Controller</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bs">
      <div className="bs-head">
        <div>
          <h2 className="bs-title">Billing Statements</h2>
          <div className="bs-muted">Direct-bill work. Sent to the Controller, who creates the QuickBooks invoice.</div>
        </div>
        <div className="bs-actions">
          {isAdmin && <button type="button" className="bs-btn" onClick={() => setShowRates(true)}>Rate list</button>}
          <button type="button" className="bs-btn bs-btn-primary" onClick={startNew}>+ New statement</button>
        </div>
      </div>
      {message && <div className="bs-alert bs-alert-ok">{message}</div>}
      {error && <div className="bs-alert bs-alert-error">{error}</div>}
      <div className="bs-filters">
        <label className="bs-field">Search<input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Statement #, job, Bill To…" /></label>
        <label className="bs-field">Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="changed">Changed since sent</option>
          </select>
        </label>
      </div>
      {loading ? <div className="bs-muted">Loading…</div> : (
        <div className="bs-table-wrap">
          <table className="bs-table bs-list">
            <thead><tr><th>Statement #</th><th>Job / property</th><th>Bill To</th><th className="r">Total</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} onClick={() => openStatement(s.id)} className="bs-click">
                  <td><button type="button" className="bs-link b" onClick={(e) => { e.stopPropagation(); openStatement(s.id); }}>{s.number}</button></td>
                  <td>{s.job_nickname || s.property_address}<div className="bs-muted">Created {fmtStamp(s.created_date)} by {s.created_by}</div></td>
                  <td>{s.bill_to_name}</td>
                  <td className="r b">{money(s.total)}</td>
                  <td><span className={STATUS[s.status]?.cls}>{STATUS[s.status]?.label}</span>{s.sent_date && s.status === 'sent' ? <div className="bs-muted">{fmtStamp(s.sent_date)} · {s.sent_by}</div> : null}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5} className="bs-muted">{list.length ? 'No statements match.' : 'No billing statements yet. Click "+ New statement" to create one.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="bs-muted">Office / Admin only. One statement per job; a second visit gets its own job.</div>
      {showRates && <RateList apiUrl={apiUrl} auth={auth} rates={rates} onClose={() => setShowRates(false)} onSaved={(r) => { setRates(r); setShowRates(false); flash('Rate list saved. Existing statements keep their original rates.'); }} />}
    </div>
  );
}

// Admin: edit the rate list.
function RateList({ apiUrl, auth, rates, onClose, onSaved }) {
  const [items, setItems] = useState(rates.map((r) => ({ ...r, rate: String(r.rate) })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upd = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n); };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${apiUrl}/api/rate-items`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ items }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save');
      onSaved(d);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="bs-modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="bs-modal" role="dialog" aria-modal="true" aria-labelledby="bs-rates-title" onClick={(e) => e.stopPropagation()}>
        <div className="bs-head">
          <div>
            <h3 id="bs-rates-title" className="bs-title">Rate list</h3>
            <div className="bs-muted">Changes apply to new statements. Existing statements keep the rates they were made with. "Emergency call" items allow only one per statement.</div>
          </div>
          <button type="button" className="bs-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="bs-table-wrap">
          <table className="bs-table">
            <thead><tr><th>Item</th><th>Type</th><th className="r">Rate</th><th>Emergency call</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id || `new-${i}`}>
                  <td><input type="text" aria-label="Item name" value={it.name} onChange={(e) => upd(i, 'name', e.target.value)} /></td>
                  <td><select aria-label="Type" value={it.kind} onChange={(e) => upd(i, 'kind', e.target.value)}>
                    {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></td>
                  <td className="r"><input className="bs-num r" inputMode="decimal" aria-label="Rate" value={it.rate} onChange={(e) => upd(i, 'rate', e.target.value)} /></td>
                  <td><input type="checkbox" aria-label="Emergency call (one per statement)" checked={it.exclusive_group === 'emergency_call'} onChange={(e) => upd(i, 'exclusive_group', e.target.checked ? 'emergency_call' : null)} /></td>
                  <td className="bs-nowrap">
                    <button type="button" className="bs-x" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="bs-x" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="bs-x" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="bs-btn bs-btn-dashed" onClick={() => setItems([...items, { name: '', kind: 'hourly', rate: '', exclusive_group: null }])}>+ Add rate</button>
        {err && <div className="bs-alert bs-alert-error">{err}</div>}
        <div className="bs-actions">
          <span className="bs-spacer" />
          <button type="button" className="bs-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="bs-btn bs-btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save rate list'}</button>
        </div>
      </div>
    </div>
  );
}

export default BillingStatements;
