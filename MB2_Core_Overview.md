# MB2 Core — Platform Overview

*How MB2 Restore uses MB2 Core to run jobs, track time, capture costs, and keep the team aligned.*

---

## What MB2 Core Is

MB2 Core is MB2 Restore's custom web application for managing restoration work end to end — from the first lead call through completion and billing. It replaces a patchwork of spreadsheets and third-party tools with a single place where the office, field crews, and ownership all work from the same live information.

It runs in any web browser and installs to a phone's home screen like an app, so field staff can use it from a job site the same way the office uses it from a desk.

**One platform. One team. One MB2.**

At a high level, MB2 Core handles:

- **Jobs** — every restoration project, its status, customer, dates, financials, notes, and documents
- **Time tracking** — hours logged by employee, by job, on a weekly timesheet
- **Receipts** — job-related expenses with photos, captured from the field
- **Documents** — estimates, approvals, authorizations, and other files attached to each job
- **Communication** — automated weekly emails and instant alerts that keep everyone informed

---

## User Types (Roles)

Every person who uses MB2 Core has one of three roles. The role controls what they can see and do. This keeps the field experience simple and protects sensitive information like financials.

### Admin
Full access to everything, **plus** the ability to manage users (add people, set roles, deactivate departed staff) and send/preview the automated emails. Admins are typically ownership and system managers.

### Office
Full access to the day-to-day application — jobs, time, receipts, and documents — but cannot manage user accounts. This is the operations and administrative team who run jobs and keep records current.

### Field Staff
A streamlined, mobile-first experience focused on what a crew member needs on site: **logging their time** and **capturing receipts**. Field staff can view the jobs they're working, but only the essentials — job info, status, customer, key dates, and next steps. They do **not** see financials, payroll, or other employees' information.

| Capability | Admin | Office | Field |
|---|---|---|---|
| View jobs | Yes | Yes | Yes (limited detail) |
| Create / edit jobs | Yes | Yes | No |
| Attach documents | Yes | Yes | No |
| Log time (own) | Yes | Yes | Yes |
| View / edit anyone's timesheet | Yes | Yes | No |
| Capture receipts | Yes | Yes | Yes |
| See financials & billing | Yes | Yes | No |
| Manage users | Yes | No | No |

---

## The Core Object: A Job

Everything in MB2 Core revolves around the **job** — a single restoration project at a property. Each job carries:

- **Identity** — a job name (nickname), the property address, and the customer's contact info
- **Work type** — Water Mitigation, Mold Remediation, Fire Mitigation, Biohazard Cleanup, Repair, or Cleanup
- **Status** — where the job is in its lifecycle (see workflow below)
- **Lead source** — how the job came to MB2 (referral, website, insurance partner, etc.)
- **Key dates** — date received, start, completed, invoiced
- **Financials** — mitigation, repair, and other amounts that roll up to a project total
- **Project Notes** — a running log of updates, with the most recent note surfaced as the job's "latest note"
- **Time entries** — hours logged against the job
- **Receipts** — expenses captured for the job
- **Documents** — estimates, approvals, authorizations, and other attached files

---

## Job Lifecycle (Status Workflow)

A job moves through a set of statuses that mirror how MB2 actually works a project. Statuses are grouped by stage so the pipeline reads at a glance:

**Intake / pre-work**
- **Lead** — a new opportunity has come in
- **Assessment Scheduled** — an on-site assessment is booked
- **Referred for Testing** — sent out for testing (e.g., mold/air quality) before estimating

**Estimating**
- **Estimate Due** — an estimate needs to be produced
- **Estimate Delivered** — the estimate is with the customer

**Active work**
- **Work to be Scheduled** — approved, awaiting a date
- **Work Scheduled** — on the calendar
- **In Process** — crews are actively working the job

**Paused / closed**
- **Hold** — temporarily paused
- **Project Cancelled** — not moving forward
- **Send Final Bill** — work done, ready to invoice
- **Completed** — finished and closed

Emergency jobs entered after hours can go straight to **In Process** at intake, so nothing waits.

---

## Key Workflows

### 1. Intake — Adding a New Job
When a call comes in, office or admin staff use the **Quick Job Intake Form** — designed to be completed in under two minutes, even for an after-hours emergency. They enter the customer, address, work type, lead source, and any initial notes. Phone number is optional so nothing blocks a fast entry.

On submit, MB2 Core creates the job, sets its starting status, and — if initial notes were added — records them as the job's first Project Note. **All office and admin staff immediately receive a "New Job Added" email**, so the team and ownership always know the moment a job enters the pipeline.

### 2. Working the Job
From the **Jobs** list, staff can search, filter (by status or type), and sort to find any job. Opening a job shows everything about it on one page. As the job progresses, office/admin update its status, add Project Notes to log developments, fill in dates and financials, and attach documents.

The **Jobs** list doubles as a live pipeline view — the whole book of business at a glance, with each job's status and latest note visible.

### 3. Time Tracking
Field staff (and office/admin for themselves) log time on a **weekly timesheet**, Sunday through Saturday. For each entry they pick a job — or a non-job category like Paid Time Off, Shop, Business Development, or Lunch — set the start and stop times, and add a short description of the work.

Hours roll up per day and per week. Lunch is tracked but excluded from paid totals. Office and admin can view and adjust **any** employee's timesheet; there's a payroll lock so past weeks can't be quietly changed after they close. Timesheets can be exported to CSV for payroll.

### 4. Receipts & Job Costs
Out in the field, crew members snap a photo of a receipt, assign it to a job, and enter the vendor, amount, and a note. Photos are compressed on the device so they upload fast even on weak signal. Receipts roll up as job expenses and can be exported, giving a real picture of costs per job.

### 5. Documents
Office and admin attach files to a job — PDFs, images, or Word documents — for estimates, customer approvals, authorizations, satisfaction forms, and the like. Each document gets a short description and is listed with its date and a link to view it. This keeps the paper trail for a job in one place, accessible to the whole office team.

### 6. Staying Informed — Automated Communication
MB2 Core sends emails automatically so people don't have to go looking for information:

- **Sunday morning** — each field staff member gets a personalized recap of their week's hours, with a reminder to confirm everything before payroll runs Monday.
- **Monday morning** — office and admin get a **weekly job recap** (new leads, pipeline movement, activity) and admins get a **weekly hours-by-employee summary**.
- **Anytime a job is created** — office and admin staff get an instant new-job alert.

These come from "MB2 Restore Core" so the team recognizes them at a glance.

---

## Representative Use Cases

**After-hours emergency call.** A homeowner calls at 9 PM with a burst pipe. Office staff open the intake form on their phone, enter the essentials in under two minutes, and mark it an emergency — the job lands in **In Process** and the office and admin team are alerted instantly. A crew is dispatched, logs their time and material receipts from the site, and the office picks it up the next morning with full context.

**Keeping ownership in the loop.** Rather than chasing status updates, ownership relies on the Monday recap email and the live Jobs pipeline to see new leads, what's stalled, and what's ready to bill — without logging in or interrupting the team.

**Clean payroll.** Field staff log time all week; Sunday's reminder nudges them to finish before the Monday lock. Office reviews and exports the timesheet, confident the numbers are complete and can't be changed after the fact.

**Job-cost visibility.** Because receipts and hours are captured against each job as work happens, MB2 can see the real cost of a project — not reconstruct it weeks later from a shoebox of receipts.

**A complete job record.** Estimate, signed authorization, before/after photos, notes, time, and costs all live on the one job. If a question comes up months later — from a customer, an insurer, or an auditor — the whole history is in one place.

---

## Why It Matters

MB2 Core gives the business one source of truth. The field gets a simple tool that works from a phone. The office gets everything about every job in one place. Ownership gets visibility without having to ask. And the whole team works from the same live picture — which means faster response, cleaner records, better job costing, and less time spent chasing information.
