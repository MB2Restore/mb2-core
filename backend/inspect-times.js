// Read-only diagnostic: shows time entries whose clock_in/out are missing or midnight,
// so we can see what the "12:00 AM - 12:00 AM" rows actually contain. Writes NOTHING.
require('dotenv').config();
const { all, pool } = require('./db');

(async () => {
  const rows = await all(`
    SELECT id, date, clock_in, clock_out, duration_minutes, technician_name, notes
    FROM time_entries
    ORDER BY date DESC
    LIMIT 200
  `);

  let bad = 0, good = 0;
  const samples = [];
  for (const r of rows) {
    const ci = r.clock_in ? String(r.clock_in) : null;
    const co = r.clock_out ? String(r.clock_out) : null;
    const ciTime = ci && /T(\d{2}):(\d{2})/.exec(ci);
    const coTime = co && /T(\d{2}):(\d{2})/.exec(co);
    const isMidnightOrMissing =
      !ci || !co ||
      (ciTime && ciTime[1] === '00' && ciTime[2] === '00' &&
       coTime && coTime[1] === '00' && coTime[2] === '00');
    if (isMidnightOrMissing) {
      bad++;
      if (samples.length < 12) samples.push({
        date: r.date, clock_in: ci, clock_out: co,
        dur: r.duration_minutes, who: r.technician_name
      });
    } else good++;
  }

  console.log(`Total recent entries scanned: ${rows.length}`);
  console.log(`Entries with REAL start/stop times: ${good}`);
  console.log(`Entries showing 12:00AM-12:00AM (missing/midnight clock times): ${bad}`);
  console.log(`\nSamples of the affected rows:`);
  for (const s of samples) {
    console.log(`  ${s.date} | in=${s.clock_in} out=${s.clock_out} | ${s.dur} min | ${s.who}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
