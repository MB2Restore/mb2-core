import React, { useState, useEffect, useCallback } from 'react';
import './TimesheetExport.css';

const CATEGORY_LABELS = {
  'category:pto': 'Paid Time Off',
  'category:shop': 'Shop',
  'category:unpaid': 'Unpaid Time Off',
  'category:lunch': 'Lunch',
  'category:joblisted': 'Job Not Listed'
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function fmtTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function labelFor(e) {
  if (e.job_id && CATEGORY_LABELS[e.job_id]) return CATEGORY_LABELS[e.job_id];
  return e.job_name || e.job_address || 'Job';
}
function csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function TimesheetExport({ apiUrl, token, currentUser }) {
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
      const res = await fetch(`${apiUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const list = res.ok ? await res.json() : [];
      const arr = Array.isArray(list) ? list : [];
      setUsers(arr);
      setSelectedIds(new Set(arr.map(u => u.id))); // default: all employees
    } catch (e) {
      setUsers([]);
    }
  }, [apiUrl, token, showInactive]);

  useEffect(() => { if (open) loadUsers(); }, [open, loadUsers]);

  const toggleUser = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(users.map(u => u.id)));
  const selectNone = () => setSelectedIds(new Set());

  const runExport = async () => {
    setError(''); setNote('');
    if (selectedIds.size === 0) { setError('Pick at least one employee'); return; }
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    if (!start || !end) { setError('Pick a valid start and end date'); return; }
    if (end < start) { setError('End date must be on or after start date'); return; }

    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/api/time-entries`);
      if (!res.ok) throw new Error('Failed to load time entries');
      const all = await res.json();

      const usersById = {};
      users.forEach(u => { usersById[u.id] = u; });

      // Filter: selected employees + within date range
      const rows = all.filter(e => {
        const inUser = selectedIds.has(e.technician_id) ||
          users.some(u => selectedIds.has(u.id) && u.name === e.technician_name);
        if (!inUser) return false;
        const d = parseLocalDate(e.date);
        return d && d >= start && d <= end;
      });

      // Group by employee, then sort by date + start time
      const nameOf = (e) => {
        if (e.technician_id && usersById[e.technician_id]) return usersById[e.technician_id].name;
        return e.technician_name || 'Unknown';
      };
      rows.sort((a, b) => {
        const na = nameOf(a), nb = nameOf(b);
        if (na !== nb) return na.localeCompare(nb);
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return new Date(a.clock_in) - new Date(b.clock_in);
      });

      // Build CSV
      // Lunch is unpaid: rows still appear, but totals exclude lunch so payroll isn't inflated.
      const isLunch = (e) => e.job_id === 'category:lunch';

      const lines = [];
      // Columns: Employee, Day, Date, Time In, Time Out, Hours, Job / Category, Description
      lines.push(['Employee', 'Day', 'Date', 'Time In', 'Time Out', 'Hours', 'Job / Category', 'Description'].map(csvCell).join(','));

      let grandPaidMinutes = 0;
      let grandLunchMinutes = 0;
      let i = 0;
      while (i < rows.length) {
        const emp = nameOf(rows[i]);
        let empPaidMinutes = 0;
        let empLunchMinutes = 0;
        while (i < rows.length && nameOf(rows[i]) === emp) {
          const e = rows[i];
          const d = parseLocalDate(e.date);
          const dow = d ? DAY_NAMES[d.getDay()] : '';
          const mins = e.duration_minutes || 0;
          const hrs = (mins / 60).toFixed(2);
          if (isLunch(e)) empLunchMinutes += mins; else empPaidMinutes += mins;
          lines.push([emp, dow, e.date, fmtTime(e.clock_in), fmtTime(e.clock_out), hrs, labelFor(e), e.notes || ''].map(csvCell).join(','));
          i++;
        }
        // Per-employee paid total (lunch excluded), plus a lunch line if any.
        // Total rows: label in the Job column, hours figure in the Hours column.
        lines.push(['', '', '', '', '', (empPaidMinutes / 60).toFixed(2), `${emp} paid total (excl. lunch)`, ''].map(csvCell).join(','));
        if (empLunchMinutes > 0) {
          lines.push(['', '', '', '', '', (empLunchMinutes / 60).toFixed(2), `${emp} lunch (unpaid)`, ''].map(csvCell).join(','));
        }
        lines.push(''); // blank spacer
        grandPaidMinutes += empPaidMinutes;
        grandLunchMinutes += empLunchMinutes;
      }

      lines.push(['', '', '', '', '', (grandPaidMinutes / 60).toFixed(2), 'GRAND TOTAL PAID (excl. lunch)', ''].map(csvCell).join(','));
      if (grandLunchMinutes > 0) {
        lines.push(['', '', '', '', '', (grandLunchMinutes / 60).toFixed(2), 'Total lunch (unpaid)', ''].map(csvCell).join(','));
      }

      if (rows.length === 0) {
        setNote('No time entries found for that selection. (Nothing to download.)');
        setBusy(false);
        return;
      }


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
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timesheet_${whoLabel}_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNote(`Exported ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setThisWeek = () => {
    const s = startOfWeek(new Date());
    setStartDate(toISODate(s));
    setEndDate(toISODate(addDays(s, 6)));
  };
  const setLastWeek = () => {
    const s = addDays(startOfWeek(new Date()), -7);
    setStartDate(toISODate(s));
    setEndDate(toISODate(addDays(s, 6)));
  };

  return (
    <div className="export-panel">
      {!open ? (
        <button className="export-toggle-btn" onClick={() => setOpen(true)}>
          Export Timesheets (CSV)
        </button>
      ) : (
        <div className="export-box">
          <div className="export-box-head">
            <h4>Export Timesheets</h4>
            <button className="export-close" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
          </div>

          <div className="export-row">
            <div className="export-field">
              <label>Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="export-field">
              <label>End date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="export-quick">
            <button type="button" onClick={setThisWeek}>This week</button>
            <button type="button" onClick={setLastWeek}>Last week</button>
          </div>

          <div className="export-employees">
            <div className="export-emp-head">
              <label>Employees</label>
              <div className="export-emp-actions">
                <button type="button" onClick={selectAll}>All</button>
                <button type="button" onClick={selectNone}>None</button>
              </div>
            </div>
            <label className="export-show-inactive">
              <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(v => !v)} />
              Show inactive (former) employees
            </label>
            <div className="export-emp-list">
              {users.length === 0 && <div className="export-empty">No employees found.</div>}
              {users.map(u => (
                <label key={u.id} className="export-emp-item">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  {u.name}{u.id === currentUser?.id ? ' (me)' : ''}{u.active === 0 ? ' (inactive)' : ''}
                </label>
              ))}
            </div>
          </div>

          {error && <div className="export-error">{error}</div>}
          {note && <div className="export-note">{note}</div>}

          <button className="export-run-btn" onClick={runExport} disabled={busy}>
            {busy ? 'Preparing...' : 'Download CSV'}
          </button>
        </div>
      )}
    </div>
  );
}

export default TimesheetExport;
