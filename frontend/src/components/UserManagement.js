import React, { useState, useEffect } from 'react';
import './UserManagement.css';

const ROLE_LABELS = {
  admin: 'Admin',
  office: 'Office',
  field: 'Field Staff'
};

const ROLE_DESCRIPTIONS = {
  admin: 'Full access + can manage users',
  office: 'Full app access (jobs, time, receipts)',
  field: 'Mobile time tracking + receipts only'
};

function UserManagement({ apiUrl, token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const emptyForm = { name: '', email: '', phone: '', password: '', role: 'field' };
  const [formData, setFormData] = useState(emptyForm);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  // Fetch a recap's HTML with auth, then open it in a new browser tab.
  const previewRecap = async (path) => {
    try {
      const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to load recap');
      }
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message);
    }
  };
  const [recapUserId, setRecapUserId] = useState('');
  const [sendingEmail, setSendingEmail] = useState('');

  // POST to a send endpoint to actually email recipients (test the real send).
  const sendTestEmail = async (path, label) => {
    if (!window.confirm(`Send the "${label}" email now to its real recipients?`)) return;
    setSendingEmail(path);
    setError('');
    try {
      const res = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: authHeaders, body: '{}' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Failed to send');
      if (d.skipped) {
        flash(`${label}: email not configured yet (nothing sent).`);
      } else if (d.count !== undefined) {
        flash(`${label}: sent to ${d.count} field staff.`);
      } else {
        flash(`${label}: sent to ${d.recipients ?? '?'} recipient(s).`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingEmail('');
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/users`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const openCreate = () => {
    setEditingUser(null);
    setFormData(emptyForm);
    setShowForm(true);
    setError('');
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      password: '',
      role: user.role
    });
    setShowForm(true);
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let res, data;
      if (editingUser) {
        const payload = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role
        };
        if (formData.password) payload.password = formData.password;
        res = await fetch(`${apiUrl}/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload)
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user');
        flash('User updated ✓');
      } else {
        res = await fetch(`${apiUrl}/api/users`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(formData)
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user');
        flash('User created ✓');
      }
      setShowForm(false);
      setFormData(emptyForm);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (user) => {
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/users/${user.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ active: !user.active })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');
      flash(user.active ? 'User deactivated' : 'User reactivated ✓');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="user-mgmt-container">
      <div className="user-mgmt-card">
        <div className="user-mgmt-header">
          <div>
            <h2>👥 User Management</h2>
            <p className="subtitle">Create and manage who can access MB2 Core</p>
          </div>
          {!showForm && (
            <button className="add-user-btn" onClick={openCreate}>
              + Add User
            </button>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {/* Weekly Recap Preview (admin) */}
        <div className="recap-preview">
          <h3>Weekly Recap Preview</h3>
          <p className="recap-hint">Preview the automated weekly emails (covers last Mon–Sun). Opens in a new tab.</p>
          <div className="recap-actions">
            <button className="recap-btn" onClick={() => previewRecap('/api/recap/office')}>
              Office Recap (Monday)
            </button>
            <div className="recap-field-row">
              <select value={recapUserId} onChange={(e) => setRecapUserId(e.target.value)}>
                <option value="">-- Pick an employee --</option>
                {users.filter(u => u.active).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button
                className="recap-btn"
                disabled={!recapUserId}
                onClick={() => previewRecap(`/api/recap/field/${recapUserId}`)}
              >
                Field Recap (Sunday)
              </button>
            </div>
          </div>
        </div>

        {/* Send Test Emails (admin) — fires the REAL send to recipients */}
        <div className="recap-preview">
          <h3>Send Test Emails</h3>
          <p className="recap-hint">Sends the actual weekly emails to their real recipients right now (covers last week). Use to test before the automatic schedule runs.</p>
          <div className="recap-actions">
            <button className="recap-btn" disabled={!!sendingEmail}
              onClick={() => sendTestEmail('/api/emails/field-reminders', 'Field hours reminder')}>
              {sendingEmail === '/api/emails/field-reminders' ? 'Sending…' : 'Send Field Reminders'}
            </button>
            <button className="recap-btn" disabled={!!sendingEmail}
              onClick={() => sendTestEmail('/api/emails/office-recap', 'Office recap')}>
              {sendingEmail === '/api/emails/office-recap' ? 'Sending…' : 'Send Office Recap'}
            </button>
            <button className="recap-btn" disabled={!!sendingEmail}
              onClick={() => sendTestEmail('/api/emails/hours-by-employee', 'Hours by employee')}>
              {sendingEmail === '/api/emails/hours-by-employee' ? 'Sending…' : 'Send Hours by Employee'}
            </button>
          </div>
        </div>

        {showForm && (
          <form className="user-form" onSubmit={handleSubmit}>
            <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Brian Smith"
                required
              />
            </div>

            <div className="form-group">
              <label>Email (login)</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="brian@mb2cares.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Phone (optional)</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="form-group">
              <label>
                {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
              </label>
              <input
                type="text"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={editingUser ? 'Leave blank to keep current' : 'Set a starting password'}
                required={!editingUser}
              />
            </div>

            <div className="form-group">
              <label>Role</label>
              <select name="role" value={formData.role} onChange={handleChange}>
                <option value="field">Field Staff — mobile time + receipts</option>
                <option value="office">Office — full app access</option>
                <option value="admin">Admin — full access + manage users</option>
              </select>
              <p className="role-hint">{ROLE_DESCRIPTIONS[formData.role]}</p>
            </div>

            <div className="form-actions">
              <button type="submit" className="um-submit-btn">
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
              <button
                type="button"
                className="um-cancel-btn"
                onClick={() => {
                  setShowForm(false);
                  setEditingUser(null);
                  setError('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="loading-text">Loading users…</p>
        ) : (
          <div className="user-list">
            {users.map((user) => (
              <div
                key={user.id}
                className={`user-row ${!user.active ? 'inactive' : ''}`}
              >
                <div className="user-info">
                  <div className="user-name">
                    {user.name}
                    {user.id === currentUser.id && <span className="you-tag">You</span>}
                    {!user.active && <span className="inactive-tag">Inactive</span>}
                  </div>
                  <div className="user-email">{user.email}</div>
                </div>
                <div className={`role-badge role-${user.role}`}>
                  {ROLE_LABELS[user.role] || user.role}
                </div>
                <div className="user-actions">
                  <button className="um-edit-btn" onClick={() => openEdit(user)}>
                    Edit
                  </button>
                  <button
                    className={user.active ? 'deactivate-btn' : 'reactivate-btn'}
                    onClick={() => toggleActive(user)}
                    disabled={user.id === currentUser.id}
                    title={user.id === currentUser.id ? "You can't deactivate yourself" : ''}
                  >
                    {user.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserManagement;
