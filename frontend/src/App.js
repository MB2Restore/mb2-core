import React, { useState, useEffect } from 'react';
import './App.css';
import IntakeForm from './components/IntakeForm';
import JobList from './components/JobList';
import TimeTracking from './components/TimeTracking';
import JobDetail from './components/JobDetail';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import Receipts from './components/Receipts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('mb2_token') || '');
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('mb2_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [authChecked, setAuthChecked] = useState(false);

  const [view, setView] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const isOffice = currentUser?.role === 'office';
  const isField = currentUser?.role === 'field';
  const hasFullAccess = isAdmin || isOffice;

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setAuthChecked(true);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          localStorage.setItem('mb2_user', JSON.stringify(data.user));
        } else {
          handleLogout();
        }
      } catch (e) {
        // Backend unreachable - keep stored session so offline refresh doesn't boot the user.
      } finally {
        setAuthChecked(true);
      }
    };
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back-button handling: if the user is on a job detail and presses Back,
  // return to the Jobs list rather than leaving the app. Always keep a history
  // entry in place so the first Back press has somewhere to land.
  useEffect(() => {
    const onPop = () => {
      setView(v => (v === 'detail' ? 'jobs' : v));
      // Re-arm a history entry so the next Back press is also captured.
      window.history.pushState({ view: 'app' }, '');
    };
    window.history.pushState({ view: 'app' }, '');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleLogin = (newToken, user) => {
    setToken(newToken);
    setCurrentUser(user);
    localStorage.setItem('mb2_token', newToken);
    localStorage.setItem('mb2_user', JSON.stringify(user));
    setView(user.role === 'field' ? 'tracking' : 'jobs');
  };

  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('mb2_token');
    localStorage.removeItem('mb2_user');
    setView('jobs');
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/jobs`);
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setMessage('Error loading jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) fetchJobs();
  }, [currentUser]);

  const handleJobCreated = (newJob) => {
    setJobs([newJob, ...jobs]);
    setMessage('Job created successfully!');
    setTimeout(() => setMessage(''), 3000);
    setView('jobs');
  };

  const handleViewJob = (job) => {
    setSelectedJob(job);
    setView('detail');
    // Push a history entry so the device/browser Back button returns to the
    // Jobs list (instead of exiting the home-screen web app).
    window.history.pushState({ view: 'detail' }, '');
  };

  const handleBackToList = () => {
    setView('jobs');
    fetchJobs();
  };

  const handleJobDeleted = (deletedId) => {
    setJobs(prev => prev.filter(j => j.id !== deletedId));
    setMessage('Job deleted');
    setTimeout(() => setMessage(''), 3000);
    setView('jobs');
    fetchJobs();
  };

  if (!authChecked) {
    return (
      <div className="app-loading">Loading...</div>
    );
  }

  if (!currentUser) {
    return <Login apiUrl={API_URL} onLogin={handleLogin} />;
  }

  const roleLabel = { admin: 'Admin', office: 'Office', field: 'Field Staff' }[currentUser.role] || currentUser.role;

  return (
    <div className={`app ${isField ? 'field-mode' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <img
            src="/mb2core-horizontal.png"
            alt="MB2 Core"
            className="header-logo"
          />
          <p className="subtitle">One Platform. One Team. One <span className="accent">MB2</span>.</p>
        </div>
        <div className="header-user">
          <span className="user-greeting">
            {currentUser.name} <span className="user-role-pill">{roleLabel}</span>
          </span>
          <button className="logout-btn" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <nav className="app-nav">
        {hasFullAccess && (
          <button
            className={`nav-btn ${view === 'intake' ? 'active' : ''}`}
            onClick={() => setView('intake')}
          >
            New Job
          </button>
        )}
        <button
          className={`nav-btn ${view === 'jobs' || view === 'detail' ? 'active' : ''}`}
          onClick={() => { setView('jobs'); fetchJobs(); }}
        >
          Jobs
        </button>
        <button
          className={`nav-btn ${view === 'tracking' ? 'active' : ''}`}
          onClick={() => setView('tracking')}
        >
          Time Tracking
        </button>
        <button
          className={`nav-btn ${view === 'receipts' ? 'active' : ''}`}
          onClick={() => setView('receipts')}
        >
          Receipts
        </button>
        {isAdmin && (
          <button
            className={`nav-btn ${view === 'users' ? 'active' : ''}`}
            onClick={() => setView('users')}
          >
            Users
          </button>
        )}
      </nav>

      {message && <div className="message">{message}</div>}

      <main className="app-main">
        {hasFullAccess && view === 'intake' && (
          <IntakeForm onJobCreated={handleJobCreated} apiUrl={API_URL} currentUser={currentUser} />
        )}

        {view === 'jobs' && (
          <JobList jobs={jobs} loading={loading} onViewJob={handleViewJob} currentUser={currentUser} />
        )}

        {view === 'detail' && selectedJob && (
          <JobDetail job={selectedJob} apiUrl={API_URL} onBack={handleBackToList} currentUser={currentUser} token={token} onDeleted={handleJobDeleted} />
        )}

        {view === 'tracking' && (
          <TimeTracking jobs={jobs} apiUrl={API_URL} currentUser={currentUser} token={token} />
        )}

        {view === 'receipts' && (
          <Receipts jobs={jobs} apiUrl={API_URL} currentUser={currentUser} token={token} />
        )}

        {isAdmin && view === 'users' && (
          <UserManagement apiUrl={API_URL} token={token} currentUser={currentUser} />
        )}

        {!hasFullAccess && !isAdmin && view !== 'tracking' && view !== 'receipts' && view !== 'jobs' && view !== 'detail' && (
          <TimeTracking jobs={jobs} apiUrl={API_URL} currentUser={currentUser} token={token} />
        )}
      </main>
    </div>
  );
}

export default App;
