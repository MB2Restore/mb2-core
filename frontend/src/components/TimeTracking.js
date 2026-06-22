import React, { useState, useEffect } from 'react';
import './TimeTracking.css';
import WeeklyTimesheet from './WeeklyTimesheet';
import TimesheetExport from './TimesheetExport';

function TimeTracking({ jobs, apiUrl, currentUser, token }) {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [timesheetRefresh, setTimesheetRefresh] = useState(0);
  const [activeUsers, setActiveUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(currentUser?.id || '');

  // Office/Admin can view & manage anyone's timesheet. Field sees only themselves.
  const canManageTimesheets = currentUser?.role === 'admin' || currentUser?.role === 'office';

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    timeStart: '07:00',
    timeStop: '07:00',
    description: ''
  });

  useEffect(() => {
    if (!canManageTimesheets || !token) return;
    fetch(`${apiUrl}/api/users/active`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : []))
      .then(list => setActiveUsers(Array.isArray(list) ? list : []))
      .catch(() => setActiveUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, token, canManageTimesheets]);

  // Non-job time categories field staff can log (PTO, shop time, etc.)
  // These use sentinel IDs ("category:...") instead of a real job id.
  const TIME_CATEGORIES = [
    { id: 'category:pto', label: 'Paid Time Off' },
    { id: 'category:shop', label: 'Shop' },
    { id: 'category:bizdev', label: 'Business Development' },
    { id: 'category:unpaid', label: 'Unpaid Time Off' },
    { id: 'category:lunch', label: 'Lunch' },
    { id: 'category:joblisted', label: 'Job Not Listed' }
  ];
  const isCategory = (id) => typeof id === 'string' && id.startsWith('category:');

  // Split hour / minute / AM-PM dropdowns — far easier to thumb through on a phone
  // than one long list. The form value stays a 24-hour "HH:MM" string, so the
  // duration math and backend payload below are unchanged.
  const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
  const MINUTE_OPTIONS = ['00', '15', '30', '45'];

  // "HH:MM" (24h) -> { hour12, minute, ampm }
  const splitTime = (value) => {
    if (!value || !value.includes(':')) return { hour12: '', minute: '', ampm: 'AM' };
    const [h, m] = value.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return { hour12, minute: String(m).padStart(2, '0'), ampm };
  };

  // Combine the three pickers back into a 24-hour "HH:MM" string.
  const combineTime = (hour12, minute, ampm) => {
    let h = Number(hour12) % 12;
    if (ampm === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${minute}`;
  };

  // Update one piece (hour/minute/ampm) of a time field and recombine.
  const handleTimePart = (field, part, partValue) => {
    const cur = splitTime(formData[field]);
    const next = { ...cur, [part]: partValue };
    // Default any blank piece sensibly so we always produce a valid time.
    const hour12 = next.hour12 || 7;
    const minute = next.minute || '00';
    const ampm = next.ampm || 'AM';
    setFormData(prev => ({ ...prev, [field]: combineTime(hour12, minute, ampm) }));
  };

  // Sort jobs by the leading street number in the nickname (numeric, ascending),
  // falling back to alphabetical for nicknames without a leading number.
  const leadingNumber = (job) => {
    const text = (job.nickname || job.address || '').trim();
    const m = text.match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };
  // Only show active-work statuses in the Time Tracking dropdown to keep the list manageable.
  const TRACKABLE_STATUSES = [
    'In Process',
    'Estimate Delivered',
    'Estimated Delivered',
    'Work Scheduled',
    'Work to be Scheduled'
  ];
  const sortedJobs = [...jobs]
    .filter(j => TRACKABLE_STATUSES.includes(j.status))
    .sort((a, b) => {
      const na = leadingNumber(a), nb = leadingNumber(b);
      if (na !== nb) return na - nb;
      return (a.nickname || a.address || '').localeCompare(b.nickname || b.address || '');
    });

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const calculateDuration = () => {
    if (!formData.timeStart || !formData.timeStop) return 0;

    const [startHour, startMin] = formData.timeStart.split(':').map(Number);
    const [stopHour, stopMin] = formData.timeStop.split(':').map(Number);

    const startTotalMin = startHour * 60 + startMin;
    const stopTotalMin = stopHour * 60 + stopMin;

    return Math.max(0, stopTotalMin - startTotalMin);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedJobId) {
      setError('Please select a job');
      return;
    }

    if (!formData.timeStart || !formData.timeStop) {
      setError('Please enter start and stop times');
      return;
    }

    if (formData.timeStop <= formData.timeStart) {
      setError('Stop time must be after start time');
      return;
    }

    if (!formData.description || !formData.description.trim()) {
      setError('Please enter a description of the work');
      return;
    }

    setError('');

    try {
      const durationMinutes = calculateDuration();
      const clockInDateTime = `${formData.date}T${formData.timeStart}:00`;
      const clockOutDateTime = `${formData.date}T${formData.timeStop}:00`;

      const response = await fetch(`${apiUrl}/api/time-entries/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: selectedJobId,
          technician_id: currentUser?.id || null,
          technician_name: currentUser?.name || '',
          date: formData.date,
          clock_in: clockInDateTime,
          clock_out: clockOutDateTime,
          duration_minutes: durationMinutes,
          notes: formData.description
        })
      });

      if (!response.ok) throw new Error('Failed to log time entry');
      await response.json();

      setMessage(`✓ Time entry logged - ${durationMinutes} minutes`);
      setTimeout(() => setMessage(''), 3000);

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        timeStart: '07:00',
        timeStop: '07:00',
        description: ''
      });
      setShowForm(false);
      setTimesheetRefresh(k => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);
  const durationMinutes = calculateDuration();

  return (
    <div className="time-tracking-container">
      <div className="time-tracking-card">
        <h2>⏱️ Time Tracking</h2>
        <p className="subtitle">Log work hours manually by entering start and stop times</p>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {/* Entry Form */}
        <div className="entry-form-container">
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="add-entry-btn">
              + Log Time
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="manual-entry-form">
              <h3>Log Time Entry</h3>

              <div className="form-group">
                <label>Logged in as</label>
                <div className="current-user-display">
                  {currentUser?.name || 'Unknown user'}
                </div>
              </div>

              <div className="form-group">
                <label>Select Job or Category</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                >
                  <option value="">-- Choose a job or category --</option>
                  <optgroup label="Time Categories">
                    {TIME_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Jobs">
                    {sortedJobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.nickname || job.address} ({job.customer_name})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {selectedJob && !isCategory(selectedJobId) && (
                <div className="job-info">
                  <p><strong>Job:</strong> {selectedJob.nickname || selectedJob.address}</p>
                  <p><strong>Customer:</strong> {selectedJob.customer_name}</p>
                  <p><strong>Type:</strong> {selectedJob.type}</p>
                </div>
              )}

              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleFormChange}
                />
              </div>

              <div className="time-inputs">
                <div className="form-group">
                  <label>Start Time</label>
                  <div className="time-part-row">
                    <select
                      className="time-part time-part-hour"
                      aria-label="Start hour"
                      value={splitTime(formData.timeStart).hour12}
                      onChange={(e) => handleTimePart('timeStart', 'hour12', e.target.value)}
                    >
                      {HOUR_OPTIONS.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="time-colon">:</span>
                    <select
                      className="time-part time-part-min"
                      aria-label="Start minute"
                      value={splitTime(formData.timeStart).minute}
                      onChange={(e) => handleTimePart('timeStart', 'minute', e.target.value)}
                    >
                      {MINUTE_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      className="time-part time-part-ampm"
                      aria-label="Start AM or PM"
                      value={splitTime(formData.timeStart).ampm}
                      onChange={(e) => handleTimePart('timeStart', 'ampm', e.target.value)}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Stop Time</label>
                  <div className="time-part-row">
                    <select
                      className="time-part time-part-hour"
                      aria-label="Stop hour"
                      value={splitTime(formData.timeStop).hour12}
                      onChange={(e) => handleTimePart('timeStop', 'hour12', e.target.value)}
                    >
                      {HOUR_OPTIONS.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="time-colon">:</span>
                    <select
                      className="time-part time-part-min"
                      aria-label="Stop minute"
                      value={splitTime(formData.timeStop).minute}
                      onChange={(e) => handleTimePart('timeStop', 'minute', e.target.value)}
                    >
                      {MINUTE_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      className="time-part time-part-ampm"
                      aria-label="Stop AM or PM"
                      value={splitTime(formData.timeStop).ampm}
                      onChange={(e) => handleTimePart('timeStop', 'ampm', e.target.value)}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {durationMinutes > 0 && (
                <div className="duration-display">
                  <strong>Duration:</strong> {durationMinutes} minutes ({(durationMinutes / 60).toFixed(2)} hours)
                </div>
              )}

              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  placeholder="What did you work on?"
                  rows="3"
                  required
                />
              </div>

              <button type="submit" className="submit-time-btn" disabled={!selectedJobId}>
                Log Time Entry
              </button>
            </form>
          )}
        </div>

        {/* Weekly timesheet view */}
        {canManageTimesheets && (
          <div className="form-group timesheet-user-picker">
            <label>View Timesheet For</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              {activeUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUser?.id ? `${u.name} (me)` : u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <WeeklyTimesheet
          apiUrl={apiUrl}
          targetUser={
            canManageTimesheets
              ? (activeUsers.find(u => String(u.id) === String(selectedUserId)) || currentUser)
              : currentUser
          }
          canManage={canManageTimesheets}
          jobs={jobs}
          refreshKey={timesheetRefresh}
        />

        {canManageTimesheets && (
          <TimesheetExport apiUrl={apiUrl} token={token} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

export default TimeTracking;
