# MB2 Core — Deployment Gameplan

*Last updated: June 2026*

This is your step-by-step plan to take MB2 Core from "running on DJ's laptop" to "live on the internet for the whole team." It's written so you can do the account sign-ups and clicks; Claude does the code.

---

## The short version

| | |
|---|---|
| **What it costs** | ~**$14–21/month** to start (can run on mostly free tiers at first) |
| **How long** | ~**1–2 weeks** of part-time work, most of it Claude's code prep |
| **Hardest part** | The database conversion (Claude does this) — everything else is sign-ups and button clicks |
| **Where it ends up** | A real web address (e.g. `app.mb2restore.com`) your team uses from any phone or computer |

---

## What's already done ✅

You've actually knocked out the hardest security piece already:

- **Login security is production-grade** — passwords are encrypted (bcrypt) and sessions use secure tokens (JWT). This was the #1 thing that had to change before going public, and it's finished.
- **The app is built to be deployed** — the frontend already knows how to point at a production backend via a setting, so no code surgery there.

## What still has to happen before launch 🔧

Three things, all of which Claude writes the code for:

1. **Move the database from SQLite to PostgreSQL.** Right now the app stores everything in a single file on your computer. That's perfect for building, but a hosted app needs a real database server. Claude converts the code and writes a script to move your existing data over. *(This is the "hardest part" — but it's Claude's job, not yours.)*

2. **Move receipt photos to cloud storage (Cloudflare R2).** Photos currently save to a folder on the server. On the hosting platform, that folder gets wiped on every update — so photos would disappear. They need to live in cloud storage instead. Claude wires this up.

3. **Put the code on GitHub.** This is how the hosting services pull your app. It's a one-time setup.

---

## The accounts you'll create (and what they cost)

You'll sign up for these. Free tiers cover you at first; the prices below are what you'd pay as the team actually uses it.

| Service | What it does | Cost to start | Sign up at |
|---|---|---|---|
| **GitHub** | Stores the code; hosting pulls from here | **Free** | github.com |
| **Render** | Runs the backend (the "engine") + hosts the database | **$7/mo** backend + **$7/mo** database = **$14/mo** | render.com |
| **Netlify** | Hosts the frontend (what users see) | **Free** to start | netlify.com |
| **Cloudflare** | Your web address + stores receipt photos (R2) | **Free** DNS; R2 ~**$0–5/mo** | cloudflare.com |
| **SendGrid** *(only when we turn on the weekly emails)* | Sends the Sunday/Monday recap emails | **Free** up to ~100 emails/day | sendgrid.com |

**Realistic monthly total at launch: ~$14–21/month.** It scales up only if usage grows a lot.

You'll also need: a **domain name** (e.g. `mb2restore.com`) if you don't already own one — about **$10–15/year**. If you already have the domain, even better.

---

## The step-by-step plan

### Phase 1 — Get the code ready (Claude does this)
*Claude writes the code; you don't have to do anything here except review.*

- [ ] Claude converts the database to PostgreSQL + writes the data-migration script
- [ ] Claude moves receipt photo storage to Cloudflare R2
- [ ] Claude sets up the environment-config files (the settings that differ between your laptop and production)

**What you hand Claude:** nothing yet — this phase is code prep.

---

### Phase 2 — Create the accounts (you do this)
*~1 hour of sign-ups. Do these in order.*

1. [ ] **Create a GitHub account** (github.com) → create a new repository called `mb2-core`.
   - **Hand Claude:** confirmation it's created (or let Claude give you the exact commands to push the code).

2. [ ] **Create a Render account** (render.com) → in Render, create a **PostgreSQL database**.
   - When it's created, Render gives you a **"Connection String"** (a long line starting with `postgres://...`).
   - **Hand Claude:** that connection string *(this is a secret — paste it where only you and the setup can see it; it goes into a settings file, never into the code itself).*

3. [ ] **Create a Cloudflare account** (cloudflare.com) → set up **R2 storage** → create a "bucket" called `mb2-receipts`.
   - Cloudflare gives you an **Access Key, Secret Key, and Account ID**.
   - **Hand Claude:** those three R2 credentials *(also secrets).*

4. [ ] **Create a Netlify account** (netlify.com) → you'll connect it to GitHub in the next phase.

---

### Phase 3 — Deploy (you click, Claude guides)
*~1–2 hours. Claude gives you the exact settings to paste at each step.*

1. [ ] **Push the code to GitHub** (Claude gives you ~3 commands to run, or walks you through GitHub Desktop).

2. [ ] **Deploy the backend on Render:**
   - Render → "New Web Service" → connect your GitHub repo → point it at the `backend` folder.
   - Paste in the **environment variables** Claude gives you (database connection, R2 keys, a JWT secret, etc.).
   - Render builds it and gives you a backend URL like `https://mb2-core-api.onrender.com`.
   - **Hand Claude:** that backend URL.

3. [ ] **Deploy the frontend on Netlify:**
   - Netlify → "Add new site" → connect GitHub → point it at the `frontend` folder.
   - Set one setting: `REACT_APP_API_URL` = your Render backend URL (from the step above).
   - Netlify gives you a temporary URL like `https://mb2-core.netlify.app`.

4. [ ] **Test it** at the Netlify URL — log in as admin, click around. (This is the "does it actually work" moment.)

---

### Phase 4 — Your real web address (you do this)
*~30 min + waiting for DNS to update.*

1. [ ] In **Cloudflare**, add your domain (`mb2restore.com`) if it's not already there.
2. [ ] Add DNS records (Claude gives you the exact ones) pointing:
   - `app.mb2restore.com` → Netlify (the app)
   - `api.mb2restore.com` → Render (the backend)
3. [ ] Wait for it to take effect (minutes to a couple hours), then test at `app.mb2restore.com`.

**🎉 At this point the app is LIVE for your team.**

---

### Phase 5 — Turn on the weekly emails (later, optional)
*Do this after launch once you're happy with everything.*

1. [ ] Create a **SendGrid account**, verify a sending email (e.g. `noreply@mb2cares.com`), get an **API key**.
   - **Hand Claude:** the SendGrid API key + the "from" email you want to use.
2. [ ] Claude wires up the actual email sending + the automatic Sunday/Monday schedule.
3. [ ] You send a test to yourself, confirm it looks right, then let it run.

---

## What I (Claude) need from you, summarized

When you're ready to deploy, you'll collect these and hand them over (they're secrets — handle like passwords):

| Item | From | Used for |
|---|---|---|
| Database connection string | Render | Connecting the app to the database |
| R2 Access Key + Secret + Account ID | Cloudflare | Storing receipt photos |
| Backend URL | Render (after deploy) | Pointing the frontend at the backend |
| Domain name | Your registrar / Cloudflare | Your real web address |
| SendGrid API key + "from" email | SendGrid (Phase 5) | Sending the weekly emails |

**A note on secrets:** none of these ever go *into the code* (which is public on GitHub). They go into a private "environment variables" settings panel on Render/Netlify. Claude will show you exactly where each one goes.

---

## For the owner demo

A few talking points if it helps frame the video walkthrough for the other owners:

- **It's the same app they'll use in production** — what you're demoing is the real thing, just running locally for now.
- **Security is already handled** — encrypted passwords, role-based access (admins, office, field staff each see only what they should).
- **Field staff get a phone-friendly view** — they log time and snap receipt photos from the field; they only see job info relevant to them (not financials or payroll).
- **Office/owners get the full picture** — jobs, financials, time, receipts, weekly recaps, and exports for payroll/accounting.
- **Cost is modest** — roughly **$15–20/month** to run for the whole team, vs. per-seat SaaS fees that add up fast.
- **It replaces/augments AppSheet** — including the weekly recap emails you already rely on.

---

## Bottom line

You're in good shape. The scary part (auth security) is done, the platforms are cheap and beginner-friendly, and the genuinely technical steps (database + photo storage) are Claude's to write. Your job is sign-ups, pasting settings where Claude points, and testing.

**When you're ready, the first move is Phase 1** — just tell Claude "let's do the Postgres migration" and we start.
