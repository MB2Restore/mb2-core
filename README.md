# MB2 Restore Custom App - MVP Prototype

A working prototype application to replace AppSheet, built specifically to solve MB2 Restore's #1 challenge: **getting field teams to enter new jobs quickly**.

## 🎯 What This Solves

**The Problem:**
- After-hours calls require manual data entry before field staff can start work
- Existing system (AppSheet) has friction in job entry
- Data doesn't flow seamlessly between intake → CRM → time tracking
- Field staff can't quickly log information from job sites

**The Solution:**
- **Intake Form** (under 2 minutes) - Quick job creation during phone calls
- **CRM** - Auto-populated with intake data, ready for field staff
- **Time Tracking** - One-tap clock in/out when arriving at jobs
- **Job Details** - Complete job history, time logs, and expenses in one place

## 🚀 Quick Start

1. **Backend Setup:**
   ```bash
   cd backend
   npm install
   npm start
   # Server runs on http://localhost:5000
   ```

2. **Frontend Setup (new terminal):**
   ```bash
   cd frontend
   npm install
   npm start
   # App opens at http://localhost:3000
   ```

That's it! You're ready to demo.

## 📋 What's Included

### Frontend (React)
- **Intake Form** - 3-field quick entry + optional details
- **Job List** - Browse all jobs with filters (status, type)
- **Job Details** - View/edit complete job info, time logs, receipts
- **Time Tracking** - Clock in/out with elapsed time display
- **Mobile-Responsive** - Works on phones, tablets, desktops

### Backend (Node.js/Express)
- REST API for all CRUD operations
- SQLite database (auto-created on first run)
- Endpoints for: customers, jobs, time entries, receipts
- Automatic customer creation from intake form

### Database
- **Customers** - Name, email, phone, address
- **Jobs** - Customer, address, type, status, technician, amount
- **Time Entries** - Clock in/out, duration, job reference
- **Receipts** - Expenses, category, vendor, job reference

## 💡 Demo Scenarios

### Scenario 1: After-Hours Intake (1 minute)
1. Customer calls: "We have water damage at 123 Main St"
2. Click "📝 New Job"
3. Fill: Name, Address, Phone, Type
4. Submit - Job created with ID
5. Message: "Ready for field dispatch"

### Scenario 2: Field Tech Arrival (30 seconds)
1. Click "⏱️ Time Tracking"
2. Enter name, select job
3. Click "🟢 Clock In"
4. (Simulate work)
5. Click "🔴 Clock Out"
6. Time logged automatically

### Scenario 3: Manager Review
1. Click "📋 Jobs"
2. Click job to view details
3. See: Time entries, status, customer info
4. Click "✎ Edit" to update status/assign tech

## 📁 Project Structure

```
mb2-restore-app/
├── backend/
│   ├── server.js              # Express API + SQLite setup
│   ├── package.json           # Dependencies
│   └── mb2restore.db          # Auto-created database
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js             # Main app shell
│   │   ├── App.css
│   │   ├── index.js
│   │   ├── index.css
│   │   └── components/
│   │       ├── IntakeForm.js      # MVP Priority #1
│   │       ├── JobList.js         # Browse jobs
│   │       ├── TimeTracking.js    # Clock in/out
│   │       ├── JobDetail.js       # Job info + edit
│   │       └── [.css files]       # Component styles
│   └── package.json
├── README.md                  # This file
└── SETUP_GUIDE.md            # Detailed setup instructions
```

## 🛠 Technology Stack

- **Frontend:** React 18, CSS3, Fetch API
- **Backend:** Node.js, Express, SQLite3
- **Database:** SQLite (local, easy to switch to PostgreSQL for production)
- **Deployment Ready:** Can deploy to Vercel (frontend), Heroku/Railway (backend)

## ✅ MVP Completeness

**Intake Form (Priority #1)** ✓
- [ ] Customer name, address, phone (3 required fields)
- [ ] Work type selector
- [ ] Lead source selector
- [ ] Optional nickname & notes
- [ ] Auto-creates customer + job
- [ ] Target: Under 2 minutes

**CRM (Basic)** ✓
- [ ] Job list view with all jobs
- [ ] Filter by status & type
- [ ] Click to view job details
- [ ] Edit job (status, assigned tech, notes, amount)
- [ ] View time entries & receipts
- [ ] Customer info displayed

**Time Tracking (Mobile-First)** ✓
- [ ] Clock in (select job + name)
- [ ] Clock out (auto-calculates duration)
- [ ] Display elapsed time live
- [ ] Daily summary of entries
- [ ] Mobile responsive design

**Additional** ✓
- [ ] Responsive UI (desktop, tablet, mobile)
- [ ] Error handling & validation
- [ ] Success messages & feedback
- [ ] Clean, modern design

## 🔄 Next Phase (Phase 2)

- [ ] Receipt photo capture (mobile camera)
- [ ] Offline support (service workers)
- [ ] Dashboard with charts
- [ ] Advanced reporting
- [ ] Slack notifications
- [ ] Manager approval workflow for time entries
- [ ] Export to payroll

## 📝 Requirements Document

See `../MB2_Restore_App_Requirements.md` for:
- Full feature specifications
- User personas
- Data model details
- User workflows
- Technical architecture
- Success metrics
- Questions for team discussion

## 🤔 Common Questions

**Q: How do I reset the database?**
A: Delete `backend/mb2restore.db` and restart the server. It will auto-create a fresh database.

**Q: Can I change job types or lead sources?**
A: Yes! Edit the arrays in `frontend/src/components/IntakeForm.js` (look for `jobTypes` and `leadSources`).

**Q: How do I add fields to the intake form?**
A: Edit `IntakeForm.js` - add to form state, JSX, and the POST request body.

**Q: How is customer data deduplicated?**
A: The API checks if customer already exists (by name + phone) before creating a new one.

**Q: Can this handle offline?**
A: Not yet - Phase 2 feature. For now, field staff need internet to clock in/out.

## 🚀 Ready to Demo?

1. Start both servers (backend + frontend)
2. Walk through the three scenarios above
3. Show your team and gather feedback
4. Use feedback to prioritize Phase 2 features

## 📧 Questions?

Refer to `SETUP_GUIDE.md` for troubleshooting and detailed instructions.

---

**Status:** MVP Ready for Pilot Testing  
**Last Updated:** May 20, 2026  
**Next Review:** After week-long team pilot
