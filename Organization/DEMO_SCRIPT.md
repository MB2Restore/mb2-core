# MB2 Restore App - Demo Script (5-10 minutes)

Use this script when demoing to your team. It's designed to show the three core workflows quickly.

---

## Pre-Demo Checklist ✓

- [ ] Backend running: `npm start` in `/backend` directory
- [ ] Frontend running: `npm start` in `/frontend` directory  
- [ ] App opens at `http://localhost:3000`
- [ ] Both servers are responsive (no errors in terminal)

---

## Opening Statement (30 seconds)

*"We've built a prototype of a custom app to replace AppSheet. The #1 thing we heard from you is that getting jobs entered is too slow, especially on after-hours calls. This app fixes that with a 2-minute intake form that automatically populates our CRM and gets field staff ready to log time. Let me show you how it works."*

---

## Demo Flow (5-10 minutes)

### Part 1: Intake Form - After-Hours Call (2 minutes)

**What you're showing:** How office staff quickly enter new jobs during phone calls.

1. **Click "📝 New Job"**
   - Show the intake form
   - Point out: "This is what our office team sees when a customer calls"

2. **Fill out the form with sample data:**
   ```
   Customer Name:    John Smith
   Address:          456 Oak Avenue, Springfield, IL
   Phone:            (555) 234-5678
   Work Type:        Water Mitigation
   Lead Source:      Referral
   (Leave nickname & notes blank - optional)
   ```
   - Narrate: "Three fields required, takes 1-2 minutes even on a phone call"

3. **Click "✓ Create Job & Notify Team"**
   - Wait for success message
   - Point out: "Job is created, customer is auto-added to the system, job gets a unique ID"
   - Say: "Now field staff can immediately clock in on this job"

### Part 2: Time Tracking - Field Technician (2 minutes)

**What you're showing:** How field staff quickly log time when arriving at jobs.

1. **Click "⏱️ Time Tracking"**
   - Show the clock panel
   - Say: "Field tech opens the app, clicks Time Tracking"

2. **Enter sample data:**
   ```
   Your Name:        Mike Johnson (technician name)
   Select Job:       [Choose the job you just created]
   ```
   - Say: "Tech enters their name and finds the job"

3. **Click "🟢 Clock In"**
   - Show the job info and elapsed time counter
   - Say: "One tap. Time and location are recorded. Now they can work."
   - Wait 5-10 seconds (simulate working on the job)

4. **Click "🔴 Clock Out"**
   - Show the time automatically calculated
   - Point to "Today's Time Entries" 
   - Say: "Time is logged. No manual entry. This goes to payroll."

### Part 3: Manager Review - Job Dashboard (1-2 minutes)

**What you're showing:** How managers see complete job information in one place.

1. **Click "📋 Jobs"**
   - Show the job list
   - Point out filters: "Can filter by status or work type"

2. **Click the job card you created**
   - Show job details page
   - Point to each section:
     - "Here's all the job info"
     - "Here's the time they logged today"
     - "If they had captured receipts, they'd show here"

3. **Click "✎ Edit"** (if time allows)
   - Show editable fields: status, assigned tech, job notes, amount
   - Say: "We can update status as work progresses, track what we estimated vs. actual"

---

## Key Messages to Reinforce

After the demo, emphasize these points:

1. **Speed:** "The intake form takes 1-2 minutes, not 10 minutes"
2. **Automation:** "Customer is created automatically. Job is ready to go. No double-entry."
3. **Mobile-First:** "Works great on phones, tablets, desktops"
4. **Real-Time:** "Manager can see what's happening right now"
5. **Integration:** "Everything connects - intake → CRM → time → billing"

---

## Questions Your Team Will Ask

### "Is this as good as AppSheet?"
*Response:* "This is better for our specific workflow. AppSheet is a general tool. This is built for how we work - quick intake, fast time logging. We can customize it easily. AppSheet is harder to change."

### "What about offline? Field staff don't have internet everywhere"
*Response:* "Good question. That's Phase 2. For now, it needs internet for clock in/out. But most job sites have cell signal. We'll add offline support after the pilot."

### "What if we want to add more fields?"
*Response:* "Easy. Tell us what fields and we can add them. Takes minutes to update. With AppSheet, it takes longer."

### "How much will this cost to maintain?"
*Response:* "We'll host it on cloud servers (Vercel + Railway). Cost is about $50-100/month. Scales with our growth. Much cheaper than AppSheet licenses long-term."

### "When can we go live?"
*Response:* "Pilot week with office + 2 field techs. Week 2 refine based on feedback. Week 3 full office rollout. Week 4 full field rollout. We can run parallel with AppSheet so no risk."

### "What happens to our current AppSheet data?"
*Response:* "We can migrate it if needed, or keep AppSheet as read-only archive. No data loss."

---

## Demo Troubleshooting

### "I see a blank page"
- Check browser console (F12 → Console tab)
- Verify backend is running: `http://localhost:5000/api/health`
- May need to refresh browser (Ctrl+R or Cmd+R)

### "Buttons don't work"
- Backend may have crashed. Check backend terminal for errors
- Restart backend: `npm start` in backend directory

### "The job didn't create"
- Check all required fields are filled (Customer Name, Address, Phone)
- Check backend console for error messages
- Try again - may be a network blip

### "Time tracking stuck"
- Close and reopen the app
- Refresh browser
- Restart both servers

---

## After the Demo

1. **Get Feedback:**
   - "What do you like?"
   - "What's missing?"
   - "What should we build next?"
   - "Any workflow we got wrong?"

2. **Answer the Team Questions** (from requirements doc):
   - Job types sufficient?
   - Lead sources correct?
   - Status workflow right?
   - Need manager approval for time entries?
   - What reports matter most?

3. **Gather Next Steps:**
   - Who wants to pilot week 1?
   - Office staff or field staff first?
   - What's your one must-have for Phase 2?

---

## Follow-Up (Send After Demo)

Send your team:
- `README.md` - What it does and how to use it
- `SETUP_GUIDE.md` - How to run it themselves
- `MB2_Restore_App_Requirements.md` - Full spec for feedback
- Ask them to test during their normal workflow next week

---

**Demo Time:** 5-10 minutes  
**Q&A Time:** 10-15 minutes  
**Total:** 15-25 minutes

Good luck with your demo! 🚀
