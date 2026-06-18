# MB2 Core - Deployment Implementation Checklist

## Quick Reference: What You Need to Do

### Phase 1: Foundation (2-3 Days)

#### Day 1: Setup & Database
- [ ] Create GitHub account (if needed)
- [ ] Create GitHub repository for mb2-restore-app
- [ ] Initialize git locally: `git init`
- [ ] Add remote: `git remote add origin <github-url>`
- [ ] Create `.gitignore` (add node_modules/, .env, *.db)
- [ ] Push code to GitHub
- [ ] **Database Migration:**
  - [ ] Create Render account
  - [ ] Create PostgreSQL database on Render
  - [ ] Note connection string from Render
  - [ ] Install `pg` package: `npm install pg`
  - [ ] Update `backend/server.js` to use PostgreSQL
  - [ ] Create migration script for data from SQLite → PostgreSQL
  - [ ] Test database connection locally
  - [ ] Update `.env` with PostgreSQL credentials

#### Day 2: Frontend Deployment
- [ ] Create Netlify account
- [ ] Connect GitHub repo to Netlify
- [ ] Configure build settings:
  - [ ] Build command: `cd frontend && npm run build`
  - [ ] Publish directory: `frontend/build`
- [ ] Set environment variables:
  - [ ] `REACT_APP_API_URL=https://api.mb2restore.com` (once backend deployed)
- [ ] Request custom domain: `app.mb2restore.com`
- [ ] Test frontend deployment
- [ ] Verify no console errors

#### Day 3: Backend Deployment & DNS
- [ ] Create Render account
- [ ] Create Web Service on Render
  - [ ] Connect GitHub repository
  - [ ] Select branch: `main`
  - [ ] Build command: `npm install`
  - [ ] Start command: `npm start`
- [ ] Create PostgreSQL database on Render
- [ ] Link database to Web Service
- [ ] Set environment variables in Render:
  - [ ] `DATABASE_URL` (from Render PostgreSQL)
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=10000` (Render default)
- [ ] Request custom domain: `api.mb2restore.com`
- [ ] **DNS Configuration:**
  - [ ] Log in to Cloudflare (mb2restore.com DNS)
  - [ ] Create CNAME record: `app` → Netlify subdomain
  - [ ] Create CNAME record: `api` → Render subdomain
  - [ ] Wait for DNS propagation (5-15 minutes)
- [ ] Update frontend config with production API URL
- [ ] Redeploy frontend on Netlify
- [ ] End-to-end testing:
  - [ ] Navigate to `app.mb2restore.com`
  - [ ] Fill intake form
  - [ ] Verify data saves to PostgreSQL
  - [ ] Check browser network tab (API calls)
  - [ ] Test on mobile

### Phase 2: Security (Days 4-5)

- [ ] Set up Cloudflare free account
- [ ] Point mb2restore.com nameservers to Cloudflare
- [ ] Configure DNS records (A, CNAME, MX)
- [ ] Enable DDoS protection
- [ ] Set SSL/TLS mode to "Full"
- [ ] Enable Web Application Firewall (WAF)
- [ ] **Backend Security:**
  - [ ] Create `.env.example` (without secrets)
  - [ ] Add environment variable validation
  - [ ] Enable CORS for specific domains only
  - [ ] Add rate limiting to API
  - [ ] Add HTTPS redirect in backend
- [ ] **Database Security:**
  - [ ] Enable automated backups on Render
  - [ ] Test backup/restore process
  - [ ] Verify backup encryption
  - [ ] Set backup retention (30 days)
- [ ] Set up Sentry for error tracking
  - [ ] Create Sentry account
  - [ ] Add `@sentry/react` to frontend
  - [ ] Add `@sentry/node` to backend
  - [ ] Configure error reporting
  - [ ] Test error capture
- [ ] Review security headers
  - [ ] X-Content-Type-Options: nosniff
  - [ ] X-Frame-Options: DENY
  - [ ] X-XSS-Protection: 1; mode=block
  - [ ] Strict-Transport-Security

### Phase 3: CI/CD Pipeline (Days 6-7)

- [ ] Create GitHub Actions workflow
  - [ ] File: `.github/workflows/deploy.yml`
  - [ ] Trigger on push to main/develop
  - [ ] Run linting: `npm run lint`
  - [ ] Run tests: `npm test`
  - [ ] Build frontend: `npm run build`
  - [ ] Deploy to Netlify (auto via webhook)
  - [ ] Deploy to Render (auto via webhook)
- [ ] Configure staging environment
  - [ ] Create `develop` branch
  - [ ] Deploy develop → staging URLs
  - [ ] Deploy main → production URLs
- [ ] Test full pipeline
  - [ ] Push code change to develop
  - [ ] Verify staging deployment
  - [ ] Create pull request
  - [ ] Merge to main
  - [ ] Verify production deployment
- [ ] Set up branch protection
  - [ ] Require PR reviews on main
  - [ ] Require status checks pass
  - [ ] Dismiss stale PR approvals

---

## Quick Deployment Checklist (Copy/Paste)

```
PHASE 1 - FOUNDATION
=====================
GitHub Setup:
[ ] GitHub account created
[ ] Repository created
[ ] Code pushed to GitHub
[ ] .gitignore configured

Database:
[ ] Render account created
[ ] PostgreSQL database created
[ ] Connection string saved
[ ] Migration script created
[ ] Data migrated from SQLite
[ ] Local connection tested

Frontend:
[ ] Netlify account created
[ ] GitHub connected to Netlify
[ ] Build settings configured
[ ] Environment variables set
[ ] Custom domain requested
[ ] Deployment successful

Backend:
[ ] Render Web Service created
[ ] GitHub connected
[ ] Environment variables set
[ ] Custom domain requested
[ ] Deployment successful
[ ] Database linked

DNS:
[ ] Cloudflare account active
[ ] CNAME records created
[ ] DNS propagated
[ ] Certificates issued

Testing:
[ ] Frontend loads at app.mb2restore.com
[ ] Backend responds at api.mb2restore.com
[ ] Intake form submits successfully
[ ] Data appears in database
[ ] Mobile testing complete

PHASE 2 - SECURITY
===================
Cloudflare:
[ ] Nameservers updated
[ ] DDoS protection enabled
[ ] SSL/TLS mode set to Full
[ ] WAF enabled

Backend Security:
[ ] CORS configured
[ ] Rate limiting added
[ ] HTTPS redirect enabled
[ ] Environment variables secured

Database:
[ ] Automated backups enabled
[ ] Backup tested
[ ] Retention set to 30 days

Error Tracking:
[ ] Sentry account created
[ ] Frontend integration
[ ] Backend integration
[ ] Test error capture

PHASE 3 - CI/CD
===============
GitHub Actions:
[ ] Workflow file created
[ ] Lint step working
[ ] Test step working (if tests exist)
[ ] Build step working
[ ] Deploy step working

Staging:
[ ] Develop branch created
[ ] Staging URLs configured
[ ] PR workflow tested
[ ] Production deployment tested

Branch Protection:
[ ] Main branch protected
[ ] PR reviews required
[ ] Status checks required
```

---

## Critical Configuration Files to Create/Update

### 1. `.github/workflows/deploy.yml`
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          npm install
          cd frontend && npm install && cd ..
      
      - name: Run linter
        run: npm run lint --if-present
      
      - name: Build frontend
        working-directory: ./frontend
        run: npm run build
      
      - name: Deploy to Netlify
        run: npx netlify-cli deploy --prod --dir=frontend/build
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

### 2. Backend: Update `server.js` for PostgreSQL

```javascript
// Change from SQLite to PostgreSQL
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Use pool instead of SQLite database
```

### 3. Frontend: `.env.production`

```
REACT_APP_API_URL=https://api.mb2restore.com
REACT_APP_SENTRY_DSN=<your-sentry-dsn>
```

### 4. Backend: `.env.example`

```
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Environment
NODE_ENV=production
PORT=5000

# Email
SENDGRID_API_KEY=<your-sendgrid-key>

# Error Tracking
SENTRY_DSN=<your-sentry-dsn>

# CORS
CORS_ORIGIN=https://app.mb2restore.com
```

---

## Estimated Timeline & Effort

| Task | Time | Difficulty | Risk |
|------|------|-----------|------|
| GitHub setup | 30 min | Easy | Very Low |
| Database migration | 2-3 hrs | Medium | Medium |
| Netlify deployment | 30 min | Easy | Very Low |
| Render backend | 1 hr | Easy | Low |
| DNS configuration | 30 min | Easy | Low |
| Security setup | 2 hrs | Medium | Medium |
| CI/CD pipeline | 2 hrs | Medium | Low |
| **TOTAL** | **~9 hours** | **Medium** | **Low-Medium** |

**Breakdown:**
- If experienced with DevOps: 6-8 hours
- If learning along the way: 10-14 hours
- First deployment is always slowest; future deployments are automatic

---

## Support Resources

### For Each Tool
- **GitHub:** github.com/docs
- **Netlify:** docs.netlify.com
- **Render:** render.com/docs
- **Cloudflare:** developers.cloudflare.com/docs
- **Sentry:** docs.sentry.io
- **PostgreSQL:** postgresql.org/docs

### Community Help
- **Stack Overflow:** Tag questions with `netlify`, `render`, `nodejs`
- **GitHub Discussions:** mb2restore-app repo issues
- **Reddit:** r/webdev, r/nodejs, r/devops

### Troubleshooting Checklist
If something breaks:
1. [ ] Check service status pages (Render, Netlify, Cloudflare)
2. [ ] Review application logs (Render, Netlify, Sentry)
3. [ ] Check environment variables
4. [ ] Verify DNS propagation (dns.google.com)
5. [ ] Test locally first
6. [ ] Check GitHub Actions logs
7. [ ] Review recent deployments
8. [ ] Check database connectivity

---

## Success Criteria

✅ You've succeeded when:
- [ ] App accessible at `app.mb2restore.com`
- [ ] API running at `api.mb2restore.com`
- [ ] HTTPS working (green padlock in browser)
- [ ] Form submission creates records in database
- [ ] Team can access without VPN/localhost
- [ ] Sentry captures errors
- [ ] Automated deployments work
- [ ] Code changes deploy automatically within 2 minutes

---

## Post-Deployment Monitoring (First Week)

- [ ] Monitor Sentry for any errors
- [ ] Check Netlify build logs daily
- [ ] Verify database performance
- [ ] Monitor API response times
- [ ] Check for any security alerts
- [ ] Get team feedback
- [ ] Document any issues

---

## What to Do If Something Goes Wrong

### Frontend Not Loading
1. Check Netlify build logs
2. Verify environment variables
3. Check browser console for errors
4. Verify API URL is correct

### Backend Returning 500 Errors
1. Check Render logs
2. Verify database connection
3. Check environment variables
4. Review Sentry error tracking

### Database Connection Issues
1. Verify connection string
2. Check Render PostgreSQL is running
3. Verify SSL configuration
4. Test local connection first

### DNS Not Working
1. Verify CNAME records in Cloudflare
2. Use `nslookup` to check DNS propagation
3. Clear browser cache
4. Wait up to 24 hours for full propagation

---

## Next: Deploy Your App

You're ready to execute Phase 1. Want to start with GitHub setup?

