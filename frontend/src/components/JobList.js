import React, { useState, useMemo, useRef } from 'react';
import './JobList.css';

function JobList({ jobs, loading, onViewJob, currentUser, token, apiUrl }) {
  // Persist the Jobs view/filter/sort choices so they survive navigating away
  // (into a job and back) and app restarts. Stored under one localStorage key.
  const PREFS_KEY = 'mb2_jobs_prefs';
  const loadPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
    catch (e) { return {}; }
  };
  const prefs = loadPrefs();

  const [viewMode, setViewMode] = useState(prefs.viewMode || 'table'); // 'table' | 'cards'
  // Status filter is now multi-select by EXCLUSION: hiddenStatuses lists the statuses
  // to hide. Empty = show all (default). Migrate the old single-value pref if present.
  const [hiddenStatuses, setHiddenStatuses] = useState(() =>
    Array.isArray(prefs.hiddenStatuses) ? prefs.hiddenStatuses : []
  );
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef(null);
  // Type filter mirrors Status: multi-select by exclusion.
  const [hiddenTypes, setHiddenTypes] = useState(() =>
    Array.isArray(prefs.hiddenTypes) ? prefs.hiddenTypes : []
  );
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef(null);
  const [search, setSearch] = useState(prefs.search || '');
  const [sortKey, setSortKey] = useState(prefs.sortKey || 'date_received');
  const [sortDir, setSortDir] = useState(prefs.sortDir || 'desc');

  // Save prefs whenever any of them change
  React.useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      viewMode, hiddenStatuses, hiddenTypes, search, sortKey, sortDir
    }));
  }, [viewMode, hiddenStatuses, hiddenTypes, search, sortKey, sortDir]);

  // Close the status menu when clicking outside it
  React.useEffect(() => {
    if (!statusMenuOpen) return;
    const onDocClick = (e) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [statusMenuOpen]);

  React.useEffect(() => {
    if (!typeMenuOpen) return;
    const onDocClick = (e) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target)) setTypeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [typeMenuOpen]);

  // Build filter options from the ACTUAL data so they always match what's there
  const statusOptions = useMemo(() => {
    const set = new Set(jobs.map(j => j.status).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [jobs]);
  const typeOptions = useMemo(() => {
    const set = new Set(jobs.map(j => j.type).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [jobs]);

  // Status colors are grouped by stage so the pipeline reads at a glance:
  // cool tones = intake/pre-work, amber = estimating, teal/dark = active work,
  // green/purple = billing & done, brown/red = paused/dead. All pass WCAG AA on white text.
  const getStatusColor = (status) => {
    switch (status) {
      // Intake / pre-work (cool)
      case 'Lead': return '#5b6b7a';
      case 'Assessment Scheduled': return '#475569';
      case 'Referred for Testing': return '#0369a1';
      // Estimating (amber)
      case 'Estimate Due': return '#b35900';
      case 'Estimate Delivered': return '#a85000';
      // Active work (teal / dark)
      case 'Work to be Scheduled': return '#0f766e';
      case 'Work Scheduled': return '#0e7490';
      case 'In Process':
      case 'In Progress': return '#1a1a2e';
      // Billing & done
      case 'Send Final Bill': return '#7c3aed';
      case 'Completed': return '#27744a';
      // Paused / dead
      case 'Hold': return '#92400e';
      case 'Project Cancelled': return '#c0392b';
      default: return '#888';
    }
  };

  const getTypeEmoji = (type) => {
    switch (type) {
      case 'Water Mitigation': return '💧';
      case 'Mold Remediation': return '🧫';
      case 'Fire Mitigation': return '🔥';
      case 'Biohazard Cleanup': return '☣️';
      case 'Repair': return '🛠️';
      case 'Cleanup': return '🧹';
      default: return '⚙️';
    }
  };

  // Parse the app's date strings (ISO or m/d/yy) to a sortable number
  const dateValue = (v) => {
    if (!v) return 0;
    const d = new Date(v);
    return isNaN(d) ? 0 : d.getTime();
  };

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = jobs.filter(job => {
      const statusMatch = !hiddenStatuses.includes(job.status);
      const typeMatch = !hiddenTypes.includes(job.type);
      const searchMatch = !q ||
        (job.nickname || '').toLowerCase().includes(q) ||
        (job.customer_name || '').toLowerCase().includes(q) ||
        (job.address || '').toLowerCase().includes(q);
      return statusMatch && typeMatch && searchMatch;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let av, bv;
      if (sortKey === 'date_received' || sortKey === 'created_date') {
        av = dateValue(a[sortKey]); bv = dateValue(b[sortKey]);
        return (av - bv) * dir;
      }
      av = (a[sortKey] || '').toString().toLowerCase();
      bv = (b[sortKey] || '').toString().toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [jobs, hiddenStatuses, hiddenTypes, search, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date_received' || key === 'created_date' ? 'desc' : 'asc');
    }
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  const truncate = (s, n) => {
    if (!s) return '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  };

  if (loading) {
    return <div className="loading">Loading jobs...</div>;
  }

  // Real statuses present in the data (drop the 'all' sentinel from statusOptions)
  const statusList = statusOptions.filter(s => s !== 'all');
  const toggleStatus = (s) => setHiddenStatuses(prev =>
    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
  );
  const visibleStatusCount = statusList.filter(s => !hiddenStatuses.includes(s)).length;
  const statusLabel = hiddenStatuses.length === 0
    ? 'All Statuses'
    : `${visibleStatusCount} of ${statusList.length} statuses`;

  const typeList = typeOptions.filter(t => t !== 'all');
  const toggleType = (t) => setHiddenTypes(prev =>
    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
  );
  const visibleTypeCount = typeList.filter(t => !hiddenTypes.includes(t)).length;
  const typeLabel = hiddenTypes.length === 0
    ? 'All Types'
    : `${visibleTypeCount} of ${typeList.length} types`;

  const isAdmin = currentUser?.role === 'admin';
  const [exporting, setExporting] = useState(false);

  // CSV cell escaper (quote if it contains comma, quote, or newline)
  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const money = (v) => { const n = parseFloat(v); return isNaN(n) ? '' : n.toFixed(2); };
  const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');

  // Export ALL jobs (with cost aggregates) to CSV — admin only.
  const exportJobs = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${apiUrl}/api/jobs/export-data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const header = [
        'Nickname', 'Customer Name', 'Type', 'Lead Source', 'Status',
        'Date Received', 'Date Completed', 'Total Amount', 'Project Financials',
        'Total Hours', 'Total Receipts', 'Total Document Amounts'
      ];
      const lines = [header.map(csvCell).join(',')];
      data.forEach(j => {
        const projectFinancials = (j.project_amount != null && j.project_amount !== '')
          ? parseFloat(j.project_amount)
          : (parseFloat(j.mitigation_amount) || 0) + (parseFloat(j.repair_amount) || 0) + (parseFloat(j.other_amount) || 0);
        const hours = (parseFloat(j.total_minutes) || 0) / 60;
        lines.push([
          j.nickname, j.customer_name, j.type, j.lead_source, j.status,
          dateOnly(j.date_received), dateOnly(j.date_completed),
          money(j.amount), money(projectFinancials),
          hours.toFixed(2), money(j.total_receipts), money(j.total_documents)
        ].map(csvCell).join(','));
      });
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `mb2_jobs_${stamp}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert('Sorry, the export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    { key: 'nickname', label: 'Nickname' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'type', label: 'Type' },
    { key: 'lead_source', label: 'Lead Source' },
    { key: 'status', label: 'Status' },
    { key: 'date_received', label: 'Date Received' },
    { key: 'latest_note', label: 'Latest Note' }
  ];

  return (
    <div className="job-list-container">
      <div className="job-list-toolbar">
        <h2>Jobs</h2>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Table
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            Cards
          </button>
        </div>
        {isAdmin && (
          <button className="jobs-export-btn" onClick={exportJobs} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          className="job-search"
          placeholder="Search nickname, customer, address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-group status-multi" ref={statusMenuRef}>
          <label>Status:</label>
          <button
            type="button"
            className="status-menu-btn"
            onClick={() => setStatusMenuOpen(o => !o)}
          >
            {statusLabel} <span className="status-caret">▾</span>
          </button>
          {statusMenuOpen && (
            <div className="status-menu">
              <div className="status-menu-actions">
                <button type="button" onClick={() => setHiddenStatuses([])}>Select all</button>
                <button type="button" onClick={() => setHiddenStatuses(statusList.slice())}>Clear all</button>
              </div>
              {statusList.map(status => (
                <label key={status} className="status-menu-item">
                  <input
                    type="checkbox"
                    checked={!hiddenStatuses.includes(status)}
                    onChange={() => toggleStatus(status)}
                  />
                  <span>{status}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="filter-group status-multi" ref={typeMenuRef}>
          <label>Type:</label>
          <button
            type="button"
            className="status-menu-btn"
            onClick={() => setTypeMenuOpen(o => !o)}
          >
            {typeLabel} <span className="status-caret">▾</span>
          </button>
          {typeMenuOpen && (
            <div className="status-menu">
              <div className="status-menu-actions">
                <button type="button" onClick={() => setHiddenTypes([])}>Select all</button>
                <button type="button" onClick={() => setHiddenTypes(typeList.slice())}>Clear all</button>
              </div>
              {typeList.map(type => (
                <label key={type} className="status-menu-item">
                  <input
                    type="checkbox"
                    checked={!hiddenTypes.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="filter-info">
          Showing {filteredJobs.length} of {jobs.length} jobs
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p className="empty-title">No jobs found</p>
          <p className="empty-sub">Try clearing your search or filters.</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={sortKey === col.key ? 'sorted' : ''}
                  >
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => (
                <tr key={job.id} onClick={() => onViewJob(job)}>
                  <td className="td-nickname">{job.nickname || job.address}</td>
                  <td className="td-customer">{job.customer_name}</td>
                  <td className="td-type">{job.type}</td>
                  <td className="td-source">{job.lead_source}</td>
                  <td>
                    <span className="table-status" style={{ backgroundColor: getStatusColor(job.status) }}>
                      {job.status}
                    </span>
                  </td>
                  <td className="td-date">{fmtDate(job.date_received)}</td>
                  <td className="td-notes" title={job.latest_note || ''}>{truncate(job.latest_note, 40)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="jobs-grid">
          {filteredJobs.map(job => (
            <div key={job.id} className="job-card" onClick={() => onViewJob(job)}>
              <div className="job-header">
                <div className="job-title">
                  <span className="job-emoji">{getTypeEmoji(job.type)}</span>
                  <h3>{job.nickname || job.address}</h3>
                </div>
                <span className="job-status" style={{ backgroundColor: getStatusColor(job.status) }}>
                  {job.status}
                </span>
              </div>

              <div className="job-details">
                <p><strong>Customer:</strong> {job.customer_name}</p>
                <p><strong>Type:</strong> {job.type}</p>
                <p><strong>Lead Source:</strong> {job.lead_source || '—'}</p>
                {job.latest_note && (
                  <p className="job-next-steps"><strong>Latest Note:</strong> {job.latest_note}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default JobList;
