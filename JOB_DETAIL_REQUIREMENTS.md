# MB2 Core - Job Detail Requirements

## Overview
Enhanced Job Detail form to track comprehensive job information from initial intake through completion and billing.

---

## Data Model Changes

### Database Schema: jobs Table (ADDITIONS)

```sql
ALTER TABLE jobs ADD COLUMN (
  customer_email VARCHAR(255),
  date_received DATE DEFAULT CURRENT_DATE,
  start_date DATE,
  date_completed DATE,
  project_amount DECIMAL(10, 2),
  mitigation_amount DECIMAL(10, 2),
  repair_amount DECIMAL(10, 2),
  other_amount DECIMAL(10, 2),
  insurance_notes TEXT,
  next_steps TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Note: customer_name, customer_phone, address already exist from intake form
```

### New Table: project_notes

```sql
CREATE TABLE project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255), -- future: link to users table
  CONSTRAINT fk_job FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX idx_project_notes_job_id ON project_notes(job_id);
CREATE INDEX idx_project_notes_created_at ON project_notes(created_at);
```

### Status Field: Updated Enum

**Current:**
- Lead
- In Progress
- Completed

**New (11 Options):**
1. Lead (default if not emergency)
2. Assessment Scheduled
3. Estimate Due
4. Estimate Delivered
5. Work Scheduled
6. Work to be Scheduled
7. In Process
8. Hold
9. Project Cancelled
10. Send Final Bill
11. Completed

```sql
-- Update jobs table status column
ALTER TABLE jobs MODIFY status ENUM(
  'Lead',
  'Assessment Scheduled',
  'Estimate Due',
  'Estimate Delivered',
  'Work Scheduled',
  'Work to be Scheduled',
  'In Process',
  'Hold',
  'Project Cancelled',
  'Send Final Bill',
  'Completed'
);
```

---

## UI/Form Structure

### Job Detail Page Layout

#### Section 1: Job Header (Read-Only)
```
┌─────────────────────────────────────┐
│ Job ID: JOB-2024-001               │
│ Address: 123 Main St, Springfield, IL│
│ Status: [Dropdown - 11 options]     │
│ Work Type: Water Damage             │
└─────────────────────────────────────┘
```

#### Section 2: Customer Information (Editable)
```
┌─────────────────────────────────────┐
│ CUSTOMER INFORMATION                │
├─────────────────────────────────────┤
│ Name: John Smith                    │
│ Phone: (555) 123-4567              │
│ Email: [TEXT INPUT - NEW FIELD]     │
│ Address: 123 Main St, Springfield   │
│ City/State/ZIP: Springfield, IL     │
└─────────────────────────────────────┘
```

#### Section 3: Dates (Editable)
```
┌─────────────────────────────────────┐
│ KEY DATES                           │
├─────────────────────────────────────┤
│ Date Received: 05/21/2024 (auto)   │
│ Start Date: [DATE INPUT]            │
│ Date Completed: [DATE INPUT]        │
└─────────────────────────────────────┘
```

#### Section 4: Financial (Editable with Auto-Calculations)
```
┌──────────────────────────────────┐
│ PROJECT FINANCIALS               │
├──────────────────────────────────┤
│ Project Amount:      $[INPUT]     │
│ Breakdown:                        │
│   Mitigation:        $[INPUT]     │
│   Repair:            $[INPUT]     │
│   Other:             $[INPUT]     │
│                      ──────────   │
│   Total Breakdown:   $[AUTO]      │
│                                   │
│ Note: Total breakdown should     │
│ equal Project Amount              │
└──────────────────────────────────┘
```

#### Section 5: Insurance Information (Large Text)
```
┌──────────────────────────────────────┐
│ INSURANCE INFORMATION                │
├──────────────────────────────────────┤
│ [LARGE TEXT AREA - 10 rows]          │
│                                      │
│ Notes: Company, claim number,        │
│ contact info, policy details, etc.   │
│                                      │
│ Example:                             │
│ State Farm - Claim #2024-12345      │
│ Adjuster: Jane Doe                  │
│ Phone: (555) 987-6543              │
└──────────────────────────────────────┘
```

#### Section 6: Next Steps (Text Area)
```
┌──────────────────────────────────┐
│ NEXT STEPS                       │
├──────────────────────────────────┤
│ [TEXT AREA - 5 rows]             │
│                                  │
│ What needs to happen next?       │
│ Who's doing it? When?            │
└──────────────────────────────────┘
```

#### Section 7: Project Notes (Append-Only Log)
```
┌────────────────────────────────────┐
│ PROJECT NOTES (ACTIVITY LOG)       │
├────────────────────────────────────┤
│ [TEXT INPUT] [Add Note Button]     │
├────────────────────────────────────┤
│ 05/21/2024 10:15 AM                │
│ Initial assessment completed.      │
│ Customer is home, access granted.  │
│ Heavy water damage in living room. │
├────────────────────────────────────┤
│ 05/21/2024 02:30 PM                │
│ Mitigation crew arrived at 2pm.    │
│ Set up dehumidifiers and fans.     │
│ Will return tomorrow for follow-up.│
├────────────────────────────────────┤
│ 05/22/2024 09:00 AM                │
│ Second day of drying. Equipment    │
│ is working well. Customer satisfied│
└────────────────────────────────────┘
```

#### Section 8: Actions
```
┌──────────────────────────────────┐
│ [SAVE CHANGES] [DELETE] [CLOSE]  │
└──────────────────────────────────┘
```

---

## Field Details & Validation

### Customer Email
- **Type:** Email input
- **Required:** No (optional)
- **Validation:** Valid email format
- **Display:** Optional field, comes from intake form or added later

### Date Received
- **Type:** Date input
- **Default:** Date from intake form
- **Read-Only:** Yes (set at job creation)
- **Display:** Format as MM/DD/YYYY

### Start Date
- **Type:** Date input
- **Required:** No
- **Validation:** Must be >= Date Received if set
- **Default:** Blank
- **Display:** Format as MM/DD/YYYY

### Date Completed
- **Type:** Date input
- **Required:** No
- **Validation:** Must be >= Start Date if both set
- **Default:** Blank
- **Display:** Format as MM/DD/YYYY

### Project Amount
- **Type:** Decimal currency input
- **Required:** No
- **Validation:** Must be >= 0, 2 decimal places
- **Default:** Blank
- **Display:** Format as $X,XXX.XX
- **Special:** Triggers validation that breakdown items sum to this

### Mitigation Amount
- **Type:** Decimal currency input
- **Required:** No
- **Validation:** Must be >= 0, 2 decimal places
- **Default:** Blank
- **Display:** Format as $X,XXX.XX

### Repair Amount
- **Type:** Decimal currency input
- **Required:** No
- **Validation:** Must be >= 0, 2 decimal places
- **Default:** Blank
- **Display:** Format as $X,XXX.XX

### Other Amount
- **Type:** Decimal currency input
- **Required:** No
- **Validation:** Must be >= 0, 2 decimal places
- **Default:** Blank
- **Display:** Format as $X,XXX.XX

### Insurance Notes
- **Type:** Large text area
- **Required:** No
- **Rows:** 10
- **Placeholder:** "Insurance company, claim number, adjuster contact, policy details, etc."
- **Max Length:** 5000 characters
- **Display:** Preserve line breaks

### Next Steps
- **Type:** Text area
- **Required:** No
- **Rows:** 5
- **Placeholder:** "What happens next? Who's responsible? When?"
- **Max Length:** 2000 characters

### Project Notes (Append-Only Log)
- **Type:** Multiple text entries with timestamps
- **Display Order:** Newest first (reverse chronological)
- **Format:** `[Date Time] [Note Text]`
- **Add Method:** Text input at top of list + "Add Note" button
- **User:** Track who added note (future feature)
- **Editable:** No (append-only)
- **Deletable:** Admin only (future feature)
- **Max Per Note:** 1000 characters

---

## Status Workflow & Logic

### Status Progression (Suggested)

```
Lead
  ↓ (schedule assessment)
Assessment Scheduled
  ↓ (assessment complete, need estimate)
Estimate Due
  ↓ (estimate provided)
Estimate Delivered
  ↓ (customer approves)
Work Scheduled
  ↓ (customer decides to schedule)
Work to be Scheduled
  ↓ (schedule confirmed)
In Process
  ↓ (work underway)
Hold (optional - if work paused)
  ↓
In Process (resume)
  ↓ (work complete)
Send Final Bill
  ↓ (bill sent and paid)
Completed

Alternative paths:
- Lead → Project Cancelled (anytime)
- Any status → Hold (anytime)
- Hold → In Process (resume)
```

### Status Dropdown
- Show all 11 options
- Allow any transition (no validation - user knows best)
- Color-code by status (optional, future enhancement)

---

## Calculation Rules

### Financial Auto-Calculations

**When Project Amount changes:**
- If Mitigation + Repair + Other = 0, show warning
- If Mitigation + Repair + Other ≠ Project Amount, show warning
- Suggest adjusting breakdown to match

**Suggested Logic:**
```javascript
const breakdown = mitigation_amount + repair_amount + other_amount;
const projectAmount = parseFloat(project_amount);

if (breakdown > 0 && Math.abs(breakdown - projectAmount) > 0.01) {
  showWarning("Breakdown total ($" + breakdown + ") doesn't match Project Amount ($" + projectAmount + ")");
}
```

---

## Data Flow

### On Job Creation (from Intake Form)
```
IntakeForm submission
  ↓
Creates: customer, job
  ↓
Populates in JobDetail:
  - customer_name ✓
  - customer_phone ✓
  - address ✓
  - city_state ✓
  - zip_code ✓
  - type ✓
  - status (Lead or In Process) ✓
  - lead_source ✓
  - date_received (auto = today) ✓
  
NEW fields (blank):
  - customer_email
  - start_date
  - date_completed
  - project_amount
  - mitigation_amount
  - repair_amount
  - other_amount
  - insurance_notes
  - next_steps
```

### On Job Update (JobDetail form)
```
User edits any field
  ↓
Click SAVE
  ↓
Send to backend: PUT /api/jobs/:id
  ↓
Update database
  ↓
Return success/error
  ↓
Refresh form
```

### On Add Project Note
```
User types in "Add Note" field
  ↓
Click "Add Note" button
  ↓
Send to backend: POST /api/jobs/:id/notes
  ↓
Create project_notes record with:
  - job_id
  - note_text
  - created_at (auto)
  - created_by (optional)
  ↓
Return new note
  ↓
Prepend to notes list
  ↓
Clear input field
```

---

## API Endpoints Needed

### Update Job Details
```
PUT /api/jobs/:id
Body: {
  customer_email,
  start_date,
  date_completed,
  project_amount,
  mitigation_amount,
  repair_amount,
  other_amount,
  insurance_notes,
  next_steps,
  status
}
Response: Updated job object
```

### Get Job with Notes
```
GET /api/jobs/:id
Response: {
  ...job fields,
  project_notes: [
    { id, note_text, created_at, created_by },
    ...
  ]
}
```

### Add Project Note
```
POST /api/jobs/:id/notes
Body: {
  note_text,
  created_by (optional)
}
Response: { id, note_text, created_at, created_by }
```

### List Project Notes
```
GET /api/jobs/:id/notes?limit=50&offset=0
Response: [
  { id, note_text, created_at, created_by },
  ...
]
```

---

## Implementation Phases

### Phase 1: Core Fields (Priority)
- [ ] Customer email field
- [ ] Date received (read-only)
- [ ] Start date
- [ ] Date completed
- [ ] Status expansion to 11 options
- [ ] Insurance notes (large text)
- [ ] Next steps field

**Effort:** 4-6 hours
**Database Changes:** Add 7 columns to jobs table

### Phase 2: Financial Fields (High Priority)
- [ ] Project amount
- [ ] Mitigation amount
- [ ] Repair amount
- [ ] Other amount
- [ ] Auto-total calculation
- [ ] Amount validation

**Effort:** 2-3 hours
**Database Changes:** Add 4 columns to jobs table

### Phase 3: Project Notes (High Priority)
- [ ] Create project_notes table
- [ ] Add note input field
- [ ] List notes in reverse chronological order
- [ ] Format timestamps
- [ ] Add note functionality

**Effort:** 3-4 hours
**Database Changes:** New table + API endpoints

### Phase 4: Enhancement (Future)
- [ ] Color-code statuses
- [ ] Status transition validation
- [ ] User tracking on notes (created_by)
- [ ] Note editing/deletion (admin only)
- [ ] Note attachments
- [ ] Email notifications on status changes

---

## Testing Checklist

- [ ] Add job from intake form
- [ ] Edit customer email
- [ ] Set start date and completion date
- [ ] Enter project amount and breakdown
- [ ] Verify breakdown warning works
- [ ] Enter insurance notes
- [ ] Enter next steps
- [ ] Change status through all 11 options
- [ ] Add multiple project notes
- [ ] Verify notes display in reverse chronological order
- [ ] Verify data persists on refresh
- [ ] Test on mobile device
- [ ] Test date formatting
- [ ] Test currency formatting
- [ ] Test text area character limits
- [ ] Test that read-only fields can't be edited

---

## Future Enhancements (Phase 4+)

1. **Status Color Coding**
   - Lead → Blue
   - Assessment Scheduled → Orange
   - Estimate Due → Red
   - Estimate Delivered → Yellow
   - Work Scheduled → Green
   - Work to be Scheduled → Yellow
   - In Process → Blue
   - Hold → Gray
   - Project Cancelled → Red
   - Send Final Bill → Purple
   - Completed → Green

2. **Note Attachments**
   - Upload photos of damage
   - Attach receipts
   - Link to external documents

3. **Notifications**
   - Alert when status changes
   - Alert when estimate due date passes
   - Alert when work scheduled date approaches

4. **Integrations**
   - Send status updates to customer via email/SMS
   - Create PDF estimate from data
   - Export job to accounting system

5. **Advanced Reporting**
   - Average time in each status
   - Revenue by status
   - Project timeline visualization

---

## Notes & Considerations

### Database Migration Strategy
When implementing:
1. Create new columns (non-breaking)
2. Create new project_notes table
3. Deploy code to handle new fields
4. Test thoroughly
5. Migrate existing jobs to have date_received = created_at

### Performance
- Index project_notes by job_id (for fast retrieval)
- Limit notes display to most recent 50
- Load older notes on demand (pagination)

### Data Validation
- Dates must be in logical order
- Amounts must be positive
- Email must be valid format
- Text fields have max length

### User Experience
- Save should be at bottom of form
- Show unsaved changes indicator
- Confirm before deleting notes (future)
- Show loading state while saving

