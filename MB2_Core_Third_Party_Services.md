# MB2 Core — Third-Party Services

*The external services MB2 Core depends on to run, what each does, and what they cost. For ownership and management reference.*

---

## Overview

MB2 Core is built and hosted on a small set of established, industry-standard services rather than on in-house servers. This keeps costs low, avoids the burden of maintaining physical infrastructure, and means each piece can be scaled or replaced independently if needs change.

There are **five** services. Each does one job, and each is used at or near a **free tier** given MB2's current volume. All accounts are owned by MB2 (registered under company email), so ownership retains control regardless of who administers them day to day.

| Service | What it does | Rough cost today |
|---|---|---|
| **GitHub** | Stores the application's source code | Free |
| **Render** | Runs the backend + the database | ~$0–14/month |
| **Netlify** | Serves the app users see in their browser | Free |
| **Cloudflare** | Stores uploaded files (receipts, documents) | ~$0–5/month |
| **Resend** | Sends the automated emails | Free |

**Estimated total: roughly $0–20/month** at current usage, with no per-user fees.

---

## The Services

### 1. GitHub — Source Code Storage
**What it does:** GitHub holds the master copy of MB2 Core's code. Every change to the application is saved here, with a full history. When the app is updated, the hosting services pull the latest code from GitHub automatically.

**Why we rely on it:** It's the system of record for the software itself — the equivalent of the blueprints. It also provides version history, so any change can be reviewed or rolled back.

**Cost:** Free (private repository).

**Risk / continuity:** GitHub is the industry standard, owned by Microsoft, used by millions of organizations. Very low risk. The code is also mirrored on the developer's machine, so it exists in more than one place.

---

### 2. Render — Backend & Database Hosting
**What it does:** Render runs two things: the **backend** (the "engine" that processes logins, saves jobs, time, and receipts) and the **PostgreSQL database** (where all of MB2's data actually lives — every job, timesheet, and record).

**Why we rely on it:** This is where the business's data resides and where all the core logic runs. It is the most critical piece.

**Cost:** A free tier exists but "sleeps" when idle (causing a short delay on first use). For dependable daily use, the backend runs on a low-cost paid instance (~$7/month), and the database is similarly ~$7/month — roughly **$14/month** combined when on paid tiers.

**Risk / continuity:** Render is a well-established hosting provider. The most important safeguard here is **database backups** — because this holds all company data, regular backups are essential and are part of standard operating practice. If Render were ever a problem, the backend and database could be moved to a comparable provider (the data is standard PostgreSQL, which is portable).

---

### 3. Netlify — Frontend Hosting
**What it does:** Netlify serves the part of MB2 Core that users actually see and click — the web pages, buttons, and screens — delivered fast to any browser or phone. It also provides the secure connection (the padlock / HTTPS) and connects the custom web address (core.mb2restore.com).

**Why we rely on it:** It's how the team reaches the app. When someone opens core.mb2restore.com, Netlify is what loads.

**Cost:** Free tier, which comfortably covers MB2's usage. (Usage is measured in build activity and traffic; MB2 is well within the free allowance.) Importantly, the free plan has **no overage charges** — if a limit is ever hit, it pauses rather than bills.

**Risk / continuity:** Low. The frontend contains no sensitive data (it's just the interface), and it can be redeployed to another host quickly since it builds from the code in GitHub.

---

### 4. Cloudflare — File Storage (Receipts & Documents)
**What it does:** Cloudflare's storage (a service called "R2") holds the **files** users upload — receipt photos and job documents like estimates, approvals, and authorizations. When someone views a receipt or opens a document, it's served from here.

**Why we rely on it:** Files can't be stored on the backend itself (that storage is temporary and gets wiped on updates), so uploaded files live in Cloudflare's durable storage instead.

**Cost:** Free tier covers a generous amount of storage; expected cost is roughly **$0–5/month** as files accumulate. Cloudflare notably does not charge fees to retrieve files, which keeps costs predictable.

**Risk / continuity:** Cloudflare is a major, well-known internet infrastructure company. Low risk. The storage uses a standard format (S3-compatible), so files could be migrated to another provider if ever needed.

---

### 5. Resend — Email Delivery
**What it does:** Resend sends MB2 Core's automated emails — the weekly hours reminders to field staff, the Monday job recap and hours summary to the office, and the instant new-job alerts.

**Why we rely on it:** Sending email reliably (so it reaches inboxes and not spam) requires a specialized service. Resend handles that, sending from MB2's own verified domain (mb2cares.com).

**Cost:** Free tier includes 3,000 emails/month — far more than MB2 sends (a few dozen a week). Expected cost: **free** for the foreseeable future.

**Risk / continuity:** Email is a "nice to have" layer, not core to running jobs — if it were interrupted, the app itself keeps working fully; only the automated emails would pause. Resend could also be swapped for another email provider with modest effort. Low business risk.

---

## Key Points for Ownership

- **All accounts are MB2-owned.** Each service is registered under a company account, so the business — not any individual — controls access. Login credentials should be stored securely and shared with a second trusted person for continuity.

- **Total cost is minimal.** Roughly $0–20/month all-in, with no per-user or per-seat fees. Costs scale only if usage grows substantially.

- **No single service holds everything.** Data (Render), code (GitHub), interface (Netlify), files (Cloudflare), and email (Resend) are separate. A problem with one doesn't take down the others, and each can be replaced independently.

- **The critical piece to protect is the database (Render).** It holds all company data. Regular backups are the single most important safeguard and should be verified periodically.

- **Everything is portable.** The app is built on open, standard technologies (PostgreSQL, standard web code, S3-compatible storage), so it is not locked to any one vendor. If any service became unsuitable, it could be migrated to a comparable alternative.
