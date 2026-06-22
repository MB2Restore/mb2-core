// One-time migration: convert each job's "Next Steps" text into a Project Note
// (its newest one), then clear the next_steps field. After this, Project Notes is
// the single running log and Next Steps is retired.
//
// Idempotent: skips a job if a project note with identical text already exists for it
// (so re-running won't create duplicates). Only touches jobs that still have next_steps.
//
// USAGE (run locally; SSL required for Render):
//   set NODE_ENV=production
//   set DATABASE_URL=<your External Database URL>
//   node migrate-nextsteps-to-notes.js            # DRY RUN — reports what it would do
//   node migrate-nextsteps-to-notes.js --commit   # actually migrates

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { all, get, run, pool } = require('./db');

const COMMIT = process.argv.includes('--commit');

async function main() {
  console.log('========================================');
  console.log('  Migrate Next Steps -> Project Notes');
  console.log('  Mode:', COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)');
  console.log('========================================');

  const jobs = await all(
    `SELECT id, nickname, next_steps FROM jobs
     WHERE next_steps IS NOT NULL AND TRIM(next_steps) <> ''`
  );
  console.log(`Jobs with Next Steps text: ${jobs.length}`);

  let migrated = 0, skipped = 0;
  for (const j of jobs) {
    const text = (j.next_steps || '').trim();
    if (!text) continue;

    // idempotency: does a note with this exact text already exist for the job?
    const dup = await get(
      'SELECT 1 FROM project_notes WHERE job_id = $1 AND note_text = $2 LIMIT 1',
      [j.id, text]
    );
    if (dup) {
      skipped++;
      if (COMMIT) {
        // still clear next_steps so the field is retired
        await run('UPDATE jobs SET next_steps = NULL WHERE id = $1', [j.id]);
      }
      continue;
    }

    if (COMMIT) {
      const now = new Date().toISOString();
      await run(
        `INSERT INTO project_notes (id, job_id, note_text, created_by, created_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), j.id, text, 'Imported (Next Steps)', now]
      );
      await run('UPDATE jobs SET next_steps = NULL WHERE id = $1', [j.id]);
    }
    migrated++;
  }

  if (!COMMIT) {
    console.log(`\nWOULD migrate: ${migrated} jobs' Next Steps into Project Notes`);
    console.log(`WOULD skip (note already exists): ${skipped}`);
    console.log('\n(DRY RUN — nothing written. Re-run with --commit to migrate.)');
  } else {
    console.log(`\nDONE. Migrated: ${migrated}, Skipped (already had the note): ${skipped}`);
    console.log('Next Steps field cleared on all processed jobs.');
  }

  await pool.end();
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1); });
