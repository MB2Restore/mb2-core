# MB2 Restore Custom App - Requirements Document

## Executive Summary

MB2 Restore is building a custom application to replace AppSheet, featuring:
1. **Intake Form** (MVP Priority #1) - Quick job entry for after-hours calls
2. **CRM** - Job and customer management for office staff
3. **Time Tracking** - Mobile-first time logging for field staff
4. **Receipt/Expense Management** - Capture and organize job expenses

**Goal:** Reduce friction in new job creation, enable real-time field time tracking, and streamline expense management.

---

## 1. Problem Statement

### Current Challenges
- **Intake delays**: After-hours calls require manual data entry before field staff can start work
- **Fragmented tools**: AppSheet CRM doesn't integrate well with time tracking or receipts
- **Data silos**: Information isn't automatically shared between job intake and time tracking
- **Mobile friction**: Team struggles to quickly log information from the field
- **Manual reconciliation**: Expenses and time entries don't automatically link to jobs

---

## 2. MVP Scope & Phasing

### Phase 1: MVP (Intake Form + Basic CRM)
**Timeline:** 2-3 weeks
**Focus:** Get a working intake form and basic CRM in production

**Includes:**
- Intake form (web + mobile-responsive)
- Job/customer database
- Basic job list view
- Time tracking starter (clock in/out)

**Excludes:**
- Receipt management (Phase 2)
- Advanced reporting (Phase 2)
- Offline mode (Phase 2)

### Phase 2: Full Feature Set (3-4 weeks)
- Receipt capture and management
- Advanced CRM features (notes, history, related jobs)
- Reporting and dashboards
- Mobile offline support

### Phase 3: Optimization (Ongoing)
- Performance improvements
- User feedback integration
- Custom workflows per team

---

## 3. User Personas

### 1. **Office Manager / Intake Staff**
**Role:** Answer phones, create new jobs, manage customer records
**Needs:**
- Fast intake form (under 2 minutes per job)
- Quick customer lookup
- Ability to assign jobs to field staff
- View job status at a glance
**Device:** Desktop computer

### 2. **Field Technician**
**Role:** Arrive at job, log time, capture expenses, update job status
**Needs:**
- Quick time clock in/out
- Easy job lookup by address or customer
- Photo capture for receipts
- Offline capability
**Device:** Mobile phone/tablet

### 3. **Project Manager / Owner**
**Role:** Monitor jobs in progress, view profitability, manage team
**Needs:**
- Dashboard showing job status
- Time/expense summary per job
- Customer history
- Reporting and analytics
**Device:** Desktop + mobile

---

## 4. Core Features

### 4.1 Intake Form (MVP Priority #1)

**Purpose:** Quickly capture new job information from after-hours calls

**Flow:**
1. **Quick Entry (2-3 minutes)**
   - Customer name
   - Job address/nickname
   - Work type (Water Mitigation, Mold Remediation, Fire Damage, etc.)
   - Lead source (who referred them)
   - Best contact phone number
   - Optional: Initial notes

2. **Auto-actions on submit:**
   - Create customer record (if new)
   - Create job/project record
   - Send confirmation to office team Slack/email
   - Assign job ID for field staff reference
   - Create time tracking record ready for first clock-in

3. **Field:** Add ability to assign to a technician immediately

**Design:** Mobile-first, single column, minimal fields
**Target:** Can be filled in under 2 minutes, even during a phone call

---

### 4.2 CRM - Job Management

**Job Record Fields:**
- Job ID (auto-generated)
- Customer name
- Job address/nickname
- Work type (dropdown)
- Status (Work Scheduled, In Progress, Completed, Send Final Bill, Project Cancelled)
- Lead source
- Assigned technician(s)
- Job start date
- Estimated completion
- Contact phone
- Customer notes
- Next steps
- Date received
- Estimated amount / Actual amount

**Views:**
- **Jobs List:** All jobs with filter/sort
- **Job Detail:** Full job record with related time entries and receipts
- **Customer Detail:** All jobs for a customer

**Actions:**
- Create new job (from intake form or manual)
- Edit job details
- Change status
- Assign/reassign technician
- Add notes
- View time logs
- View expense receipts

---

### 4.3 Time Tracking (Mobile-First)

**Mobile App - Field Technician View:**

**Clock In/Out:**
- One-tap clock in when arriving at job
- Auto-populated job selection (or quick search by address)
- One-tap clock out when leaving
- Stores: Start time, end time, job ID, technician ID, duration, date

**Daily View:**
- List of jobs worked today
- Time logged per job
- Total hours worked

**Time Entry Details:**
- Job name and address
- Customer name
- Time logged (hours/minutes)
- Edit option (if manager approval needed)
- Attach receipt photos

**Web - Manager View:**
- Time entries per technician per day/week
- Productivity metrics
- Overtime tracking
- Billing calculations

---

### 4.4 Receipt/Expense Management (Phase 2)

**Capture:**
- Mobile: Photo upload directly from job site
- Web: Manual receipt entry or file upload
- Auto-link to job and time entry

**Track:**
- Receipt date
- Amount
- Category (supplies, equipment, labor, other)
- Vendor
- Job assignment
- Approval status

---

## 5. Data Model

### Entity Relationships

```
Customer (1) ←→ (Many) Jobs
Job (1) ←→ (Many) Time Entries
Job (1) ←→ (Many) Receipts
Time Entry (1) ←→ (Many) Receipts (optional)
Technician (1) ←→ (Many) Time Entries
Technician (1) ←→ (Many) Jobs (assigned)
```

### Database Schema (Summary)

**Customers**
- id, name, email, phone, address, created_date

**Jobs**
- id, customer_id, nickname, address, type, status, lead_source, assigned_to, start_date, estimated_completion, amount, notes, created_date

**Time Entries**
- id, job_id, technician_id, clock_in, clock_out, duration_minutes, date, notes

**Receipts**
- id, job_id, time_entry_id, amount, category, date, vendor, photo_url, status

**Users/Technicians**
- id, name, email, phone, role, active

---

## 6. User Workflows

### Workflow 1: After-Hours Intake Call
**Actor:** Office staff
**Time:** 1-2 minutes

1. Phone call comes in: "We have water damage at 123 Main St"
2. Staff opens intake form (on desktop or mobile)
3. Fill quick form: Customer name, address, type, lead source, phone
4. Submit
5. System creates job, confirms job ID
6. Staff can immediately message field staff: "New job #1234, 123 Main St, Water Mitigation. Head there now"
7. Field staff opens app, searches job, clocks in

---

### Workflow 2: Field Technician Arrival at Job
**Actor:** Field technician
**Time:** 30 seconds

1. Arrive at job address
2. Open mobile app
3. Search for job (by address or job ID)
4. Tap "Clock In"
5. App records: time, job, technician, location
6. Work proceeds
7. Before leaving: Tap "Clock Out"
8. App records end time, calculates duration
9. (Optional) Take photo of receipt/damage before leaving

---

### Workflow 3: Manager Reviews Daily Timesheets
**Actor:** Manager
**Time:** 5-10 minutes per day

1. Log into web dashboard
2. View "Timesheets" section
3. See all technicians' time entries for today
4. Verify: Job, hours, accuracy
5. See receipts/expenses tied to each job
6. Review job status (in progress vs. completed)
7. Export for payroll or billing

---

## 7. Technical Architecture

### Frontend
- **Web CRM:** React (for office staff)
- **Mobile App:** React (mobile-responsive, for field staff)
- **Responsive Design:** Works on phone, tablet, desktop
- **Offline Support:** (Phase 2) Service workers + local storage

### Backend
- **API:** Node.js + Express
- **Database:** PostgreSQL (cloud-hosted: Supabase, Railway, or AWS RDS)
- **Authentication:** JWT tokens
- **Real-time:** Socket.io for live job updates (Phase 2)

### Deployment
- **Web Frontend:** Vercel or Netlify
- **Mobile:** Responsive web app (no native apps needed initially)
- **Backend:** Heroku, Railway, or AWS

---

## 8. Success Metrics

### MVP Success Criteria
- [ ] Intake form can be completed in under 2 minutes
- [ ] 100% of new jobs created via intake form
- [ ] Field staff can clock in within 30 seconds of arrival
- [ ] Zero data loss (all submissions persist)
- [ ] Team provides positive feedback in pilot (week 1)

### Phase 2 Goals
- [ ] Receipt capture reduces manual expense entry by 80%
- [ ] Time tracking reduces payroll processing by 50%
- [ ] Dashboard gives real-time job status visibility

---

## 9. Rollout Plan

### Week 1: Pilot (Office + 1-2 Field Staff)
- Test intake form with real after-hours calls
- Test time tracking with 1-2 technicians
- Gather feedback daily

### Week 2: Refinement
- Fix bugs found in pilot
- Optimize form based on feedback
- Train office team on new intake process

### Week 3: Full Office Rollout
- All office staff using intake form
- 50% of field staff using time tracking
- Parallel run with AppSheet (no cutover yet)

### Week 4: Full Field Rollout
- 100% of field staff using time tracking
- Retire AppSheet (or keep as read-only archive)

---

## 10. Questions for Team

1. **Job Types:** Are Water Mitigation, Mold Remediation, Fire Damage, and Other sufficient? Any others?
2. **Lead Sources:** Current values in AppSheet? (Mike Brown, Joe C, Chris Friend, etc.)
3. **Status Values:** Keep current (Work Scheduled, In Progress, Completed, Send Final Bill, Project Cancelled)?
4. **Technician Assignment:** Do all jobs need immediate assignment, or can office assign later?
5. **Time Tracking Approval:** Does manager need to approve time entries, or auto-approved?
6. **Reporting:** What reports matter most? (Job profitability, technician productivity, customer history?)

---

## Next Steps

1. **Team Review:** Share this document, gather feedback
2. **Prototype Demo:** Show working intake form + job list
3. **Refinement:** Update requirements based on feedback
4. **Build Phase 1:** 2-3 week sprint to MVP
5. **Pilot:** Test with real users, iterate

---

**Document Version:** 1.0  
**Last Updated:** May 20, 2026  
**Owner:** DJ Haskins (MB2 Restore)
