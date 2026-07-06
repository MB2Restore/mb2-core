import React, { useState, useEffect, useCallback } from 'react';
import './WeeklyTimesheet.css';

const CATEGORY_LABELS = {
  'category:pto': 'Paid Time Off',
  'category:shop': 'Shop',
  'category:unpaid': 'Unpaid Time Off',
  'category:lunch': 'Lunch',
  'category:joblisted': 'Job Not Listed'
};
const TIME_CATEGORIES = [
  { id: 'category:pto', label: 'Paid Time Off' },
  { id: 'category:shop', label: 'Shop' },
  { id: 'category:unpaid', label: 'Unpaid Time Off' },
  { id: 'category:lunch', label: 'Lunch' },
  { id: 'category:joblisted', label: 'Job Not Listed' }
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Split hour / minute / AM-PM time picker — easier on a phone than one long list.
// Value in/out is a 24-hour "HH:MM" string so the duration math is unchanged.
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTE_OPTIONS = ['00', '15', '30', '45'];

const splitTime = (value) => {
  if (!value || !value.includes(':')) return { hour12: '', minute: '', ampm: 'AM' };
  const [h, m] = value.split(':').map(Number);
  return {
    hour12: h % 12 === 0 ? 12 : h % 12,
    minute: String(m).padStart(2, '0'),
    ampm: h < 12 ? 'AM' : 'PM'
  };
};

const combineTime = (hour12, minute, ampm) => {
  let h = Number(hour12) % 12;
  if (ampm === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
};

// Reusable split picker. `value` is "HH:MM"; `onChange` receives a new "HH:MM".
function TimePicker({ value, onChange, label }) {
  const cur = splitTime(value);
  const update = (part, partValue) => {
    const next = { ...cur, [part]: partValue };
    onChange(combineTime(next.hour12 || 7, next.minute || '00', next.ampm || 'AM'));
  };
  return (
    <div className="ts-time-parts">
      <select aria-label={`${label} hour`} value={cur.hour12} onChange={e => update('hour12', e.target.value)}>
        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="ts-time-colon">:</span>
      <select aria-label={`${label} minute`} value={cur.minute} onChange={e => update('minute', e.target.value)}>
        {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select aria-label={`${label} AM or PM`} value={cur.ampm} onChange={e => update('ampm', e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

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

function fmtMonthDay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtRange(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const startStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

function fmtTime(dateTimeStr) {
  if (!dateTimeStr) return '--';
  // Read the clock time literally from the stored string — do NOT convert through
  // the browser timezone (Postgres tags these as 'Z'/UTC, which would shift them).
  const m = String(dateTimeStr).match(/T(\d{2}):(\d{2})/);
  if (!m) return '--';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${ampm}`;
}

function fmtHours(minutes) {
  return (minutes / 60).toFixed(2);
}

function labelFor(entry) {
  if (entry.job_id && CATEGORY_LABELS[entry.job_id]) return CATEGORY_LABELS[entry.job_id];
  return entry.job_name || entry.job_address || 'Job';
}

function timePartOf(dateTimeStr) {
  if (!dateTimeStr) return '';
  // Pull HH:MM literally from the stored string (no timezone conversion).
  const m = String(dateTimeStr).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

// Lock rule for FIELD STAFF: current week always; previous week only through Mon EOD; older locked.
function isWeekEditableByStaff(weekStartDate) {
  const thisWeek = startOfWeek(new Date());
  if (weekStartDate.getTime() === thisWeek.getTime()) return true;
  const prevWeek = addDays(thisWeek, -7);
  if (weekStartDate.getTime() === prevWeek.getTime()) {
    const today = new Date().getDay();
    return today === 0 || today === 1;
  }
  return false;
}

// targetUser: whose timesheet to show ({id, name}). canManage: viewer is office/admin (override lock + add-for-user).
function WeeklyTimesheet({ apiUrl, targetUser, canManage = false, jobs = [], refreshKey }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Admin "add entry for this user" form (open for a specific day index, or null)
  const [addingDay, setAddingDay] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [savingAdd, setSavingAdd] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!targetUser) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/time-entries`);
      if (!res.ok) throw new Error('Failed to load time entries');
      const all = await res.json();
      const theirs = all.filter(e =>
        e.technician_id === targetUser.id ||
        (e.technician_name && e.technician_name === targetUser.name)
      );
      setEntries(theirs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, targetUser]);

  useEffect(() => {
    fetchEntries();
    setEditingId(null);
    setAddingDay(null);
  }, [fetchEntries, refreshKey]);

  const weekEnd = addDays(weekStart, 6);
  // Editable if the viewer can manage (admin/office override), OR the staff lock allows it.
  const editable = canManage || isWeekEditableByStaff(weekStart);

  // Lunch is unpaid: it shows on the timesheet but is excluded from paid totals.
  const isLunch = (e) => e.job_id === 'category:lunch';

  const days = DAY_NAMES.map((name, i) => ({
    name, date: addDays(weekStart, i), entries: [], totalMinutes: 0, lunchMinutes: 0
  }));

  entries.forEach(e => {
    const d = parseLocalDate(e.date);
    if (!d) return;
    if (d >= weekStart && d <= weekEnd) {
      const idx = d.getDay();
      days[idx].entries.push(e);
      days[idx].totalMinutes += (e.duration_minutes || 0);
      if (isLunch(e)) days[idx].lunchMinutes += (e.duration_minutes || 0);
    }
  });
  days.forEach(day => day.entries.sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in)));

  const weekTotalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);
  const weekLunchMinutes = days.reduce((sum, d) => sum + d.lunchMinutes, 0);
  const weekPaidMinutes = weekTotalMinutes - weekLunchMinutes;
  const isCurrentWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();

  const leadingNumber = (job) => {
    const m = (job.nickname || job.address || '').trim().match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };
  const sortedJobs = [...jobs].sort((a, b) => {
    const na = leadingNumber(a), nb = leadingNumber(b);
    if (na !== nb) return na - nb;
    return (a.nickname || a.address || '').localeCompare(b.nickname || b.address || '');
  });

  const durationFor = (start, stop) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = stop.split(':').map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  };

  // ----- Edit existing -----
  const startEdit = (e) => {
    setError(''); setAddingDay(null);
    setEditingId(e.id);
    setEditForm({
      job_id: e.job_id || '',
      date: e.date,
      timeStart: timePartOf(e.clock_in),
      timeStop: timePartOf(e.clock_out),
      notes: e.notes || ''
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const editChange = (f, v) => setEditForm(prev => ({ ...prev, [f]: v }));

  const saveEdit = async (entry) => {
    if (!editForm.job_id) { setError('Please choose a job or category'); return; }
    if (!editForm.timeStart || !editForm.timeStop) { setError('Please set start and stop times'); return; }
    if (editForm.timeStop <= editForm.timeStart) { setError('Stop time must be after start time'); return; }
    setSavingEdit(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/api/time-entries/${entry.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: editForm.job_id,
          date: editForm.date,
          clock_in: `${editForm.date}T${editForm.timeStart}:00`,
          clock_out: `${editForm.date}T${editForm.timeStop}:00`,
          duration_minutes: durationFor(editForm.timeStart, editForm.timeStop),
          notes: editForm.notes
        })
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save changes'); }
      cancelEdit(); fetchEntries();
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm('Delete this time entry? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/time-entries/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete entry'); }
      fetchEntries();
    } catch (err) { setError(err.message); }
  };

  // ----- Admin add-for-user -----
  const startAdd = (day) => {
    setError(''); setEditingId(null);
    setAddingDay(day.date.getDay());
    setAddForm({ job_id: '', date: toISODate(day.date), timeStart: '07:00', timeStop: '07:00', notes: '' });
  };
  const cancelAdd = () => { setAddingDay(null); setAddForm(null); };
  const addChange = (f, v) => setAddForm(prev => ({ ...prev, [f]: v }));

  const saveAdd = async () => {
    if (!addForm.job_id) { setError('Please choose a job or category'); return; }
    if (addForm.timeStop <= addForm.timeStart) { setError('Stop time must be after start time'); return; }
    setSavingAdd(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/api/time-entries/manual`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: addForm.job_id,
          technician_id: targetUser.id,
          technician_name: targetUser.name,
          date: addForm.date,
          clock_in: `${addForm.date}T${addForm.timeStart}:00`,
          clock_out: `${addForm.date}T${addForm.timeStop}:00`,
          duration_minutes: durationFor(addForm.timeStart, addForm.timeStop),
          notes: addForm.notes
        })
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to add entry'); }
      cancelAdd(); fetchEntries();
    } catch (err) { setError(err.message); } finally { setSavingAdd(false); }
  };

  const jobCategorySelect = (value, onChange) => (
    <select value={value} onChange={ev => onChange(ev.target.value)}>
      <option value="">-- Choose --</option>
      <optgroup label="Time Categories">
        {TIME_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </optgroup>
      <optgroup label="Jobs">
        {sortedJobs.map(j => <option key={j.id} value={j.id}>{j.nickname || j.address}</option>)}
      </optgroup>
    </select>
  );

  return (
    <div className="timesheet">
      <div className="timesheet-header">
        <button className="week-nav-btn" onClick={() => { cancelEdit(); cancelAdd(); setWeekStart(addDays(weekStart, -7)); }} aria-label="Previous week">
          &#8249; Prev
        </button>
        <div className="week-label">
          <div className="week-range">{fmtRange(weekStart)}</div>
          {isCurrentWeek && <div className="week-tag">This week</div>}
        </div>
        <button className="week-nav-btn" onClick={() => { cancelEdit(); cancelAdd(); setWeekStart(addDays(weekStart, 7)); }} aria-label="Next week" disabled={isCurrentWeek}>
          Next &#8250;
        </button>
      </div>

      {!editable && (
        <div className="timesheet-locked-note">
          This week is locked for payroll. Existing entries can't be edited &mdash; ask an admin if a change is needed.
        </div>
      )}

      {error && <div className="timesheet-error">{error}</div>}
      {loading && <div className="timesheet-loading">Loading...</div>}

      {!loading && (
        <div className="timesheet-body">
          {days.map((day, i) => (
            <div key={i} className={`ts-day ${day.entries.length === 0 ? 'ts-day-empty' : ''}`}>
              <div className="ts-day-head">
                <span className="ts-day-name">{day.name}</span>
                <span className="ts-day-date">{fmtMonthDay(day.date)}</span>
                <span className="ts-day-total">
                  {day.totalMinutes > 0
                    ? `${fmtHours(day.totalMinutes - day.lunchMinutes)} hrs${day.lunchMinutes > 0 ? ` (−${fmtHours(day.lunchMinutes)} lunch)` : ''}`
                    : '--'}
                </span>
                {canManage && addingDay !== day.date.getDay() && (
                  <button className="ts-add-day-btn" onClick={() => startAdd(day)} aria-label={`Add entry for ${day.name}`}>+ Add</button>
                )}
              </div>

              {day.entries.length > 0 && (
                <div className="ts-entries">
                  {day.entries.map(e => (
                    editingId === e.id ? (
                      <div key={e.id} className="ts-edit-row">
                        <div className="ts-edit-field">
                          <label>Job / Category</label>
                          {jobCategorySelect(editForm.job_id, v => editChange('job_id', v))}
                        </div>
                        <div className="ts-edit-times">
                          <div className="ts-edit-field">
                            <label>Start</label>
                            <TimePicker label="Start" value={editForm.timeStart} onChange={v => editChange('timeStart', v)} />
                          </div>
                          <div className="ts-edit-field">
                            <label>Stop</label>
                            <TimePicker label="Stop" value={editForm.timeStop} onChange={v => editChange('timeStop', v)} />
                          </div>
                        </div>
                        <div className="ts-edit-field">
                          <label>Description</label>
                          <textarea
                            className="ts-edit-notes"
                            value={editForm.notes}
                            onChange={e => editChange('notes', e.target.value)}
                            placeholder="What was worked on?"
                            rows="2"
                          />
                        </div>
                        <div className="ts-edit-actions">
                          <button className="ts-save-btn" onClick={() => saveEdit(e)} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</button>
                          <button className="ts-cancel-btn" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div key={e.id} className="ts-entry">
                        <span className="ts-entry-time">{fmtTime(e.clock_in)} - {fmtTime(e.clock_out)}</span>
                        <span className="ts-entry-job">{labelFor(e)}</span>
                        <span className="ts-entry-hrs">{fmtHours(e.duration_minutes || 0)}</span>
                        {editable && (
                          <span className="ts-entry-actions">
                            <button className="ts-edit-btn" onClick={() => startEdit(e)} aria-label="Edit entry">Edit</button>
                            <button className="ts-del-btn" onClick={() => deleteEntry(e)} aria-label="Delete entry">Delete</button>
                          </span>
                        )}
                      </div>
                    )
                  ))}
                </div>
              )}

              {canManage && addingDay === day.date.getDay() && addForm && (
                <div className="ts-edit-row ts-add-row">
                  <div className="ts-edit-field">
                    <label>Job / Category</label>
                    {jobCategorySelect(addForm.job_id, v => addChange('job_id', v))}
                  </div>
                  <div className="ts-edit-times">
                    <div className="ts-edit-field">
                      <label>Start</label>
                      <TimePicker label="Start" value={addForm.timeStart} onChange={v => addChange('timeStart', v)} />
                    </div>
                    <div className="ts-edit-field">
                      <label>Stop</label>
                      <TimePicker label="Stop" value={addForm.timeStop} onChange={v => addChange('timeStop', v)} />
                    </div>
                  </div>
                  <div className="ts-edit-field">
                    <label>Description</label>
                    <textarea
                      className="ts-edit-notes"
                      value={addForm.notes}
                      onChange={e => addChange('notes', e.target.value)}
                      placeholder="What was worked on?"
                      rows="2"
                    />
                  </div>
                  <div className="ts-edit-actions">
                    <button className="ts-save-btn" onClick={saveAdd} disabled={savingAdd}>{savingAdd ? 'Adding...' : 'Add Entry'}</button>
                    <button className="ts-cancel-btn" onClick={cancelAdd} disabled={savingAdd}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="ts-week-total">
            <div className="ts-week-total-main">
              <span>Week Total</span>
              <span className="ts-week-total-hrs">{fmtHours(weekPaidMinutes)} hrs</span>
            </div>
            <div className="ts-week-total-sub">
              <span>Total logged: {fmtHours(weekTotalMinutes)} hrs</span>
              {weekLunchMinutes > 0 && <span>Lunch (unpaid): {fmtHours(weekLunchMinutes)} hrs</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WeeklyTimesheet;
