# MB2 Restore Custom App - Setup & Demo Guide

## Overview

This is a working prototype of the MB2 Restore custom application built to replace AppSheet. It includes:
- **Intake Form** (MVP Priority #1) - Quick 2-minute job entry for after-hours calls
- **CRM Job Management** - View, search, and manage all jobs
- **Time Tracking** - Mobile-friendly clock in/out for field staff
- **Job Details** - View complete job information, time logs, and expenses

## Project Structure

```
mb2-restore-app/
├── backend/
│   ├── server.js          (Express API server)
│   ├── package.json       (Dependencies)
│   └── mb2restore.db      (SQLite database - auto-created)
├── frontend/
│   ├── package.json       (React dependencies)
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js         (Main app component)
│       ├── App.css
│       ├── index.js
│       ├── index.css
│       └── components/
│           ├── IntakeForm.js    (Quick job entry form)
│           ├── JobList.js       (Job listing & filtering)
│           ├── TimeTracking.js  (Clock in/out)
│           └── JobDetail.js     (Job details, edit, history)
└── SETUP_GUIDE.md         (This file)
```

## Quick Start (5 minutes)

### Step 1: Install Backend Dependencies

Open a terminal in the `backend` directory and run:

```bash
cd backend
npm install
```

This installs:
- `express` - Web server framework
- `cors` - Cross-origin requests
- `sqlite3` - Database
- `uuid` - Generate unique IDs
- `body-parser` - Parse JSON requests

### Step 2: Start the Backend Server

```bash
npm start
```

You should see: `MB2 Restore backend running on http://localhost:5000`

The database (`mb2restore.db`) will be automatically created on first run.

### Step 3: Install Frontend Dependencies

Open a NEW terminal in the `frontend` directory and run:

```bash
cd frontend
npm install
```

This installs:
- `react` - UI framework
- `axios` - HTTP client
- `react-scripts` - Build tools

### Step 4: Start the Frontend

```bash
npm start
```

This will automatically open `http://localhost:3000` in your browser.

## Features to Demo

### 1. **Intake Form** (The MVP Priority #1)
- Navigate to "📝 New Job" tab
- Fill out:
  - Customer Name
  - Job Address
  - Contact Phone
  - Work Type (Water Mitigation, Mold Remediation, Fire Damage, Other)
  - Lead Source
  - (Optional) Job Nickname & Notes
- Click "✓ Create Job & Notify Team"
- **Target**: Should take under 2 minutes to complete
- **Result**: Job is created, customer is auto-added, system is ready for field staff to clock in

### 2. **Job List & Filtering**
- Navigate to "📋 Jobs" tab
- See all created jobs with:
  - Status (Work Scheduled, In Progress, Completed, Send Final Bill, Project Cancelled)
  - Type (work emoji shows the job type)
  - Customer name
  - Address
- Filter by:
  - Status dropdown
  - Work Type dropdown
- Click any job card to view details

### 3. **Job Details & Editing**
- Click a job in the list
- View complete job information
- Click "✎ Edit" to modify:
  - Job nickname
  - Status (change workflow)
  - Assigned technician
  - Estimated amount
  - Job notes
- View time entries and receipts (if any)

### 4. **Time Tracking** (Mobile-First)
- Navigate to "⏱️ Time Tracking" tab
- Clock In:
  - Enter your name
  - Select a job
  - Click "🟢 Clock In"
  - See job info and elapsed time
- Clock Out:
  - Click "🔴 Clock Out"
  - Time is automatically calculated
  - Entry appears in "Today's Time Entries"
- Mobile-friendly design works on phones/tablets

## Key Demo Scenarios

### Scenario 1: After-Hours Intake Call
1. Open "📝 New Job"
2. Simulate a phone call: "We have water damage at 123 Main St"
3. Fill form with customer info (takes ~1-2 minutes)
4. Click submit - job is created with unique ID
5. Show team: "New job #[ID], 123 Main St, Water Mitigation ready for dispatch"

### Scenario 2: Field Technician Arrival
1. Go to "⏱️ Time Tracking"
2. Enter technician name
3. Search and select the job you just created
4. Click "Clock In" - timestamp recorded
5. (Simulate work for 10-30 seconds)
6. Click "Clock Out" - time duration calculated
7. Show the time entry logged to today's summary

### Scenario 3: Manager Reviews Job
1. Go to "📋 Jobs"
2. Find the job you created
3. Click to view details
4. Show: Time entries logged, job status, customer info
5. Click "✎ Edit" to update status or assign technician

## Technology Stack

**Frontend:**
- React 18 (component-based UI)
- CSS3 (responsive design - mobile first)
- Fetch API (talking to backend)

**Backend:**
- Node.js + Express (REST API)
- SQLite3 (lightweight database for demo)
- UUID (unique job IDs)

**Database Schema:**
- **Customers**: name, email, phone, address
- **Jobs**: customer, address, type, status, lead_source, technician, amount
- **Time Entries**: job, technician, clock in/out times, duration
- **Receipts**: job, amount, category, vendor, date

## API Endpoints (Backend)

All endpoints use `http://localhost:5000/api`

**Customers:**
- `GET /customers` - Get all customers
- `POST /customers` - Create/find customer

**Jobs:**
- `GET /jobs` - Get all jobs
- `GET /jobs/:id` - Get job details
- `POST /jobs` - Create job
- `PUT /jobs/:id` - Update job

**Time Entries:**
- `GET /time-entries` - Get all time entries
- `POST /time-entries/clock-in` - Start clock
- `POST /time-entries/:id/clock-out` - End clock

**Receipts:**
- `POST /receipts` - Create receipt

## Common Questions for Team

Before demoing to your team, be prepared to answer:

1. **Job Types**: Are these sufficient?
   - Water Mitigation, Mold Remediation, Fire Damage, Other
   
2. **Lead Sources**: Current values from AppSheet?
   - Mike Brown, Joe C, Chris Friend, Phone Directory, Referral, Other

3. **Job Statuses**: Keep current workflow?
   - Work Scheduled → In Progress → Completed → Send Final Bill → Project Cancelled

4. **Time Tracking Approval**: Auto-approved or manager review?
   - Currently auto-approved (can add approval workflow in Phase 2)

5. **Priority Features for Phase 2**:
   - Receipt photo capture from mobile
   - Offline support for field staff
   - Dashboard & reporting
   - Real-time Slack notifications

## Next Steps

### For Feedback (Week 1 - Pilot):
1. Have office staff test intake form during real after-hours calls
2. Have 1-2 field techs test time tracking
3. Gather feedback on workflow
4. Note any missing fields or features

### For Phase 2 (Weeks 2-3):
- Receipt/expense management with photo capture
- Advanced CRM features (notes history, related jobs)
- Manager dashboard
- Reporting and profitability analysis
- Mobile offline support

### For Production (Weeks 3-4):
- Migrate data from AppSheet (if needed)
- Full team rollout
- Training sessions
- Decommission AppSheet (or keep as read-only archive)

## Troubleshooting

### "Backend is not running"
- Make sure `npm start` is running in the `backend` directory
- Check `http://localhost:5000/api/health` returns `{"status": "Backend is running"}`

### "Can't connect to backend"
- Ensure both frontend (port 3000) and backend (port 5000) are running
- Check firewall isn't blocking localhost ports
- Check `REACT_APP_API_URL` environment variable

### "Database not working"
- SQLite database is auto-created on first run
- If corrupted, delete `mb2restore.db` and restart backend

### "Form not submitting"
- Check browser console (F12) for errors
- Verify backend is running and responding
- Check all required fields are filled

## Support

For questions or issues:
1. Check the error messages in browser console (F12)
2. Check backend terminal for API errors
3. Review the requirements document: `MB2_Restore_App_Requirements.md`

---

**Document Version:** 1.0  
**Last Updated:** May 20, 2026  
**App Status:** MVP Ready for Pilot Testing
