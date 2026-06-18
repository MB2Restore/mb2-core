// One-time import of test job data into MB2 Core.
// USAGE: with the backend running (npm start), in another terminal:
//   cd C:\Users\DJ\Desktop\mb2-restore-app\backend
//   node import-jobs.js
//
// Talks to the running backend over HTTP (http://localhost:5000) so it works
// even though the SQLite native module won't load outside your machine.

const API = process.env.API_URL || 'http://localhost:5000';

// Valid statuses the app knows about (from JobDetail.js)
const VALID_STATUSES = [
  'Lead', 'Assessment Scheduled', 'Estimate Due', 'Estimate Delivered',
  'Work Scheduled', 'Work to be Scheduled', 'In Process', 'Hold',
  'Project Cancelled', 'Send Final Bill', 'Completed'
];
const VALID_TYPES = [
  'Water Mitigation', 'Mold Remediation', 'Fire Mitigation',
  'Repair', 'Biohazard Cleanup', 'Cleanup'
];

// Normalize a sheet status to a valid app status
function mapStatus(s) {
  if (!s) return 'Lead';
  const t = s.trim();
  const fixes = {
    'Estimated Delivered': 'Estimate Delivered',
    'In Progress': 'In Process'
  };
  const mapped = fixes[t] || t;
  return VALID_STATUSES.includes(mapped) ? mapped : 'Lead';
}

// Normalize a sheet work type to a valid app type
function mapType(t) {
  if (!t) return 'Water Mitigation';
  const fixes = { 'Clean up': 'Cleanup', 'Cleanup': 'Cleanup' };
  const mapped = fixes[t.trim()] || t.trim();
  return VALID_TYPES.includes(mapped) ? mapped : 'Water Mitigation';
}

// "4/16/26, 10:11 AM" or "4/18/26" -> "2026-04-16" (ISO date)
function mapDate(d) {
  if (!d) return null;
  const datePart = d.split(',')[0].trim();
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, da, yr] = m;
  if (yr.length === 2) yr = '20' + yr;
  return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

// "$5,700" -> 5700 ; "" -> null
function mapAmount(a) {
  if (!a) return null;
  const n = parseFloat(a.replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

// Combine current note + old notes into one notes field
function mapNotes(note, oldNotes) {
  const parts = [];
  if (note && note.trim()) parts.push(note.trim());
  if (oldNotes && oldNotes.trim()) parts.push('--- Older notes ---\n' + oldNotes.trim());
  return parts.join('\n\n') || null;
}

// Rows from "App Sheet Import" (columns in sheet order)
const ROWS = [
  ['93 Henry Law Ave #54','Ernest Fleisher','603 969 4034','','93 Henry Law Ave, Dover, NH 03820, USA','Water Mitigation','Website','4/16/26, 10:11 AM','','','In Process','','','4/17: Chris went there on Thursday and we owe him an estimate',''],
  ['60 Pointe Place','Nathan Leach','','','60 Pointe Pl, Dover, NH 03820, USA','Water Mitigation','Summit Land','4/18/26, 8:30 AM','4/18/26','','In Process','','','4/20: 10 DH and 40 fans - Ronny and Chris there today',''],
  ['100 Borthwick Temp work','100 Borthwick LLC (Andrew from CP I assume)','','','100 Borthwick Ave, Portsmouth, NH 03801, USA','Clean up','Andrew formerly of CP','4/24/26, 1:37 PM','4/27/26','','In Process','','','4/24: 2 temps for a day or two to help Andrew. We need to remember to bill this',''],
  ['217 South Main Street','Dylan','Joe has','','217 S Main St, Laconia, NH 03246, USA','Biohazard Cleanup','Joe - State Police','4/21/26, 2:42 PM','4/22/26','4/24/26, 2:42 PM','Completed','$5,700','4/27/26','4/24: Need to send final bill to the adjuster Tim Crowley',''],
  ['4 Alexander Drive','John Kelly','','','4 Alexander Drive Hampton NH','Water Mitigation','Joe Ebert','4/24/26, 1:54 PM','4/25/26','','In Process','','','5/5: Equipment in, not sure of next steps',''],
  ['53 Windsor Meadow','Lidia Real CP Management','','','53 Windsor Meadow Brentwood NH','Water Mitigation','CP Management Lidia','5/5/26, 1:56 PM','','','Estimated Delivered','$1,500','','5/5: Ronny delivered proposal',''],
  ['115 Samuel Hale Drive','Susan Westhall','','','115 Samuel Hale Drive, Hales Location','Water Mitigation','Joe','4/21/26, 1:59 PM','5/5/26','5/13/26, 4:07 PM','Completed','$4,334','5/13/26','5/13: Completed and invoiced','5/5: Not sure what is going on'],
  ['330 Borthwick Ave','CP Management','','','330 Borthwick Ave, Portsmouth, NH 03801, USA','Water Mitigation','CP Management','5/28/26, 12:28 PM','5/28/26','','In Process','','','6/2: Toilet issue',''],
  ['10 Big Rock Road','Rick Trussel','972 804 8922','','10 Big Rock Rd, Rye, NH 03870, USA','Repair','Customer Referral: Max and Mary Rice','6/3/26, 8:28 AM','','','Estimate Due','','','6/3: Tree hit side of house on Saturday. Tom and DJ going to look at today at 1:00',''],
  ['107 High Road','Gary Kustra','603 396 3737','','107 High Rd, Lee, NH 03861, USA','Fire Mitigation','Andover Ryan Werner','6/3/26, 2:52 PM','6/5/26','','In Process','$17,085','','6/3: Fire in house from cushions leaned against pellet stove - lot of cleaning and pergot floor. Newer house. Ronny meeting Thursday 6/4 @ 11',''],
  ['6 Curriers Court','N/A','','','6 Curriers Cove, Portsmouth, NH 03801, USA','Water Mitigation','JD Drains','6/6/26, 9:28 PM','6/6/26','','In Process','','','6/7: Clean up started and equipment in',''],
  ['144 West Road','N/A','','','144 W Rd, Rye, NH 03870, USA','Water Mitigation','Randy Jones','6/5/26, 9:29 PM','','','In Process','','','6/7: starting on monday','']
];

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${path} -> ${res.status}: ${txt}`);
  }
  return res.json();
}

async function put(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${path} -> ${res.status}: ${txt}`);
  }
  return res.json();
}

async function run() {
  // Sanity: backend reachable?
  try {
    const h = await fetch(`${API}/api/health`);
    if (!h.ok) throw new Error('health check failed');
  } catch (e) {
    console.error(`\nCannot reach backend at ${API}. Start it first (npm start) in another terminal.\n`);
    process.exit(1);
  }

  // Guard against duplicates: skip any job whose nickname already exists.
  let existingNicknames = new Set();
  try {
    const res = await fetch(`${API}/api/jobs`);
    if (res.ok) {
      const jobs = await res.json();
      existingNicknames = new Set(jobs.map(j => (j.nickname || '').trim()));
    }
  } catch (e) {
    console.warn('Could not load existing jobs to check for duplicates; importing all rows.');
  }

  let ok = 0, fail = 0, skipped = 0;
  for (const r of ROWS) {
    const [nickname, custName, phone, email, address, type, leadSource,
           dateReceived, dateStarted, dateCompleted, status, amount,
           dateInvoiced, note, oldNotes] = r;

    if (existingNicknames.has(nickname.trim())) {
      console.log(`  SKIP ${nickname}  (already imported)`);
      skipped++;
      continue;
    }

    // Fall back to the nickname as the customer name when the sheet says N/A/blank
    const cleanName = (custName && custName.trim() && custName.trim() !== 'N/A')
      ? custName.trim() : nickname;
    const cleanPhone = (phone && /\d/.test(phone)) ? phone.trim() : '';

    try {
      const customer = await post('/api/customers', {
        name: cleanName,
        phone: cleanPhone,
        email: email || '',
        address: address
      });

      const job = await post('/api/jobs', {
        customer_id: customer.id,
        nickname: nickname,
        address: address,
        type: mapType(type),
        lead_source: leadSource,
        phone: cleanPhone
      });

      await put(`/api/jobs/${job.id}`, {
        status: mapStatus(status),
        date_received: mapDate(dateReceived),
        start_date: mapDate(dateStarted),
        date_completed: mapDate(dateCompleted),
        date_invoiced: mapDate(dateInvoiced),
        amount: mapAmount(amount),
        project_amount: mapAmount(amount),
        next_steps: mapNotes(note, oldNotes),
        customer_email: email || ''
      });

      console.log(`  OK   ${nickname}  [${mapStatus(status)}]`);
      ok++;
    } catch (e) {
      console.log(`  FAIL ${nickname}  -> ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone. Imported ${ok} job(s), skipped ${skipped} (already present), ${fail} failed.\n`);
}

run();
