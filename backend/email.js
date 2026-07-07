// Email delivery via Resend (https://resend.com).
//
// Reads config from env:
//   RESEND_API_KEY  — your Resend API key (required to actually send)
//   FROM_EMAIL      — verified sender, e.g. "MB2 Core <noreply@mb2cares.com>"
//   EMAIL_ENABLED   — set to "false" to hard-disable sending (dry mode)
//
// If RESEND_API_KEY is missing, send() becomes a no-op that logs instead of
// throwing — so the app runs fine locally / before Resend is configured.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'MB2 Restore Core <onboarding@resend.dev>';
const EMAIL_ENABLED = process.env.EMAIL_ENABLED !== 'false';

const EMAIL_READY = Boolean(RESEND_API_KEY) && EMAIL_ENABLED;

if (!RESEND_API_KEY) {
  console.log('[email] RESEND_API_KEY not set — emails will be logged, not sent.');
} else if (!EMAIL_ENABLED) {
  console.log('[email] EMAIL_ENABLED=false — emails disabled (dry mode).');
} else {
  console.log('[email] Resend configured (from: ' + FROM_EMAIL + ')');
}

// Send one email. Returns { ok, id?, error?, skipped? }.
// `to` may be a string or array of strings.
async function sendEmail({ to, subject, html }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: 'No recipient' };

  if (!EMAIL_READY) {
    console.log(`[email] (not sent — not configured) to=${recipients.join(',')} subject="${subject}"`);
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject, html })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] Resend error:', data);
      return { ok: false, error: data.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail, EMAIL_READY, FROM_EMAIL };
