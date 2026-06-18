# Exporting Your AppSheet Data → Google Sheet

*For seeding MB2 Core staging/production with real data. Do this when we reach the data-import step (after the Postgres migration).*

---

## What we're pulling

- **Jobs** (the main table)
- **Customers** (if it's a separate table from Jobs)

We'll import:

- All jobs with a **Date Received on or after Jan 1, 2026**, **plus**
- Any **open job from before 2026** (still-active work — anything not Completed or Cancelled)

You don't need to filter the export yourself — export everything and the import script applies that rule. Just get the full tables into a Google Sheet with clean headers.

---

## Step-by-step

### 1. Open your AppSheet app editor

Go to **appsheet.com** → sign in → open the MB2 app → you'll land in the editor.

### 2. Find the source data

In the left toolbar, click **Data** (the table/grid icon).

You'll see your tables listed (e.g. **Jobs**, **Customers**). Click a table to see which Google Sheet and tab it's connected to — AppSheet shows the source file name near the top.

### 3. Open the underlying Google Sheet

Most AppSheet apps are already backed by Google Sheets. Click the link to the source spreadsheet (or note its name and open it from Google Drive).

**If your app is backed by Google Sheets:** you're basically done — that sheet *is* the export. Just make sure:

- Each table (Jobs, Customers) is its own **tab**
- The **first row is the header row** (column names)
- Share it with me (or paste the link)

### 4. If the data isn't already in a clean Google Sheet

Export each table to CSV, then drop it into a Google Sheet:

1. In the AppSheet editor, open the table under **Data**.
2. Look for the table's data view, or open the app itself → navigate to the table → use the app's **menu → "Download as CSV"** if enabled.
3. Alternatively, from the source Google Sheet: **File → Make a copy** so we work on a copy, not your live data.
4. Create one Google Sheet with a tab per table, paste each CSV in with headers intact.

### 5. Double-check before sharing

- [ ] Header row present on each tab (real column names, not blank)
- [ ] Jobs and Customers each on their own tab
- [ ] Dates are readable (any consistent format is fine — I'll handle parsing)
- [ ] It's a **copy**, so nothing happens to your live AppSheet data

### 6. Share it

Either:

- **Share the Google Sheet** (set link sharing so it can be read), and paste the link, **or**
- **Download as `.xlsx`** and drop it in this project folder.

---

## What happens next (my side)

1. I read the actual columns and map them to MB2 Core's fields (nickname, address, work type, status, lead source, dates, amounts, insurance notes, next steps, DocuSketch, etc.).
2. I write an import script that filters to the scope rule, de-dupes, and validates.
3. We run it against **staging** first → you spot-check in the app → then run against **production** at launch.

---

## Notes

- **No rush** — this comes *after* the Postgres migration, since the import writes to the new database.
- **Time entries and receipts** aren't being imported (that history stays in AppSheet). We're bringing over Jobs + Customers.
- **Don't worry about cleaning the data** — send it as-is. I'll handle messy columns, blank fields, and format quirks in the script, and we'll review anything questionable together before the production run.
