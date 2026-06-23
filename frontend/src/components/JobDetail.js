import React, { useState, useEffect } from 'react';
import './JobDetail.css';

function JobDetail({ job, apiUrl, onBack, currentUser, token, onDeleted }) {
  // Field staff get a limited, view-only job view (no financials/time/receipts/notes, no editing)
  const isFieldView = currentUser?.role === 'field';
  // Office/Admin can delete jobs (e.g. duplicates or test records)
  const canDelete = currentUser?.role === 'admin' || currentUser?.role === 'office';
  const [deleting, setDeleting] = useState(false);
  const [jobData, setJobData] = useState(job);
  const [projectNotes, setProjectNotes] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Dates arrive from the DB as full ISO timestamps (e.g. "2026-03-14T00:00:00.000Z").
  // <input type="date"> only accepts "YYYY-MM-DD" — anything else renders blank, which
  // then gets saved back as null and wipes the date. Truncate to the date part here.
  const toDateInput = (v) => (v ? String(v).slice(0, 10) : '');

  const [editForm, setEditForm] = useState({
    // Customer fields
    nickname: job.nickname || '',
    customer_name: job.customer_name || '',
    customer_phone: job.customer_phone || '',
    customer_email: job.customer_email || '',
    address: job.address || '',
    // Job details (editable)
    type: job.type || '',
    lead_source: job.lead_source || '',
    docusketch_url: job.docusketch_url || '',
    date_received: toDateInput(job.date_received),
    status: job.status,
    // Key dates
    start_date: toDateInput(job.start_date),
    date_completed: toDateInput(job.date_completed),
    date_invoiced: toDateInput(job.date_invoiced),
    // Financial
    mitigation_amount: job.mitigation_amount || '',
    repair_amount: job.repair_amount || '',
    other_amount: job.other_amount || '',
    // Documentation
    insurance_notes: job.insurance_notes || ''
  });

  const statuses = [
    'Lead',
    'Assessment Scheduled',
    'Referred for Testing',
    'Estimate Due',
    'Estimate Delivered',
    'Work Scheduled',
    'Work to be Scheduled',
    'In Process',
    'Hold',
    'Project Cancelled',
    'Send Final Bill',
    'Completed'
  ];

  useEffect(() => {
    fetchProjectNotes();
    fetchTimeEntries();
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const fetchProjectNotes = async () => {
    try {
      setLoadingNotes(true);
      const response = await fetch(`${apiUrl}/api/jobs/${job.id}/notes`);
      if (response.ok) {
        const data = await response.json();
        setProjectNotes(data);
      }
    } catch (err) {
      console.error('Error fetching project notes:', err);
    } finally {
      setLoadingNotes(false);
    }
  };

  const fetchTimeEntries = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/jobs/${job.id}/time-entries`);
      if (response.ok) {
        const data = await response.json();
        setTimeEntries(data);
      }
    } catch (err) {
      console.error('Error fetching time entries:', err);
    }
  };

  const fetchReceipts = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/jobs/${job.id}/receipts`);
      if (response.ok) {
        const data = await response.json();
        setReceipts(data);
      }
    } catch (err) {
      console.error('Error fetching receipts:', err);
    }
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveEdit = async () => {
    try {
      setError('');

      // Update customer info
      const customerResponse = await fetch(`${apiUrl}/api/customers/${job.customer_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.customer_name,
          email: editForm.customer_email,
          phone: editForm.customer_phone,
          address: editForm.address
        })
      });

      if (!customerResponse.ok) throw new Error('Failed to update customer');

      // Calculate project amount from breakdown
      const breakdownTotal =
        (parseFloat(editForm.mitigation_amount) || 0) +
        (parseFloat(editForm.repair_amount) || 0) +
        (parseFloat(editForm.other_amount) || 0);

      // Update job info
      const jobResponse = await fetch(`${apiUrl}/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: editForm.nickname,
          type: editForm.type,
          lead_source: editForm.lead_source,
          docusketch_url: editForm.docusketch_url,
          date_received: editForm.date_received || null,
          status: editForm.status,
          customer_email: editForm.customer_email,
          start_date: editForm.start_date || null,
          date_completed: editForm.date_completed || null,
          date_invoiced: editForm.date_invoiced || null,
          project_amount: breakdownTotal > 0 ? breakdownTotal : null,
          mitigation_amount: editForm.mitigation_amount || null,
          repair_amount: editForm.repair_amount || null,
          other_amount: editForm.other_amount || null,
          insurance_notes: editForm.insurance_notes
        })
      });

      if (!jobResponse.ok) throw new Error('Failed to update job');

      setJobData({
        ...jobData,
        ...editForm,
        project_amount: breakdownTotal
      });
      setIsEditing(false);
      setMessage('Job updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save changes');
      console.error('Save error:', err);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      setError('Please enter a note');
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/api/jobs/${job.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_text: newNote,
          created_by: currentUser?.name || 'Team Member'
        })
      });

      if (!response.ok) throw new Error('Failed to add note');

      const newNoteData = await response.json();
      setProjectNotes([newNoteData, ...projectNotes]);
      setNewNote('');
      setMessage('Note added successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '$0.00';
    return '$' + parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    // Postgres returns dates as full ISO timestamps; take just the date part and
    // parse as local so the day doesn't shift across timezones.
    const datePart = String(dateString).slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) return dateString;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
           date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Friendly labels for non-job time categories (mirrors TimeTracking.js)
  const CATEGORY_LABELS = {
    'category:pto': 'Paid Time Off',
    'category:shop': 'Shop',
    'category:bizdev': 'Business Development',
    'category:unpaid': 'Unpaid Time Off',
    'category:lunch': 'Lunch',
    'category:joblisted': 'Job Not Listed'
  };

  const csvCell = (v) => {
    const str = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };

  const exportTimeEntries = () => {
    const rows = [['Date', 'Person', 'Duration (hrs)', 'Description']];
    [...timeEntries]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach((e) => {
        const person = e.technician_name || e.technician_id || '';
        const hrs = e.duration_minutes ? (e.duration_minutes / 60).toFixed(2) : '';
        rows.push([e.date || '', person, hrs, e.notes || '']);
      });
    rows.push(['', '', (totalTimeMinutes / 60).toFixed(2), 'TOTAL']);
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (jobData.nickname || jobData.address || 'job').replace(/[^a-z0-9]+/gi, '_');
    a.href = url;
    a.download = `time_${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalTimeMinutes = timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
  const totalHours = (totalTimeMinutes / 60).toFixed(2);
  const totalExpenses = receipts.reduce((sum, receipt) => sum + (parseFloat(receipt.amount) || 0), 0);

  const exportReceipts = () => {
    const rows = [['Date', 'Person', 'Vendor', 'Amount', 'Description']];
    [...receipts]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach((r) => {
        const person = r.technician_name || r.technician_id || '';
        const amt = (parseFloat(r.amount) || 0).toFixed(2);
        rows.push([r.date || '', person, r.vendor || '', amt, r.description || '']);
      });
    rows.push(['', '', '', totalExpenses.toFixed(2), 'TOTAL']);
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (jobData.nickname || jobData.address || 'job').replace(/[^a-z0-9]+/gi, '_');
    a.href = url;
    a.download = `receipts_${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const breakdownTotal =
    (parseFloat(editForm.mitigation_amount) || 0) +
    (parseFloat(editForm.repair_amount) || 0) +
    (parseFloat(editForm.other_amount) || 0);

  const handleDelete = async () => {
    const label = jobData.nickname || jobData.address || 'this job';
    if (!window.confirm(
      `Delete "${label}"?\n\nThis permanently removes the job and all of its time entries, ` +
      `receipts, and notes. This cannot be undone.`
    )) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/jobs/${jobData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to delete job');
      }
      if (onDeleted) onDeleted(jobData.id);
      else onBack();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="job-detail-container">
      <button className="back-btn" onClick={onBack}>← Back to Jobs</button>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {/* Header */}
      <div className="detail-header">
        <div className="header-title">
          <h2>{jobData.nickname || jobData.address}</h2>
          <p className="job-id">Job ID: {jobData.id}</p>
        </div>
        <div className="header-actions">
          {!isFieldView && (
            <button
              className="edit-btn"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          )}
          {canDelete && !isEditing && (
            <button
              className="delete-job-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete Job'}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="detail-grid">
        {/* Left Column: Job Details */}
        <div className="detail-section">
          <h3>Job Information</h3>
          <div className="info-display">
            {isEditing && (
              <div className="form-group">
                <label>Job Name</label>
                <input
                  type="text"
                  name="nickname"
                  value={editForm.nickname}
                  onChange={handleEditChange}
                  placeholder="Job name / nickname"
                />
              </div>
            )}
            {isEditing ? (
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={editForm.address}
                  onChange={handleEditChange}
                  placeholder="Street address"
                />
              </div>
            ) : (
              <div className="info-row">
                <label>Address</label>
                <span>{jobData.address}</span>
              </div>
            )}
            {isEditing ? (
              <div className="form-group">
                <label>Work Type</label>
                <select
                  name="type"
                  value={editForm.type}
                  onChange={handleEditChange}
                >
                  <option value="">Select Work Type</option>
                  <option value="Water Mitigation">Water Mitigation</option>
                  <option value="Mold Remediation">Mold Remediation</option>
                  <option value="Fire Mitigation">Fire Mitigation</option>
                  <option value="Repair">Repair</option>
                  <option value="Biohazard Cleanup">Biohazard Cleanup</option>
                  <option value="Cleanup">Cleanup</option>
                </select>
              </div>
            ) : (
              <div className="info-row">
                <label>Work Type</label>
                <span>{jobData.type}</span>
              </div>
            )}
            {isEditing ? (
              <div className="form-group">
                <label>Lead Source</label>
                <input
                  type="text"
                  name="lead_source"
                  value={editForm.lead_source}
                  onChange={handleEditChange}
                  placeholder="Lead source"
                />
              </div>
            ) : (
              <div className="info-row">
                <label>Lead Source</label>
                <span>{jobData.lead_source || 'N/A'}</span>
              </div>
            )}

            {isEditing ? (
              <div className="form-group">
                <label>DocuSketch Link</label>
                <input
                  type="url"
                  name="docusketch_url"
                  value={editForm.docusketch_url}
                  onChange={handleEditChange}
                  placeholder="https://app.docusketch.com/player/..."
                />
              </div>
            ) : (
              <div className="info-row">
                <label>DocuSketch</label>
                <span>
                  {jobData.docusketch_url ? (
                    <a
                      href={jobData.docusketch_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="docusketch-link"
                    >
                      View 3D Tour ↗
                    </a>
                  ) : (
                    'N/A'
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Status & Customer */}
        <div className="detail-section">
          <h3>Status & Customer</h3>
          <div className="info-display">
            {isEditing ? (
              <div className="form-group">
                <label>Status</label>
                <select
                  name="status"
                  value={editForm.status}
                  onChange={handleEditChange}
                >
                  {statuses.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="info-row">
                <label>Status</label>
                <span className={`status-badge status-${jobData.status.toLowerCase().replace(/\s+/g, '-')}`}>{jobData.status}</span>
              </div>
            )}
            {isEditing ? (
              <>
                <div className="form-group">
                  <label>Customer Name</label>
                  <input
                    type="text"
                    name="customer_name"
                    value={editForm.customer_name}
                    onChange={handleEditChange}
                    placeholder="Customer name"
                  />
                </div>
                <div className="form-group">
                  <label>Customer Email</label>
                  <input
                    type="email"
                    name="customer_email"
                    value={editForm.customer_email}
                    onChange={handleEditChange}
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    name="customer_phone"
                    value={editForm.customer_phone}
                    onChange={handleEditChange}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="info-row">
                  <label>Customer Name</label>
                  <span>{jobData.customer_name}</span>
                </div>
                <div className="info-row">
                  <label>Customer Email</label>
                  <span>{jobData.customer_email || 'Not provided'}</span>
                </div>
                <div className="info-row">
                  <label>Phone</label>
                  <span>{jobData.customer_phone}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Project Notes Section — visible to everyone who can see the job */}
      <div className="detail-section">
        <h3>Project Notes</h3>
        <div className="form-group">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a project note..."
            rows="3"
          />
          <button
            className="add-note-btn"
            onClick={handleAddNote}
            disabled={!newNote.trim()}
          >
            Add Note
          </button>
        </div>

        {loadingNotes ? (
          <p style={{ textAlign: 'center', color: '#666' }}>Loading notes...</p>
        ) : projectNotes.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999' }}>No notes yet</p>
        ) : (
          <div className="notes-list">
            {projectNotes.map((note) => (
              <div key={note.id} className="note-item">
                <div className="note-header">
                  <span className="note-date">{formatDateTime(note.created_date)}</span>
                  <span className="note-author">{note.created_by}</span>
                </div>
                <p className="note-text">{note.note_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dates Section */}
      {isEditing || jobData.date_received || editForm.start_date || editForm.date_completed || editForm.date_invoiced ? (
        <div className="detail-section">
          <h3>Key Dates</h3>
          <div className="info-display">
            {isEditing ? (
              <div className="form-group">
                <label>Date Received</label>
                <input
                  type="date"
                  name="date_received"
                  value={editForm.date_received}
                  onChange={handleEditChange}
                />
              </div>
            ) : (
              <div className="info-row">
                <label>Date Received</label>
                <span>{formatDate(editForm.date_received) || formatDate(jobData.date_received) || formatDate(jobData.created_date)}</span>
              </div>
            )}
            {isEditing ? (
              <>
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    name="start_date"
                    value={editForm.start_date}
                    onChange={handleEditChange}
                  />
                </div>
                <div className="form-group">
                  <label>Date Completed</label>
                  <input
                    type="date"
                    name="date_completed"
                    value={editForm.date_completed}
                    onChange={handleEditChange}
                  />
                </div>
                <div className="form-group">
                  <label>Date Invoiced</label>
                  <input
                    type="date"
                    name="date_invoiced"
                    value={editForm.date_invoiced}
                    onChange={handleEditChange}
                  />
                </div>
              </>
            ) : (
              <>
                {editForm.start_date && (
                  <div className="info-row">
                    <label>Start Date</label>
                    <span>{formatDate(editForm.start_date)}</span>
                  </div>
                )}
                {editForm.date_completed && (
                  <div className="info-row">
                    <label>Date Completed</label>
                    <span>{formatDate(editForm.date_completed)}</span>
                  </div>
                )}
                {editForm.date_invoiced && (
                  <div className="info-row">
                    <label>Date Invoiced</label>
                    <span>{formatDate(editForm.date_invoiced)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Financial Section */}
      {!isFieldView && (isEditing || editForm.mitigation_amount || editForm.repair_amount || editForm.other_amount) ? (
        <div className="detail-section">
          <h3>Project Financials</h3>
          <div className="info-display">
            {isEditing ? (
              <>
                <div className="form-group">
                  <label>Mitigation Amount</label>
                  <input
                    type="number"
                    name="mitigation_amount"
                    value={editForm.mitigation_amount}
                    onChange={handleEditChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Repair Amount</label>
                  <input
                    type="number"
                    name="repair_amount"
                    value={editForm.repair_amount}
                    onChange={handleEditChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Other Amount</label>
                  <input
                    type="number"
                    name="other_amount"
                    value={editForm.other_amount}
                    onChange={handleEditChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="info-row" style={{ marginTop: '15px', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #ddd', paddingTop: '15px' }}>
                  <label>Project Total (Auto-Calculated)</label>
                  <span>{formatCurrency(breakdownTotal)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="info-row">
                  <label>Breakdown:</label>
                </div>
                <div className="info-row" style={{ paddingLeft: '20px' }}>
                  <label>Mitigation</label>
                  <span>{formatCurrency(editForm.mitigation_amount)}</span>
                </div>
                <div className="info-row" style={{ paddingLeft: '20px' }}>
                  <label>Repair</label>
                  <span>{formatCurrency(editForm.repair_amount)}</span>
                </div>
                <div className="info-row" style={{ paddingLeft: '20px' }}>
                  <label>Other</label>
                  <span>{formatCurrency(editForm.other_amount)}</span>
                </div>
                <div className="info-row" style={{ paddingLeft: '20px', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #ddd', paddingTop: '15px', marginTop: '10px' }}>
                  <label>Project Total</label>
                  <span>{formatCurrency(breakdownTotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Insurance Notes Section */}
      {!isFieldView && (isEditing || editForm.insurance_notes) ? (
        <div className="detail-section">
          <h3>Insurance Information</h3>
          {isEditing ? (
            <div className="form-group">
              <textarea
                name="insurance_notes"
                value={editForm.insurance_notes}
                onChange={handleEditChange}
                placeholder="Insurance company, claim number, adjuster contact, policy details, etc."
                rows="10"
              />
            </div>
          ) : (
            <div className="notes-text">
              {editForm.insurance_notes}
            </div>
          )}
        </div>
      ) : null}

      {/* Save Button (Editing Mode) */}
      {isEditing && (
        <div className="detail-section" style={{ textAlign: 'right' }}>
          <button className="save-btn" onClick={handleSaveEdit}>
            Save Changes
          </button>
        </div>
      )}

      {/* Time Tracking Summary */}
      {!isFieldView && timeEntries.length > 0 && (
        <div className="detail-section">
          <h3>Time Tracking</h3>
          <div className="time-summary-row">
            <div className="summary-card">
              <p className="label">Total Hours</p>
              <p className="value">{totalHours}</p>
              <p className="subtext">hours logged</p>
            </div>
            {timeEntries.length > 0 && (
              <button className="export-time-btn" onClick={exportTimeEntries}>
                Export Hours (CSV)
              </button>
            )}
          </div>
          <div className="entries-table">
            {timeEntries.slice(0, 10).map((entry) => (
              <div key={entry.id} className="entry-row">
                <div className="entry-cell">
                  <small>Date</small>
                  <p>{formatDate(entry.date)}</p>
                </div>
                <div className="entry-cell">
                  <small>User</small>
                  <p>{(entry.job_id && CATEGORY_LABELS[entry.job_id]) ? entry.technician_name : (entry.technician_name || entry.technician_id || '—')}</p>
                </div>
                <div className="entry-cell">
                  <small>Duration</small>
                  <p>{entry.duration_minutes ? `${(entry.duration_minutes / 60).toFixed(2)} hrs` : 'In Progress'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses Summary */}
      {!isFieldView && receipts.length > 0 && (
        <div className="detail-section">
          <h3>Expenses</h3>
          <div className="time-summary-row">
            <div className="summary-card">
              <p className="label">Total Expenses</p>
              <p className="value">{formatCurrency(totalExpenses)}</p>
              <p className="subtext">{receipts.length} receipts</p>
            </div>
            {receipts.length > 0 && (
              <button className="export-time-btn" onClick={exportReceipts}>
                Export Receipts (CSV)
              </button>
            )}
          </div>
          <div className="receipts-table">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="jd-receipt-row">
                {receipt.photo_url ? (
                  <a href={/^https?:\/\//i.test(receipt.photo_url) ? receipt.photo_url : `${apiUrl}${receipt.photo_url}`} target="_blank" rel="noopener noreferrer">
                    <img src={/^https?:\/\//i.test(receipt.photo_url) ? receipt.photo_url : `${apiUrl}${receipt.photo_url}`} alt="Receipt" className="jd-receipt-thumb" />
                  </a>
                ) : (
                  <div className="jd-receipt-thumb jd-receipt-nophoto">No photo</div>
                )}
                <div className="jd-receipt-info">
                  <div className="jd-receipt-top">
                    <span className="jd-receipt-amount">{formatCurrency(receipt.amount)}</span>
                    <span className="jd-receipt-date">{receipt.date}</span>
                  </div>
                  <div className="jd-receipt-vendor">{receipt.vendor || '—'}</div>
                  {receipt.technician_name && <div className="jd-receipt-person">{receipt.technician_name}</div>}
                  {receipt.description && <div className="jd-receipt-desc">{receipt.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default JobDetail;
