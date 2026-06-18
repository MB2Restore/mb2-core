// Weekly recap generation (office ops recap + field staff time/receipt recap).
// Exported as a function that registers routes on an Express app, given the db handle.
// Kept in its own module so the large main server.js isn't edited for this feature.

// ---------- date helpers ----------
function parseLocalDate(s) {
  if (!s) return null;
  const str = String(s).split('T')[0].split(' ')[0]; // tolerate DATETIME strings
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function startOfWeekSun(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function fmtMD(date) { return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }); }
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(parseFloat(n))) return '--';
  return '$' + parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function jobAmount(j) {
  const a = j.project_amount != null && j.project_amount !== '' ? j.project_amount : j.amount;
  const n = parseFloat(a);
  return isNaN(n) ? null : n;
}

// Resolve the recap week. The recap covers the PRIOR Mon–Sun.
// Optional ?week=YYYY-MM-DD picks the Sunday-week containing that date and uses the prior week.
function resolveWeek(weekParam) {
  const ref = weekParam ? (parseLocalDate(weekParam) || new Date()) : new Date();
  // "this" Sunday-week start, then go back 7 days to get the PRIOR full week
  const thisSun = startOfWeekSun(ref);
  const priorSun = addDays(thisSun, -7);
  // The business uses Mon–Sun in the email text. Window = Mon..Sun of the prior week.
  const mon = addDays(priorSun, 1);            // Monday
  const sun = addDays(priorSun, 7);            // Sunday (end)
  return { start: mon, end: sun };
}
function inWindow(dateStr, start, end) {
  const d = parseLocalDate(dateStr);
  return d && d >= start && d <= end;
}

// ---------- office recap ----------
function buildOfficeRecap(jobs, weekParam) {
  const { start, end } = resolveWeek(weekParam);

  // New leads = jobs received (date_received) in the window
  const newLeads = jobs
    .filter(j => inWindow(j.date_received, start, end))
    .sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''));

  // Closed = status Completed AND date_completed in window
  const closed = jobs
    .filter(j => j.status === 'Completed' && inWindow(j.date_completed, start, end))
    .sort((a, b) => (a.date_completed || '').localeCompare(b.date_completed || ''));

  const newLeadsTotal = newLeads.reduce((s, j) => s + (jobAmount(j) || 0), 0);
  const closedTotal = closed.reduce((s, j) => s + (jobAmount(j) || 0), 0);

  // Insights
  const isClosedStatus = (st) => st === 'Completed' || st === 'Project Cancelled';
  const activeJobs = jobs.filter(j => !isClosedStatus(j.status));
  const now = new Date();
  const staleCount = activeJobs.filter(j => {
    const ref = parseLocalDate(j.updated_date) || parseLocalDate(j.date_received) || parseLocalDate(j.created_date);
    if (!ref) return false;
    const days = (now - ref) / (1000 * 60 * 60 * 24);
    return days > 30;
  }).length;

  // lead type mix
  const typeCounts = {};
  newLeads.forEach(j => { const t = j.type || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  let topType = null, topTypeN = 0;
  Object.entries(typeCounts).forEach(([t, n]) => { if (n > topTypeN) { topType = t; topTypeN = n; } });

  const withAmount = newLeads.filter(j => jobAmount(j) != null).length;

  // high-dollar watch: largest Estimate Delivered among new leads (or any active)
  const estDelivered = jobs
    .filter(j => j.status === 'Estimate Delivered' && jobAmount(j) != null)
    .sort((a, b) => (jobAmount(b) || 0) - (jobAmount(a) || 0));
  const highWatch = estDelivered[0] || null;

  const insights = [];
  insights.push(`Active pipeline: ${activeJobs.length} jobs, ${staleCount} stale (>30 days since last update)`);
  if (newLeads.length > 0 && topType) {
    insights.push(`New lead mix: ${topType} leads (${topTypeN} of ${newLeads.length})`);
  }
  insights.push(`Closures: ${closed.length} job${closed.length === 1 ? '' : 's'} closed this week`);
  insights.push(`Data completeness: ${withAmount} of ${newLeads.length} new leads have an amount populated`);
  if (highWatch) {
    insights.push(`High-dollar watch: ${highWatch.nickname || highWatch.address} (${fmtMoney(jobAmount(highWatch))} estimate delivered) — follow up`);
  }

  return {
    window: { start: fmtMD(start), end: fmtMD(end) },
    header: {
      newLeadsCount: newLeads.length, newLeadsTotal,
      closedCount: closed.length, closedTotal
    },
    newLeads: newLeads.map(j => ({
      date: fmtMD(parseLocalDate(j.date_received)),
      status: j.status, nickname: j.nickname || j.address, type: j.type,
      source: j.lead_source || '', amount: jobAmount(j)
    })),
    closed: closed.map(j => ({
      date: fmtMD(parseLocalDate(j.date_completed)),
      nickname: j.nickname || j.address, type: j.type,
      source: j.lead_source || '', amount: jobAmount(j)
    })),
    insights
  };
}

function officeRecapHtml(r) {
  const orange = '#F26522', dark = '#1a1a2e';
  const rowsLeads = r.newLeads.map(l => `
    <tr>
      <td>${l.date}</td><td>${l.status}</td><td>${esc(l.nickname)}</td>
      <td>${esc(l.type)}</td><td>${esc(l.source)}</td>
      <td style="text-align:right">${l.amount != null ? fmtMoney(l.amount) : '--'}</td>
    </tr>`).join('');
  const rowsClosed = r.closed.map(c => `
    <tr>
      <td>${c.date}</td><td>${esc(c.nickname)}</td><td>${esc(c.type)}</td>
      <td>${esc(c.source)}</td>
      <td style="text-align:right">${c.amount != null ? fmtMoney(c.amount) : '--'}</td>
    </tr>`).join('');
  const insightsLi = r.insights.map(i => `<li style="margin:4px 0">${esc(i)}</li>`).join('');

  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:16px">
    <div style="background:${dark};color:#fff;padding:16px 20px;border-bottom:3px solid ${orange};border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:20px">MB2 Restore — Weekly Recap</h2>
      <div style="opacity:.85;font-size:13px;margin-top:4px">${r.window.start} – ${r.window.end}</div>
    </div>
    <p style="font-size:15px;font-weight:600;margin:16px 0">
      New Leads: ${r.header.newLeadsCount} (${fmtMoney(r.header.newLeadsTotal)}) &nbsp;|&nbsp;
      Jobs Closed: ${r.header.closedCount} (${fmtMoney(r.header.closedTotal)})
    </p>

    <h3 style="color:${dark};border-bottom:2px solid #eee;padding-bottom:6px">New Leads This Week</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f4f4f6;text-align:left">
        <th style="padding:8px">Date</th><th style="padding:8px">Status</th><th style="padding:8px">Nickname</th>
        <th style="padding:8px">Type</th><th style="padding:8px">Source</th><th style="padding:8px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rowsLeads || '<tr><td colspan="6" style="padding:8px;color:#999">No new leads this week</td></tr>'}</tbody>
    </table>

    <h3 style="color:${dark};border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px">Jobs Closed This Week</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f4f4f6;text-align:left">
        <th style="padding:8px">Date</th><th style="padding:8px">Nickname</th><th style="padding:8px">Type</th>
        <th style="padding:8px">Source</th><th style="padding:8px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rowsClosed || '<tr><td colspan="5" style="padding:8px;color:#999">No jobs closed this week</td></tr>'}</tbody>
    </table>

    <h3 style="color:${dark};border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px">Insights and Recommendations</h3>
    <ul style="font-size:14px;padding-left:20px">${insightsLi}</ul>
  </body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Add table rows striping by injecting border on tbody td (kept simple: add a style tag)
// (handled inline above; nothing extra needed)


// ---------- field recap (one user's prior week time + receipts) ----------
function buildFieldRecap(userName, timeEntries, receipts, weekParam) {
  const { start, end } = resolveWeek(weekParam);
  const isLunch = (e) => e.job_id === 'category:lunch';

  const myTime = timeEntries
    .filter(e => inWindow(e.date, start, end))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const myReceipts = receipts
    .filter(r => inWindow(r.date, start, end))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let totalMin = 0, lunchMin = 0;
  myTime.forEach(e => {
    const m = e.duration_minutes || 0;
    totalMin += m;
    if (isLunch(e)) lunchMin += m;
  });
  const paidMin = totalMin - lunchMin;
  const receiptTotal = myReceipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  return {
    user: userName,
    window: { start: fmtMD(start), end: fmtMD(end) },
    paidHours: (paidMin / 60).toFixed(2),
    lunchHours: (lunchMin / 60).toFixed(2),
    totalHours: (totalMin / 60).toFixed(2),
    timeCount: myTime.length,
    timeEntries: myTime.map(e => ({
      date: fmtMD(parseLocalDate(e.date)),
      job: jobLabelForEntry(e),
      hours: ((e.duration_minutes || 0) / 60).toFixed(2),
      lunch: isLunch(e)
    })),
    receiptTotal,
    receiptCount: myReceipts.length,
    receipts: myReceipts.map(r => ({
      date: fmtMD(parseLocalDate(r.date)),
      vendor: r.vendor || '',
      amount: parseFloat(r.amount) || 0,
      job: r.job_name || ''
    }))
  };
}

const CAT_LABELS = {
  'category:pto': 'Paid Time Off', 'category:shop': 'Shop',
  'category:unpaid': 'Unpaid Time Off', 'category:lunch': 'Lunch',
  'category:joblisted': 'Job Not Listed'
};
function jobLabelForEntry(e) {
  if (e.job_id && CAT_LABELS[e.job_id]) return CAT_LABELS[e.job_id];
  return e.job_name || 'Job';
}

function fieldRecapHtml(r) {
  const orange = '#F26522', dark = '#1a1a2e';
  const timeRows = r.timeEntries.map(t => `
    <tr><td>${t.date}</td><td>${esc(t.job)}</td><td style="text-align:right">${t.hours}</td></tr>`).join('');
  const recRows = r.receipts.map(c => `
    <tr><td>${c.date}</td><td>${esc(c.vendor)}</td><td>${esc(c.job)}</td><td style="text-align:right">${fmtMoney(c.amount)}</td></tr>`).join('');

  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:16px">
    <div style="background:${dark};color:#fff;padding:16px 20px;border-bottom:3px solid ${orange};border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:20px">Your Weekly Recap — ${esc(r.user)}</h2>
      <div style="opacity:.85;font-size:13px;margin-top:4px">${r.window.start} – ${r.window.end}</div>
    </div>
    <p style="font-size:15px;margin:16px 0">
      Hi ${esc(r.user)}, here's what we have on record for last week. <strong>Please review and add any missing time or receipts before Monday.</strong>
    </p>
    <p style="font-size:15px;font-weight:600;margin:12px 0">
      Paid hours: ${r.paidHours} hrs${parseFloat(r.lunchHours) > 0 ? ` (excl. ${r.lunchHours} lunch)` : ''} &nbsp;|&nbsp;
      Receipts: ${r.receiptCount} (${fmtMoney(r.receiptTotal)})
    </p>

    <h3 style="color:${dark};border-bottom:2px solid #eee;padding-bottom:6px">Time Entries</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f4f4f6;text-align:left">
        <th style="padding:8px">Date</th><th style="padding:8px">Job / Category</th><th style="padding:8px;text-align:right">Hours</th>
      </tr></thead>
      <tbody>${timeRows || '<tr><td colspan="3" style="padding:8px;color:#999">No time logged last week — please enter it.</td></tr>'}</tbody>
    </table>

    <h3 style="color:${dark};border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px">Receipts</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f4f4f6;text-align:left">
        <th style="padding:8px">Date</th><th style="padding:8px">Vendor</th><th style="padding:8px">Job</th><th style="padding:8px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${recRows || '<tr><td colspan="4" style="padding:8px;color:#999">No receipts last week.</td></tr>'}</tbody>
    </table>

    <p style="font-size:13px;color:#666;margin-top:20px">Log in to MB2 Core to add or fix anything before payroll runs Monday.</p>
  </body></html>`;
}

module.exports = { resolveWeek, buildOfficeRecap, officeRecapHtml, buildFieldRecap, fieldRecapHtml, parseLocalDate, fmtMoney, fmtMD, addDays, startOfWeekSun, jobAmount };
