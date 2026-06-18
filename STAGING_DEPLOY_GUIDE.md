# MB2 Core — Staging Deployment Guide

*Step-by-step. Work top to bottom. Each step says exactly what to do and what to paste.*

**You have 4 tabs open:** GitHub, Render, Cloudflare, Netlify. We'll use them in this order:
GitHub → Cloudflare (R2) → Render (database + backend) → Netlify (frontend).

**Legend:**
- 🖥️ = run a command on your computer (in a terminal/PowerShell)
- 🌐 = do this in a browser tab
- 📋 = a value you'll copy and paste somewhere later — keep a scratch notepad open

---

## Before you start: open a scratch notepad

You'll collect ~7 values along the way (URLs and secrets). Keep a blank Notepad/note open and label these lines — you'll fill them in:

```
DATABASE_URL (internal)  =
DATABASE_URL (external)  =
JWT_SECRET               = 57b8ea244c7eeb7e6c2369dcc4e89d77200a7fcce563e388885caeccf8c177097f288e15627eac5408b7814af455532f
R2_ACCOUNT_ID            =
R2_ACCESS_KEY_ID         =
R2_SECRET_ACCESS_KEY     =
R2_BUCKET                = mb2-receipts
R2_PUBLIC_URL            =
BACKEND_URL (Render)     =
```

(The JWT_SECRET above is freshly generated for you — use it as-is, or generate your own later.)

---

## STEP 1 — 🖥️ Get the code ready & install dependencies (local)

Open a terminal on your computer.

```bash
cd C:\Users\DJ\Desktop\mb2-restore-app\backend
npm install
```

This installs the new packages (Postgres driver, R2 SDK, dotenv). It'll take a minute.

Then the frontend:

```bash
cd C:\Users\DJ\Desktop\mb2-restore-app\frontend
npm install
```

---

## STEP 2 — 🖥️ Put the code on GitHub

Still in a terminal:

```bash
cd C:\Users\DJ\Desktop\mb2-restore-app
git init
git add -A
git commit -m "MB2 Core — ready for staging deploy"
```

> If git asks you to set a name/email first, run:
> `git config --global user.email "djh@mb2cares.com"`
> `git config --global user.name "DJ Haskins"`
> then re-run the commit.

**Sanity check before pushing — make sure no secrets got committed:**

```bash
git status
git ls-files | findstr ".env"
```

The second command should return **nothing** (your `.env` is ignored). If it lists a `.env` file, STOP and tell me.

Now create the repo on GitHub:

1. 🌐 GitHub tab → click **New repository** (green button, or the **+** top-right).
2. Name it `mb2-core`. Set it to **Private**. Do **NOT** check "Add a README." Click **Create repository**.
3. GitHub shows a "push an existing repository" section. Copy the two lines that look like:

```bash
git remote add origin https://github.com/YOUR-USERNAME/mb2-core.git
git branch -M main
git push -u origin main
```

🖥️ Paste those into your terminal and run them. (It may pop up a GitHub login — approve it.)

✅ **Done when:** refreshing the GitHub repo page shows your `backend` and `frontend` folders.

---

## STEP 3 — 🌐 Cloudflare: create the R2 bucket (receipt photos)

1. Cloudflare tab → left sidebar → **R2**. (If it asks you to enable R2 / add a payment method, do so — R2 has a free tier and we'll stay well within it.)
2. Click **Create bucket**. Name it exactly: `mb2-receipts`. Region: default. Click **Create bucket**.
3. 📋 Grab your **Account ID**: it's on the R2 overview page (right side) — copy it into your notepad as `R2_ACCOUNT_ID`.

### Make the bucket photos publicly viewable

4. Open the `mb2-receipts` bucket → **Settings** tab → find **Public access** / **R2.dev subdomain** → **Enable** the public r2.dev URL.
5. 📋 It gives you a public URL like `https://pub-xxxxxxxx.r2.dev`. Copy it into your notepad as `R2_PUBLIC_URL`.

### Create an API token (the keys the app uses)

6. Back on the main **R2** page → **Manage R2 API Tokens** (top-right) → **Create API token**.
7. Permissions: **Object Read & Write**. Scope it to the `mb2-receipts` bucket (or all buckets — fine for staging). Click **Create**.
8. 📋 It shows an **Access Key ID** and a **Secret Access Key** — copy BOTH into your notepad (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). The secret is shown **once** — don't close the page until it's saved.

✅ **Done when:** your notepad has Account ID, Public URL, Access Key ID, and Secret Access Key.

---

## STEP 4 — 🌐 Render: create the Postgres database

1. Render tab → **New +** (top-right) → **PostgreSQL**.
2. Name: `mb2-core-db`. Region: pick the one closest to you. Plan: the **free** or **Basic** tier is fine for staging.
3. Click **Create Database**. Wait ~1–2 min for it to provision (status goes "Available").
4. On the database page, scroll to **Connections**. You'll see two connection strings:
   - 📋 **Internal Database URL** → copy as `DATABASE_URL (internal)` — this is what the backend will use.
   - 📋 **External Database URL** → copy as `DATABASE_URL (external)` — you'll use this once to load data.

✅ **Done when:** both connection strings are in your notepad.

---

## STEP 5 — 🌐 Render: deploy the backend

1. Render → **New +** → **Web Service**.
2. **Connect a repository** → connect your GitHub → pick `mb2-core`. (Approve Render's GitHub access if prompted.)
3. Fill in the settings:
   - **Name:** `mb2-core-api`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free or Basic
4. Scroll to **Environment Variables** → add each of these (click "Add Environment Variable" per row). Paste the values from your notepad:

```
DATABASE_URL        = <your Internal Database URL>
JWT_SECRET          = <the JWT_SECRET from your notepad>
NODE_ENV            = production
R2_ACCOUNT_ID       = <from notepad>
R2_ACCESS_KEY_ID    = <from notepad>
R2_SECRET_ACCESS_KEY= <from notepad>
R2_BUCKET           = mb2-receipts
R2_PUBLIC_URL       = <from notepad>
```

> Do **not** set PORT — Render provides it automatically.

5. Click **Create Web Service**. Render builds and starts it (watch the logs). First build takes a few minutes.
6. When it's live, the logs should show **"Database schema initialized"** and **"Seeded default admin"** and **"Cloudflare R2 enabled."**
7. 📋 At the top of the service page, copy the URL (like `https://mb2-core-api.onrender.com`) into your notepad as `BACKEND_URL`.

**Quick test:** 🌐 open `<BACKEND_URL>/api/health` in a browser. You should see `{"status":"Backend is running"}`.

✅ **Done when:** the health check returns that JSON.

---

## STEP 6 — 🌐 Netlify: deploy the frontend

1. Netlify tab → **Add new site** → **Import an existing project** → **GitHub** → pick `mb2-core`.
2. Build settings:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `frontend/build`
3. Before deploying, click **Add environment variables** (or **Show advanced**) and add:

```
REACT_APP_API_URL = <your BACKEND_URL from Render, e.g. https://mb2-core-api.onrender.com>
```

> No trailing slash.

4. Click **Deploy**. Netlify builds the React app (~2–3 min) and gives you a URL like `https://random-name-123.netlify.app`.

### One more thing — let the backend accept the Netlify URL

The backend currently allows all origins (fine for staging), so no change needed right now. (We'll lock this down before production.)

✅ **Done when:** the Netlify URL loads the MB2 Core login screen.

---

## STEP 7 — 🌐 First login test

1. Open your Netlify URL.
2. Log in with the seeded admin:
   - **Email:** `djh@mb2cares.com`
   - **Password:** `admin123`
3. Click around: Jobs, Time Tracking, Receipts, Users. It'll be empty (fresh database) — that's expected.
4. **Change that admin password** soon (it's a known default).

If login works, **staging is live.** 🎉

---

## STEP 8 — 🖥️ Load your test data into staging (optional but recommended)

This copies the data from your local app into the staging database so it's not empty.

```bash
cd C:\Users\DJ\Desktop\mb2-restore-app\backend
```

Set the database URL to the **External** one (from Step 4) and run the migration:

**Windows PowerShell:**
```powershell
$env:DATABASE_URL="<your External Database URL>"
npm install sqlite3
node migrate-sqlite-to-pg.js
```

**Windows CMD:**
```cmd
set DATABASE_URL=<your External Database URL>
npm install sqlite3
node migrate-sqlite-to-pg.js
```

It prints how many rows it migrated per table. Refresh the app — your jobs/customers should now appear.

> (The real AppSheet import is a separate step we'll do later — this just seeds your current test data.)

---

## If something goes wrong

- **Render build fails:** open the deploy logs, copy the error, send it to me.
- **Health check fails / 502:** the backend probably can't reach the database — double-check `DATABASE_URL` is the **Internal** URL and has no typos.
- **App loads but login fails / network error:** `REACT_APP_API_URL` on Netlify is wrong or has a trailing slash. Fix it and redeploy.
- **Photos don't show:** check the 5 R2 vars on Render, and that the bucket's public r2.dev URL is enabled.
- **Anything else:** tell me which step + the exact error text.

---

## What we do after staging looks good

1. Lock down CORS to just your domain (security hardening for production).
2. Repeat Steps 4–6 for a **production** database + services.
3. Point a real domain (`app.mb2restore.com`) via Cloudflare DNS.
4. Run the **AppSheet → Google Sheet** real-data import.
5. Turn on the weekly recap emails (SendGrid).

Tell me when staging is up and we'll take the next step.
