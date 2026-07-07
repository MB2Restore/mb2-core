# MB2 Core — Weekly Emails Setup (Resend)

The three weekly emails are built and scheduled. This guide gets Resend connected
so they actually send. Until you add the API key, the app stays in **dry mode**
(emails are logged, not sent) — nothing breaks.

## The three emails

| # | Email | Who gets it | When (auto) |
|---|-------|-------------|-------------|
| 1 | Field hours reminder ("confirm your hours before Mon 8 AM") | Each **field** staff (personalized) | **Sunday 7:00 AM ET** |
| 2 | Weekly job recap | **Office + Admin** | **Monday 8:00 AM ET** |
| 3 | Hours by employee (totals) | **Admins** | **Monday 8:00 AM ET** |

All cover **last week** (Mon–Sun).

---

## Step 1 — 🌐 Resend: verify a sender + get an API key

You already created the account. Now:

1. **Verify who you send *from*.** Two options:
   - **Fastest (test now):** Resend → **Domains** may let you send from `onboarding@resend.dev` immediately, or verify a single email address. Good enough to test.
   - **Best (before real rollout):** Resend → **Domains** → **Add Domain** → enter `mb2cares.com`. Resend shows a few **DNS records** (SPF/DKIM). Add them at **GoDaddy** (same as we did for the app domain). Once verified, emails from `noreply@mb2cares.com` land in inboxes, not spam.
2. **Get the API key:** Resend → **API Keys** → **Create API Key** → name it "MB2 Core" → copy it (starts with `re_...`). 📋 Save it — shown once.

---

## Step 2 — 🌐 Render: add the email env vars

Render → your **`mb2-core-api`** service → **Environment** → add:

```
RESEND_API_KEY = re_...your key...
FROM_EMAIL     = MB2 Core <noreply@mb2cares.com>
```

> `FROM_EMAIL` must match a **verified** sender from Step 1. If you're testing
> with resend.dev first, use `MB2 Core <onboarding@resend.dev>` here temporarily.

Save → Render auto-redeploys (~2 min). On boot the logs will show
`[email] Resend configured (from: ...)`.

---

## Step 3 — Test before trusting the schedule

In the app: **Users** tab → **Send Test Emails** panel → three buttons:
- **Send Field Reminders** — emails each field staff their hours.
- **Send Office Recap** — emails office + admins the job recap.
- **Send Hours by Employee** — emails admins the hours totals.

Each asks for confirmation, then sends **right now** to the **real recipients**
for **last week**. Start by testing with just yourself as the recipient (e.g.
temporarily set a test user's email to your own), or send the Office/Hours ones
(they go to admins = you) first.

If a button says *"email not configured yet"*, the key isn't set on Render yet.

---

## Step 4 — Automatic schedule (already on)

Once the key is set, the cron schedule runs automatically:
- **Sunday 7:00 AM ET** → field reminders
- **Monday 8:00 AM ET** → office recap + hours by employee

No action needed — it's armed at server start (you'll see `[cron] Weekly email
schedule armed` in the Render logs).

> Note: Render's free instance can sleep; a paid instance stays awake so cron
> always fires on time. If you're on the free tier and a scheduled send is ever
> missed, the "Send Test Emails" buttons are the manual fallback.

---

## Notes

- **Recipients** are pulled live from your users: field-role users (#1),
  office+admin (#2), admins (#3). Only **active** users with an email are included.
- **Secrets** (`RESEND_API_KEY`) live only in Render's env settings — never in the code.
- To pause all emails without removing the key: set `EMAIL_ENABLED=false` on Render.
