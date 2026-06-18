# How to Restart the MB2 Restore Servers

## Quick Start (Copy & Paste)

### Step 1: Open TWO Terminal/Command Prompt Windows

You need to run both servers simultaneously. Open two separate terminal windows.

### Step 2: Start the Backend Server

**In Terminal Window #1:**

```bash
cd C:\Users\DJ\Desktop\mb2-restore-app\backend
npm start
```

You should see output like:
```
Connected to SQLite database
Listening on port 5000
Added column customer_email to jobs table
Added column date_received to jobs table
... (more columns)
```

**Important:** Leave this terminal window open and running. Do NOT close it.

### Step 3: Start the Frontend Server

**In Terminal Window #2:**

```bash
cd C:\Users\DJ\Desktop\mb2-restore-app\frontend
npm start
```

You should see output like:
```
Compiled successfully!
You can now view mb2-restore in the browser.
  Local: http://localhost:3000
```

**Important:** Leave this terminal window open and running. Do NOT close it.

### Step 4: Open the App

1. Open your web browser (Chrome, Firefox, Edge, etc.)
2. Go to: `http://localhost:3000`
3. You should see the MB2 Core app

---

## Troubleshooting

### Issue: "Port 5000 already in use" or "Port 3000 already in use"

**Solution:** Kill the existing process and restart.

#### For Windows (Command Prompt):

```bash
# Kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Then try starting the servers again.

### Issue: "npm not found" or "node not found"

**Solution:** Node.js is not installed or not in your PATH.

1. Download Node.js from: https://nodejs.org/
2. Install it (recommended: LTS version)
3. Restart your terminal
4. Try again

### Issue: "Cannot find module" error

**Solution:** Dependencies are not installed.

```bash
# For backend:
cd C:\Users\DJ\Desktop\mb2-restore-app\backend
npm install

# For frontend:
cd C:\Users\DJ\Desktop\mb2-restore-app\frontend
npm install
```

Then try starting again.

### Issue: App runs but pages are blank or loading forever

**Solution:** The backend isn't responding. Check:

1. Is the backend terminal showing "Listening on port 5000"?
2. Open browser DevTools (F12)
3. Go to Console tab
4. Look for red error messages
5. If you see API errors, the backend isn't responding

**Fix:**
- Make sure backend terminal is running and not showing errors
- Refresh the page (Ctrl+R)
- Check that no firewall is blocking port 5000

### Issue: "Failed to update job" error

**Solution:** The backend API is not responding. 

1. Check backend terminal - is it running?
2. Look for error messages in red
3. Stop both servers (Ctrl+C in each terminal)
4. Restart them both
5. Try again

---

## Testing the Fix

After restarting both servers, test the Job Detail form:

### Test 1: View a Job
1. Go to http://localhost:3000
2. Click "Jobs" tab
3. Click "View Details" on any job
4. You should see the job detail page

### Test 2: Edit Job Details
1. Click "Edit" button
2. Try changing:
   - Customer Email
   - Customer Phone
   - Address
3. Enter some financial amounts:
   - Mitigation: 2000
   - Repair: 3000
   - Other: 500
4. You should see Project Total calculate as 5500
5. Click "Save Changes"
6. Should see "Job updated successfully!"

### Test 3: Add a Project Note
1. Scroll to "Project Notes" section
2. Type a note
3. Click "Add Note"
4. Note should appear immediately

---

## Production Deployment (Future)

When you're ready to deploy to production:
- Use PM2 or a similar process manager to keep servers running
- Set NODE_ENV=production
- Use a reverse proxy (nginx, Apache, etc.)
- Enable HTTPS
- See DEPLOYMENT_ROADMAP.md for full details

---

## Quick Reference

| Task | Command |
|------|---------|
| Start backend | `cd backend && npm start` |
| Start frontend | `cd frontend && npm start` |
| Stop server | `Ctrl+C` in the terminal |
| Check port 5000 | `netstat -ano \| findstr :5000` |
| Check port 3000 | `netstr -ano \| findstr :3000` |
| View app | `http://localhost:3000` |
| Backend API | `http://localhost:5000` |

---

## File Locations

- **Backend files:** `C:\Users\DJ\Desktop\mb2-restore-app\backend\`
- **Frontend files:** `C:\Users\DJ\Desktop\mb2-restore-app\frontend\`
- **Database:** `C:\Users\DJ\Desktop\mb2-restore-app\backend\mb2restore.db`

---

## Need Help?

If you encounter issues:

1. **Take a screenshot** of the error
2. **Copy the terminal output** showing the error
3. **Note which terminal** it came from (backend or frontend)
4. **Description** of what you were doing when it failed
5. Send these to debug

---

## What Changed in This Update

✅ **Fixed:** "Failed to update job" error
- Backend now auto-detects missing database columns
- Dynamic query building prevents column errors
- PUT endpoint handles sparse updates properly

✅ **Added:** Editable customer fields
- Customer name
- Customer email
- Customer phone
- Address

✅ **Added:** Auto-calculated Project Amount
- Formula: Mitigation + Repair + Other
- User cannot edit directly
- Updates automatically as breakdown changes

✅ **All new fields working:**
- Dates (received, start, completed)
- Financial breakdown
- Insurance notes
- Next steps
- Project notes

---

**Ready to test?** Start both servers and navigate to http://localhost:3000!

