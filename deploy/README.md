# ERP Deployment Scripts

Production deployment files for the ERP system on SRV-AT&A (10.12.1.47).

See `DEPLOYMENT_PLAN.md` in the project root for the full deployment guide.

## Files

| File | Where to Use | Purpose |
|------|-------------|---------|
| `build-release.bat` | Dev machine | Build and copy release to server |
| `switch-release.bat` | Server | Activate a new release (with pre-flight and verification) |
| `rollback.bat` | Server | Roll back to previous release (< 30 seconds) |
| `ecosystem.config.js` | Server (`C:\apps\erp\`) | PM2 process configuration |
| `backup.bat` | Server (`C:\erp-backups\`) | Nightly database backup (Task Scheduler) |
| `restore-test.bat` | Server (`C:\erp-backups\`) | Weekly backup restore validation (Task Scheduler) |
| `web.config` | Server (IIS site root) | IIS reverse proxy rewrite rules |
| `.env.backend.template` | Reference | Backend environment template (copy to server, fill in real values) |
| `.env.frontend.template` | Reference | Frontend environment template (copy to server, fill in real values) |

## Quick Reference

```batch
:: BUILD (on dev machine, from project root)
deploy\build-release.bat

:: DEPLOY (on server)
deploy\switch-release.bat 2026-03-27_001

:: ROLLBACK (on server)
deploy\rollback.bat

:: STATUS (on server)
pm2 status

:: LOGS (on server)
pm2 logs erp-backend
pm2 logs erp-frontend
```

## Server Paths

| Path | Purpose |
|------|---------|
| `C:\apps\erp\current\` | Active release |
| `C:\apps\erp\previous\` | Rollback target |
| `C:\apps\erp\shared\` | Env files, uploads (persists across releases) |
| `C:\apps\erp\logs\` | PM2 logs |
| `C:\erp-backups\` | Database backups |

## Important

- **Never** run `npm install`, `npm run build`, or `git pull` on the production server
- **Always** build on the dev machine and copy the release
- **Always** take a database backup before running migrations
- Environment templates contain placeholders — never commit real passwords
