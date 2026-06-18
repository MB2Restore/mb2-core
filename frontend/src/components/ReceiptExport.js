import React, { useState, useEffect, useCallback } from 'react';
import './ReceiptExport.css';

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function ReceiptExport({ apiUrl, token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [startDate, setStartDate] = useState(() => toISODate(startOfWeek(new Date())));
  const [endDate, setEndDate] = useState(() => toISODate(addDays(startOfWeek(new Date()), 6)));
  const [open, setOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const endpoint = showInactive ? '/api/users/all' : '/api/users/active';
      const res = await fetch(`${apiUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      const list = res.ok ? await res.json() : [];
      const arr = Array.isArray(list) ? list : [];
      setUsers(arr);
      setSelectedIds(new Set(arr.map(u => u.id)));
    } catch (e) { setUsers([]); }
  }, [apiUrl, token, showInactive]);

  useEffect(() => { if (open) loadUsers(); }, [open, loadUsers]);

  const toggleUser = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelectedIds(new Set(users.map(u => u.id)));
  const selectNone = () => setSelectedIds(new Set());

  const runExport = async () => {
    setError(''); setNote('');
    if (selectedIds.size === 0) { setError('Pick at least one employee'); return; }
    const start = parseLocalDate(startDate), end = parseLocalDate(endDate);
    if (!start || !end) { setError('Pick a valid date range'); return; }
    if (end < start) { setError('End date must be on or after start date'); return; }

    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/api/receipts`);
      if (!res.ok) throw new Error('Failed to load receipts');
      const all = await res.json();
      const usersById = {}; users.forEach(u => { usersById[u.id] = u; });

      const rows = all.filter(r => {
        const inUser = selectedIds.has(r.technician_id) ||
          users.some(u => selectedIds.has(u.id) && u.name === r.technician_name);
        if (!inUser) return false;
        const d = parseLocalDate(r.date);
        return d && d >= start && d <= end;
      });

      const nameOf = (r) => (r.technician_id && usersById[r.technician_id]) ? usersById[r.technician_id].name : (r.technician_name || 'Unknown');
      rows.sort((a, b) => {
        const na = nameOf(a), nb = nameOf(b);
        if (na !== nb) return na.localeCompare(nb);
        return (a.date || '').localeCompare(b.date || '');
      });

      const lines = [];
      lines.push(['Employee', 'Date', 'Vendor', 'Amount', 'Job', 'Description'].map(csvCell).join(','));
      let grand = 0, i = 0;
      while (i < rows.length) {
        const emp = nameOf(rows[i]);
        let empTotal = 0;
        while (i < rows.length && nameOf(rows[i]) === emp) {
          const r = rows[i];
          const amt = parseFloat(r.amount) || 0;
          empTotal += amt;
          const job = r.job_name || r.job_address || '';
          lines.push([emp, r.date || '', r.vendor || '', amt.toFixed(2), job, r.description || ''].map(csvCell).join(','));
          i++;
        }
        lines.push(['', '', '', empTotal.toFixed(2), `${emp} total`, ''].map(csvCell).join(','));
        lines.push('');
        grand += empTotal;
      }
      lines.push(['', '', '', grand.toFixed(2), 'GRAND TOTAL', ''].map(csvCell).join(','));

      if (rows.length === 0) { setNote('No receipts found for that selection.'); setBusy(false); return; }


      // Build a filename descriptor: single employee's name, or all/multiple
      const safe = (str) => (str || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      let whoLabel;
      if (selectedIds.size === users.length && users.length > 0) {
        whoLabel = 'all_employees';
      } else if (selectedIds.size === 1) {
        const only = users.find(u => selectedIds.has(u.id));
        whoLabel = safe(only ? only.name : 'employee');
      } else {
        whoLabel = `${selectedIds.size}_employees`;
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `receipts_${whoLabel}_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNote(`Exported ${rows.length} receipt${rows.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setThisWeek = () => { const s = startOfWeek(new Date()); setStartDate(toISODate(s)); setEndDate(toISODate(addDays(s, 6))); };
  const setThisMonth = () => {
    const now = new Date();
    setStartDate(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  };

  return (
    <div className="rexport-panel">
      {!open ? (
        <button className="rexport-toggle-btn" onClick={() => setOpen(true)}>Export Receipts (CSV)</button>
      ) : (
        <div className="rexport-box">
          <div className="rexport-box-head">
            <h4>Export Receipts</h4>
            <button className="rexport-close" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
          </div>
          <div className="rexport-row">
            <div className="rexport-field">
              <label>Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="rexport-field">
              <label>End date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="rexport-quick">
            <button type="button" onClick={setThisWeek}>This week</button>
            <button type="button" onClick={setThisMonth}>This month</button>
          </div>
          <div className="rexport-employees">
            <div className="rexport-emp-head">
              <label>Employees</label>
              <div className="rexport-emp-actions">
                <button type="button" onClick={selectAll}>All</button>
                <button type="button" onClick={selectNone}>None</button>
              </div>
            </div>
            <label className="rexport-show-inactive">
              <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(v => !v)} />
              Show inactive (former) employees
            </label>
            <div className="rexport-emp-list">
              {users.length === 0 && <div className="rexport-empty">No employees found.</div>}
              {users.map(u => (
                <label key={u.id} className="rexport-emp-item">
                  <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleUser(u.id)} />
                  {u.name}{u.id === currentUser?.id ? ' (me)' : ''}{u.active === 0 ? ' (inactive)' : ''}
                </label>
              ))}
            </div>
          </div>
          {error && <div className="rexport-error">{error}</div>}
          {note && <div className="rexport-note">{note}</div>}
          <button className="rexport-run-btn" onClick={runExport} disabled={busy}>
            {busy ? 'Preparing...' : 'Download CSV'}
          </button>
        </div>
      )}
    </div>
  );
}

export default ReceiptExport;
