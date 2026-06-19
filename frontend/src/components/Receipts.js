import React, { useState, useEffect, useCallback } from 'react';
import './Receipts.css';
import ReceiptExport from './ReceiptExport';

const TRACKABLE_STATUSES = [
  'In Process', 'Estimate Delivered', 'Estimated Delivered',
  'Work Scheduled', 'Work to be Scheduled'
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function fmtMoney(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '$0.00';
  return '$' + n.toFixed(2);
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function weekRangeLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const s = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} - ${e}`;
}

function Receipts({ jobs = [], apiUrl, currentUser, token }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [activeUsers, setActiveUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(currentUser?.id || '');
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'office';

  // List view: 'week' (grouped Sun-Sat) or 'job' (filter by job)
  const [viewMode, setViewMode] = useState('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [jobFilter, setJobFilter] = useState('all');

  const emptyForm = { job_id: '', date: todayISO(), vendor: '', amount: '', description: '', photo: '', photoPreview: '' };
  const [form, setForm] = useState(emptyForm);

  // Office/Admin: load active users for the picker
  useEffect(() => {
    if (!canManage || !token) return;
    fetch(`${apiUrl}/api/users/active`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : []))
      .then(list => setActiveUsers(Array.isArray(list) ? list : []))
      .catch(() => setActiveUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, token, canManage]);

  const targetUser = selectedUserId === currentUser?.id
    ? { id: currentUser?.id, name: currentUser?.name }
    : (activeUsers.find(u => u.id === selectedUserId) || { id: currentUser?.id, name: currentUser?.name });

  const fetchReceipts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/api/receipts`);
      if (!res.ok) throw new Error('Failed to load receipts');
      const all = await res.json();
      const mine = all.filter(r =>
        r.technician_id === targetUser.id ||
        (r.technician_name && r.technician_name === targetUser.name)
      );
      setReceipts(mine);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, targetUser.id, targetUser.name]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  const sortedJobs = [...jobs]
    .filter(j => TRACKABLE_STATUSES.includes(j.status))
    .sort((a, b) => {
      const na = (a.nickname || a.address || '').match(/^\s*(\d+)/);
      const nb = (b.nickname || b.address || '').match(/^\s*(\d+)/);
      const va = na ? parseInt(na[1], 10) : Infinity;
      const vb = nb ? parseInt(nb[1], 10) : Infinity;
      if (va !== vb) return va - vb;
      return (a.nickname || a.address || '').localeCompare(b.nickname || b.address || '');
    });

  const jobLabel = (r) => r.job_name || r.job_address || 'Job';

  // R2 stores a full https URL; local disk stores a relative /uploads path.
  // Only prepend the API base for relative paths.
  const photoSrc = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${apiUrl}${u}`);

  const flash = (m) => { setMessage(m); setTimeout(() => setMessage(''), 3000); };

  // Resize + compress the photo in the browser BEFORE upload, so field staff send
  // a ~300KB image instead of a multi-MB phone photo. Scales the long edge down to
  // MAX_EDGE and re-encodes as JPEG. Falls back to the raw file if anything fails.
  const MAX_EDGE = 1600;
  const JPEG_QUALITY = 0.75;

  const compressImage = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > MAX_EDGE || height > MAX_EDGE) {
            if (width >= height) { height = Math.round(height * (MAX_EDGE / width)); width = MAX_EDGE; }
            else { width = Math.round(width * (MAX_EDGE / height)); height = MAX_EDGE; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // White background so transparent PNGs don't go black when flattened to JPEG
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        } catch (err) {
          resolve(reader.result); // fall back to original
        }
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const handlePhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    if (dataUrl) setForm(prev => ({ ...prev, photo: dataUrl, photoPreview: dataUrl }));
  };

  const change = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm, date: todayISO() }); setShowForm(true); setError(''); };
  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      job_id: r.job_id || '',
      date: r.date || todayISO(),
      vendor: r.vendor || '',
      amount: r.amount != null ? String(r.amount) : '',
      description: r.description || '',
      photo: '',
      photoPreview: photoSrc(r.photo_url)
    });
    setShowForm(true); setError('');
  };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.job_id) { setError('Please choose a job'); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError('Please enter a valid amount'); return; }
    setSaving(true); setError('');
    try {
      let res;
      if (editingId) {
        const body = {
          job_id: form.job_id, date: form.date, vendor: form.vendor,
          amount: parseFloat(form.amount), description: form.description
        };
        if (form.photo) body.photo = form.photo; // only if a new photo was chosen
        res = await fetch(`${apiUrl}/api/receipts/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
      } else {
        res = await fetch(`${apiUrl}/api/receipts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: form.job_id,
            technician_id: targetUser.id,
            technician_name: targetUser.name,
            date: form.date,
            vendor: form.vendor,
            amount: parseFloat(form.amount),
            description: form.description,
            photo: form.photo
          })
        });
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save receipt'); }
      flash(editingId ? 'Receipt updated ✓' : 'Receipt added ✓');
      cancel();
      fetchReceipts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm('Delete this receipt? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/receipts/${r.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete'); }
      fetchReceipts();
    } catch (err) {
      setError(err.message);
    }
  };

  const renderReceiptCard = (r) => (
    <div key={r.id} className="receipt-item">
      {r.photo_url ? (
        <a href={photoSrc(r.photo_url)} target="_blank" rel="noopener noreferrer" className="receipt-thumb-link">
          <img src={photoSrc(r.photo_url)} alt="Receipt" className="receipt-thumb" />
        </a>
      ) : (
        <div className="receipt-thumb receipt-no-photo">No photo</div>
      )}
      <div className="receipt-info">
        <div className="receipt-top">
          <span className="receipt-amount">{fmtMoney(r.amount)}</span>
          <span className="receipt-date">{fmtDate(r.date)}</span>
        </div>
        <div className="receipt-vendor">{r.vendor || '—'}</div>
        <div className="receipt-job">{jobLabel(r)}</div>
        {r.description && <div className="receipt-desc">{r.description}</div>}
        <div className="receipt-actions">
          <button className="r-edit-btn" onClick={() => openEdit(r)}>Edit</button>
          <button className="r-del-btn" onClick={() => remove(r)}>Delete</button>
        </div>
      </div>
    </div>
  );

  const viewingSelf = selectedUserId === currentUser?.id;

  return (
    <div className="receipts-container">
      <div className="receipts-card">
        <h2>🧾 Receipts</h2>
        <p className="subtitle">Snap a photo, assign to a job, and track hard costs</p>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        <div className="receipt-form-area">
          {!showForm ? (
            <button onClick={openNew} className="add-receipt-btn">+ Add Receipt</button>
          ) : (
            <form onSubmit={submit} className="receipt-form">
              <h3>{editingId ? 'Edit Receipt' : 'Add Receipt'}</h3>

              {!editingId && (
                <div className="form-group">
                  <label>{canManage && !viewingSelf ? `Logging for ${targetUser.name}` : 'Logged in as'}</label>
                  <div className="current-user-display">{targetUser.name}</div>
                </div>
              )}

              <div className="form-group">
                <label>Receipt Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhoto}
                  className="photo-input"
                />
                {form.photoPreview && (
                  <img src={form.photoPreview} alt="Receipt preview" className="photo-preview" />
                )}
              </div>

              <div className="form-group">
                <label>Job</label>
                <select value={form.job_id} onChange={e => change('job_id', e.target.value)}>
                  <option value="">-- Choose a job --</option>
                  {sortedJobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.nickname || j.address} ({j.customer_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => change('date', e.target.value)} />
              </div>

              <div className="form-group">
                <label>Vendor</label>
                <input type="text" value={form.vendor} onChange={e => change('vendor', e.target.value)} placeholder="e.g. Lowes, Home Depot" />
              </div>

              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => change('amount', e.target.value)} placeholder="0.00" />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={e => change('description', e.target.value)} placeholder="What was purchased?" rows="2" />
              </div>

              <div className="form-actions">
                <button type="submit" className="rc-submit-btn" disabled={saving}>
                  {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Receipt')}
                </button>
                <button type="button" className="rc-cancel-btn" onClick={cancel} disabled={saving}>Cancel</button>
              </div>
            </form>
          )}
        </div>

        <div className="receipts-list-section">
          <div className="receipts-list-head">
            <h3>{canManage && !viewingSelf ? 'Receipts' : 'My Receipts'}</h3>
            {canManage && (
              <div className="receipts-user-picker">
                <label>Employee</label>
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
                  <option value={currentUser?.id}>{currentUser?.name} (me)</option>
                  {activeUsers.filter(u => u.id !== currentUser?.id).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {canManage && <ReceiptExport apiUrl={apiUrl} token={token} currentUser={currentUser} />}

          {/* View toggle */}
          <div className="receipts-view-toggle">
            <button
              className={`rv-toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              By Week
            </button>
            <button
              className={`rv-toggle-btn ${viewMode === 'job' ? 'active' : ''}`}
              onClick={() => setViewMode('job')}
            >
              By Job
            </button>
          </div>

          {loading ? (
            <p className="loading-text">Loading...</p>
          ) : receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🧾</div>
              <p className="empty-title">No receipts yet</p>
              <p className="empty-sub">Tap <strong>+ Add Receipt</strong> to log your first one.</p>
            </div>
          ) : viewMode === 'week' ? (
            (() => {
              const weekEnd = addDays(weekStart, 6);
              const inWeek = receipts.filter(r => {
                const d = parseLocalDate(r.date);
                return d && d >= weekStart && d <= weekEnd;
              }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
              const weekTotal = inWeek.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
              const isCurrentWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
              return (
                <>
                  <div className="receipts-week-nav">
                    <button className="week-nav-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>&#8249; Prev</button>
                    <div className="week-label">
                      <div className="week-range">{weekRangeLabel(weekStart)}</div>
                      {isCurrentWeek && <div className="week-tag">This week</div>}
                    </div>
                    <button className="week-nav-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={isCurrentWeek}>Next &#8250;</button>
                  </div>
                  <div className="receipts-total">Week total: {fmtMoney(weekTotal)} · {inWeek.length} receipt{inWeek.length === 1 ? '' : 's'}</div>
                  {inWeek.length === 0 ? (
                    <div className="empty-state empty-state-sm">
                      <div className="empty-icon">🧾</div>
                      <p className="empty-title">No receipts this week</p>
                      <p className="empty-sub">Nothing logged for this week yet.</p>
                    </div>
                  ) : (
                    <div className="receipts-grid">
                      {inWeek.map(r => renderReceiptCard(r))}
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            (() => {
              const jobsWithReceipts = Array.from(new Set(receipts.map(r => r.job_id)))
                .map(jid => {
                  const sample = receipts.find(r => r.job_id === jid);
                  return { id: jid, label: sample ? jobLabel(sample) : 'Job' };
                })
                .sort((a, b) => a.label.localeCompare(b.label));
              const filtered = jobFilter === 'all' ? receipts : receipts.filter(r => r.job_id === jobFilter);
              const filteredTotal = filtered.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
              // group by job
              const groups = {};
              filtered.forEach(r => { (groups[r.job_id] = groups[r.job_id] || []).push(r); });
              const groupKeys = Object.keys(groups).sort((a, b) => jobLabel(groups[a][0]).localeCompare(jobLabel(groups[b][0])));
              return (
                <>
                  <div className="receipts-job-filter">
                    <label>Filter by job</label>
                    <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
                      <option value="all">All jobs</option>
                      {jobsWithReceipts.map(j => (
                        <option key={j.id} value={j.id}>{j.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="receipts-total">Total: {fmtMoney(filteredTotal)} · {filtered.length} receipt{filtered.length === 1 ? '' : 's'}</div>
                  {groupKeys.map(jid => {
                    const groupTotal = groups[jid].reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                    return (
                      <div key={jid} className="receipts-job-group">
                        <div className="receipts-job-group-head">
                          <span className="rjg-name">{jobLabel(groups[jid][0])}</span>
                          <span className="rjg-total">{fmtMoney(groupTotal)}</span>
                        </div>
                        <div className="receipts-grid">
                          {groups[jid]
                            .slice()
                            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                            .map(r => renderReceiptCard(r))}
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

export default Receipts;
