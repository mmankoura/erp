# ERP Production Deployment Plan

> **Created**: March 13, 2026
> **Last Reviewed**: April 1, 2026
> **Review Status**: Deployment in progress — Phases 1-6 complete
> **Target Server**: SRV-AT&A (10.12.1.47)
> **ERP URL**: `http://erp.atacanada.ca`
> **DNS Zone**: `atacanada.ca` (A record: `erp` → `10.12.1.47`)
> **Status**: ERP running and accessible from LAN. Backup configuration (Phase 7) remaining.

### Sign-Off Conditions (Before Final Go-Live)

#### Document Quality (complete)
- [x] Release-based deployment model defined
- [x] Localhost binding and IIS hardening specified
- [x] Backup validation mandatory
- [x] Boot persistence defined — NSSM direct services (revised from PM2, see Section 6)
- [x] Credential handling improved (pgpass.conf)
- [x] Migration rollback policy defined (Section 7.5)
- [x] Snapshot language corrected — snapshots are pre-change protection, not backup (Section 9)
- [x] Monitoring checks written as operational procedure (Section 14)

#### Execution / Validation
- [x] Deploy script dry-run tested on dev machine (Section 7.4) — build steps pass
- [x] First release deployed and migrations run successfully (46 migrations) — April 1, 2026
- [x] Outstanding environment questions answered (Section 10) — resolved March 17, 2026
- [x] NSSM GO/NO-GO gate passed (Section 6) — crash recovery, full reboot, headless boot all passed
- [x] IIS reverse proxy configured and tested — `http://erp.atacanada.ca` accessible from LAN
- [ ] Backup path confirmed and Tier 2 cross-VM copy tested (`\\FactoryLogix\erp-backups\`)
- [ ] Backup restore test passed

---

## Table of Contents

1. [Infrastructure Assessment](#1-infrastructure-assessment)
2. [Requirements Gathering (Q&A)](#2-requirements-gathering-qa)
3. [Recommended Architecture](#3-recommended-architecture)
4. [Server Protection Policy](#4-server-protection-policy)
5. [IIS Reverse Proxy — Hardening](#5-iis-reverse-proxy--hardening)
6. [Process Management — PM2 on Windows](#6-process-management--pm2-on-windows)
7. [Release-Based Deployment Model](#7-release-based-deployment-model)
8. [Database — PostgreSQL Hardening](#8-database--postgresql-hardening)
9. [Backup & Recovery](#9-backup--recovery)
10. [Outstanding Questions](#10-outstanding-questions-before-implementation)
11. [Step-by-Step Deployment Guide](#11-step-by-step-deployment-guide)
12. [Production Environment Files](#12-production-environment-files)
13. [Quick Reference Card](#13-quick-reference-card)
14. [Operational Monitoring Procedure](#14-operational-monitoring-procedure)
15. [Post-Launch Hardening Roadmap](#15-post-launch-hardening-roadmap)

---

## 1. Infrastructure Assessment

### Physical Server

| Spec | Detail |
|------|--------|
| **Model** | Dell PowerEdge R730 2U (purchased May 2020) |
| **CPU** | 2x Intel Xeon E5-2620 V3 6-Core @ 2.40GHz (12 cores total) |
| **RAM** | 128GB DDR4 ECC (16x 8GB) |
| **Storage** | 10x 900GB 10K SAS (PERC H330 RAID controller) |
| **Rack** | StarTech 42U Server Rack Cabinet |
| **Switch** | Cisco SG110-24HP 24-port PoE unmanaged |
| **PDU** | APC Basic Rack-Mount PDU |
| **Hypervisor** | VMware ESXi |

### VM 1 — SRV-AT&A (Main Server) — ERP DEPLOYMENT TARGET

| Spec | Detail |
|------|--------|
| **OS** | Windows Server 2016 or later (64-bit) — likely 2019 Standard |
| **vCPUs** | 8 |
| **RAM** | 32 GB |
| **Storage** | 2.13 TB total, ~900 GB free |
| **Current Roles** | Shared drives, DNS server |
| **New Role** | ERP application host |
| **Network** | IP 10.12.1.47, Subnet 255.255.255.0, Gateway 10.12.1.1 |

### VM 2 — FactoryLogix (MES Server)

| Spec | Detail |
|------|--------|
| **OS** | Windows Server 2016 or later (64-bit) |
| **vCPUs** | 8 |
| **RAM** | 16 GB |
| **Storage** | 1.09 TB |
| **Current Roles** | FactoryLogix MES software, MySQL database |

### Network Topology

```
Factory LAN: 10.12.1.0/24
Gateway:     10.12.1.1
DNS Server:  10.12.1.47  (same machine as SRV-AT&A)

SRV-AT&A:       10.12.1.47  (Main server — shared drives + DNS + ERP)
FactoryLogix:   (separate VM, same physical host)

PCs connect via static IP addresses.
Cisco SG110-24HP PoE switch for factory floor devices.
```

---

## 2. Requirements Gathering (Q&A)

### Server & VM Infrastructure

**Q1. What OS are the 2 VMs running?**
> Windows Server 2019/2022

**Q2. What are the specs on each VM? Which VM would host the ERP?**
> See VM specs above. ERP will deploy on SRV-AT&A (main VM).

**Q3. Is Docker already installed on either VM?**
> No. Prefer native installation.

**Q4. Are the VMs on the same physical server? What hypervisor?**
> Yes, same physical server. VMware ESXi.

**Q5. Deploy on existing VM or create a third?**
> Deploy on the existing main VM (SRV-AT&A).

**Q6. How much disk space can you allocate?**
> 900 GB free. More than sufficient — ERP + PostgreSQL will use < 10 GB for years.

### Networking & Access

**Q7. How will factory users access the ERP?**
> Shared workstations on the factory floor.

**Q8. LAN-only, or remote/VPN access?**
> LAN and WiFi primarily. 1-2 users need remote/VPN access.

**Q9. DNS server available?**
> DNS server exists on the LAN at 10.12.1.47 (the server itself). PCs currently connect via IP address.

**Q10. What ports are available? Firewall rules?**
> Not sure. Will need to verify during deployment.

**Q11. Do you need HTTPS?**
> Only for 1-2 VPN users. LAN users can use HTTP.

**Q12. Is there a reverse proxy already running?**
> Not that I am aware of.

### Database

**Q13. PostgreSQL in Docker or native?**
> Native installation preferred.

**Q14. Backup strategy?**
> No backup system exists currently. Need to develop one.

**Q15. How much data expected?**
> Small contract manufacturer. Volume will be low — hundreds of materials, tens of orders per month.

### MES & Existing Software

**Q16. What MES software? Future integration plans?**
> FactoryLogix. Eventually want integration, but not in scope for this launch.

**Q17. MES database? Port conflicts?**
> FactoryLogix uses MySQL. No conflict with PostgreSQL on port 5432.

**Q18. Shared drives on the same VM?**
> Yes, shared drives are on SRV-AT&A (same VM as ERP).

### Operations & Maintenance

**Q19. Who will be the system administrator?**
> Me (the developer/owner). No dedicated IT person.

**Q20. How to handle updates?**
> Need recommendation. Minimal downtime is key.

**Q21. Automatic restarts on crash?**
> Need recommendation based on best practices.

**Q22. Logging/monitoring needed?**
> Yes, if possible.

**Q23. Uptime expectations?**
> 5 minutes of downtime during updates is acceptable.

### Authentication & Users

**Q24. How many concurrent users?**
> 5-10 users.

**Q25. Session secret management?**
> No existing approach. Will generate a secure random key for production.

**Q26. Active Directory / LDAP?**
> Not for this launch. Built-in 4-role system is sufficient. AD is a future goal.

### Data Migration

**Q27. Existing data to migrate?**
> No. Everything will be manually entered from scratch.

**Q28. Seed with test data or start clean?**
> Start clean.

### Dymo / Label Printing

**Q29. Dymo printers connected?**
> Not currently set up. Phase 6 — future work.

---

## 3. Recommended Architecture

### Architecture Diagram

```
Factory LAN (10.12.1.0/24)
         │
         │  :80 (HTTP)  /  :443 (HTTPS — post-launch hardening)
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  SRV-AT&A  (10.12.1.47)  —  Windows Server 2019                │
│  ⚠ PROTECTED PRODUCTION HOST — no ad-hoc changes               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  IIS (Reverse Proxy — only externally exposed service)     │  │
│  │    http://erp.atacanada.ca  (or http://10.12.1.47)         │  │
│  │      /        → localhost:3000  (Next.js frontend)         │  │
│  │      /api/*   → localhost:3002  (NestJS backend)           │  │
│  │                                                            │  │
│  │    Hardened: request limits, timeouts, no direct app ports │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  PM2 (Process Manager — runs as Windows Service)           │  │
│  │    erp-backend    NestJS   localhost:3002  (not LAN)       │  │
│  │    erp-frontend   Next.js  localhost:3000  (not LAN)       │  │
│  │                                                            │  │
│  │    Boot persistence: GO/NO-GO checkpoint before go-live    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL 16  (Windows Service)  localhost:5432 only     │  │
│  │    Database: erp_production                                │  │
│  │    User: erp_app (limited privileges, not superuser)       │  │
│  │    Listening: localhost only — no remote connections        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Release-Based Deployment                                  │  │
│  │    C:\apps\erp\releases\2026-03-16_001\                    │  │
│  │    C:\apps\erp\current\  → points to active release        │  │
│  │    C:\apps\erp\previous\ → last known good (rollback)      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Backup (Windows Task Scheduler)                           │  │
│  │    Nightly: pg_dump → local + cross-VM copy                │  │
│  │    Weekly: restore test to erp_backup_test database         │  │
│  │    Monthly: manual off-host copy (USB / cloud)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Existing: Shared Drives (file server), DNS                      │
└──────────────────────────────────────────────────────────────────┘
```

### Why This Stack

| Component | Choice | Reasoning |
|-----------|--------|-----------|
| **Reverse Proxy** | IIS | Native to Windows Server. Handles HTTPS via Windows certificate store. No extra software to install. Only externally exposed service — Node apps bind to localhost only. |
| **Process Manager** | PM2 | Pragmatic choice for Windows (see caveats in Section 6). Auto-restarts, log rotation, Windows service integration. Not ideal but acceptable for this scale. |
| **Database** | PostgreSQL 16 native | Runs as Windows service. No Docker dependency. Localhost-only listening. |
| **Deployment** | Release-based | Build artifacts off-server, deploy versioned releases with instant rollback capability. No builds on production. |
| **No Docker** | By choice | Not installed, not needed. Native install is simpler for a single-admin setup. |

### Resource Impact on SRV-AT&A

| Component | RAM Usage | CPU Usage | Disk Usage |
|-----------|-----------|-----------|------------|
| PostgreSQL 16 | ~500 MB | Minimal | < 1 GB (grows slowly) |
| NestJS Backend | ~200 MB | Minimal | ~100 MB per release |
| Next.js Frontend | ~300 MB | Minimal | ~500 MB per release |
| IIS | ~100 MB | Minimal | Negligible |
| **Total** | **~1.1 GB** | **< 5% of 8 vCPUs** | **~2 GB per release** |

With 32 GB RAM and 8 vCPUs, the ERP will use ~3% of available resources. Builds happen off-server, so no CPU/RAM spikes from compilation on the production host.

---

## 4. Server Protection Policy

SRV-AT&A is now a **multi-role business-critical server** hosting shared drives, DNS, and ERP. This increases the risk of change collisions, resource contention, and longer recovery impact if the VM has trouble.

### Rules

1. **No ad-hoc changes on the server.** All ERP updates go through the release-based deployment process (Section 7). No `npm install`, `git pull`, or `npm run build` directly on this machine.
2. **No builds on production.** Build artifacts are created on the dev machine and copied to the server as complete, tested releases.
3. **Test before deploy.** Every release must pass `npm run build` and `npx tsc --noEmit` on the dev machine before being packaged.
4. **Keep a rollback.** The previous release is always preserved on disk. Rollback = rename two folders + `net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend` (< 30 seconds).
5. **Scheduled maintenance window.** ERP updates happen during off-hours or a communicated window — never during active production shifts.
6. **No unrelated software installs.** Do not install dev tools, experiment with other services, or make Windows configuration changes on this server without planning and a VMware snapshot first.
7. **Snapshot before risky changes.** Take a VMware snapshot before any server-level change (Windows updates, IIS changes, PostgreSQL upgrades). Delete the snapshot after confirming stability (see Section 9).

---

## 5. IIS Reverse Proxy — Hardening

IIS is the **only service exposed to the LAN**. Node.js processes and PostgreSQL must never be directly reachable from the network.

### Hard Requirements

| Requirement | Configuration |
|-------------|---------------|
| **Node apps bind to localhost only** | Backend: `HOST=127.0.0.1` in env. Frontend: `next start -H 127.0.0.1`. No LAN device can reach ports 3000 or 3002 directly. |
| **PostgreSQL listens on localhost only** | `listen_addresses = 'localhost'` in `postgresql.conf`. Port 5432 not exposed to LAN. |
| **Windows Firewall** | Allow inbound port 80 (and 443 if HTTPS). Block inbound 3000, 3002, 5432. |
| **Request size limits** | IIS `maxAllowedContentLength`: 50 MB (covers file uploads for BOM import, attachments). |
| **Request timeout** | IIS proxy timeout: 120 seconds. Prevents hung requests from tying up connections. |
| **Forwarding headers** | IIS must pass `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` to backend so NestJS knows the real client IP and protocol. |
| **Logging** | IIS access logs enabled, stored in `C:\inetpub\logs\LogFiles\`. Retain 90 days. |

### IIS URL Rewrite Rules

```xml
<!-- web.config for the IIS site -->
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- API requests → NestJS backend on localhost:3002 -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3002/api/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
            <set name="HTTP_X_FORWARDED_PROTO" value="{REQUEST_SCHEME}" />
            <set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" />
          </serverVariables>
        </rule>
        <!-- Everything else → Next.js frontend on localhost:3000 -->
        <rule name="Frontend Proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3000/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
            <set name="HTTP_X_FORWARDED_PROTO" value="{REQUEST_SCHEME}" />
            <set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <!-- 50 MB max upload size -->
        <requestLimits maxAllowedContentLength="52428800" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

---

## 6. Process Management — NSSM Direct Services

### Architecture Decision (Revised March 31, 2026)

The original plan used PM2 with `pm2-windows-service` for boot persistence. During deployment, three approaches were tested and failed:

1. **`pm2-windows-service`** — deprecated, service did not register properly on Windows Server 2019 / Node 22
2. **NSSM + PM2** — NSSM successfully launched Node processes at boot, but PM2's daemon architecture created identity mismatches between the SYSTEM service context and the Administrator user context. Processes ran but `pm2 status` could not see them.
3. **Task Scheduler `AtStartup`** — task registered and worked when manually triggered, but the `AtStartup` trigger never fired on boot (root cause undetermined)

**Revised approach: NSSM runs Node.js directly as Windows services, bypassing PM2 entirely for boot persistence.**

| Concern | How It's Handled |
|---------|-----------------|
| **Boot persistence** | NSSM registers native Windows services — starts automatically, no login required |
| **Crash restart** | NSSM + Windows service recovery options (Restart the Service on all failures) |
| **Log management** | NSSM redirects stdout/stderr to log files in `C:\apps\erp\logs\` |
| **Identity** | Services run as `LocalSystem` — no PM2 daemon, no profile mismatch |

**PM2 remains installed** for optional manual use (ad-hoc process management, live log tailing with `pm2 logs`) but is **not in the startup path**.

### NSSM Service Configuration

**Download:** NSSM 2.24-101 pre-release from nssm.cc (required for Windows Server 2016+). Place `nssm.exe` at `C:\erp-deploy\nssm.exe`.

**Backend service (`erp-backend`):**
```
nssm install erp-backend "C:\Program Files\nodejs\node.exe"
nssm set erp-backend AppParameters "--max-old-space-size=512 C:\apps\erp\current\backend\dist\main.js"
nssm set erp-backend AppDirectory "C:\apps\erp\current\backend"
nssm set erp-backend AppEnvironmentExtra NODE_ENV=production PORT=3002 HOST=127.0.0.1
nssm set erp-backend AppStdout "C:\apps\erp\logs\backend-out.log"
nssm set erp-backend AppStderr "C:\apps\erp\logs\backend-error.log"
nssm set erp-backend AppStdoutCreationDisposition 4
nssm set erp-backend AppStderrCreationDisposition 4
nssm set erp-backend AppRotateFiles 1
nssm set erp-backend AppRotateBytes 10485760
nssm set erp-backend Start SERVICE_AUTO_START
```

**Frontend service (`erp-frontend`):**
```
nssm install erp-frontend "C:\Program Files\nodejs\node.exe"
nssm set erp-frontend AppParameters "C:\apps\erp\current\frontend\node_modules\next\dist\bin\next start -p 3000 -H 127.0.0.1"
nssm set erp-frontend AppDirectory "C:\apps\erp\current\frontend"
nssm set erp-frontend AppEnvironmentExtra NODE_ENV=production PORT=3000
nssm set erp-frontend AppStdout "C:\apps\erp\logs\frontend-out.log"
nssm set erp-frontend AppStderr "C:\apps\erp\logs\frontend-error.log"
nssm set erp-frontend AppStdoutCreationDisposition 4
nssm set erp-frontend AppStderrCreationDisposition 4
nssm set erp-frontend AppRotateFiles 1
nssm set erp-frontend AppRotateBytes 10485760
nssm set erp-frontend Start SERVICE_AUTO_START
```

### GO/NO-GO Checkpoint (Mandatory Before Go-Live)

This is **not a checklist item** — it is a **gate**. Do not proceed to go-live until all pass:

| Test | How | Pass Criteria |
|------|-----|---------------|
| **Crash recovery** | `taskkill /F /PID <backend_pid>`, wait 10s | Service restarts automatically, `curl http://127.0.0.1:3002/api/health` returns OK |
| **Full server reboot** | Reboot SRV-AT&A from Windows | After 3 minutes, `sc query erp-backend` and `sc query erp-frontend` both show RUNNING |
| **Service recovery** | Stop `erp-backend` in `services.msc`, wait 30s | Windows service restarts (verify recovery options are set to "Restart the Service") |
| **Headless boot** | Reboot server, do NOT log in via RDP, wait 5 minutes, try accessing ERP from a workstation | `curl http://10.12.1.47:3002/api/health` returns OK from dev machine |

**All 4 must pass.**

### Log Retention Policy

| Log | Location | Rotation | Retention |
|-----|----------|----------|-----------|
| Backend stdout | `C:\apps\erp\logs\backend-out.log` | NSSM file rotation, 10 MB max | 30 days |
| Backend errors | `C:\apps\erp\logs\backend-error.log` | NSSM file rotation, 10 MB max | 90 days |
| Frontend stdout | `C:\apps\erp\logs\frontend-out.log` | NSSM file rotation, 10 MB max | 30 days |
| Frontend errors | `C:\apps\erp\logs\frontend-error.log` | NSSM file rotation, 10 MB max | 90 days |
| IIS access logs | `C:\inetpub\logs\LogFiles\` | Daily rotation (IIS default) | 90 days |

---

## 7. Release-Based Deployment Model

### 7.1 Why Not Build on the Server

The previous plan called for `git pull` + `npm install` + `npm run build` directly on SRV-AT&A. This creates four problems:

1. **Builds can fail after source has already changed** — leaves server in a broken half-updated state
2. **Package resolution can drift** — `npm install` may resolve differently than on your dev machine
3. **Server becomes both build machine and runtime host** — CPU spikes during build affect shared drives and DNS
4. **Rollback is messy** — no clean way to revert to the previous working version

### 7.2 Release Workflow

```
DEV MACHINE (your laptop/WSL2)          SRV-AT&A (production)
─────────────────────────────          ───────────────────────

1. git pull / make changes
2. npm ci (backend + frontend)
3. npm run build (both)
4. npx tsc --noEmit (type check)
5. Package release folder
         │
         │  copy via shared drive
         │  or robocopy / xcopy
         ▼
                                       6. Pre-flight checks (Section 7.6)
                                       7. Copy to C:\apps\erp\releases\YYYY-MM-DD_NNN\
                                       8. Switch release (Section 7.6)
                                       9. Post-switch verification (Section 7.6)
                                          (downtime: ~10 seconds)
```

### 7.3 Folder Structure on Server

```
C:\apps\erp\
├── current\                   ← PM2 points here (active release)
│   ├── backend\
│   │   ├── dist\              ← compiled NestJS
│   │   ├── node_modules\      ← full dependencies (~21 MB)
│   │   ├── package.json       ← needed at runtime
│   │   └── .env.production    ← copied from shared\ during deploy
│   └── frontend\
│       ├── .next\             ← compiled Next.js
│       ├── node_modules\      ← full dependencies (~517 MB)
│       ├── public\            ← static assets
│       ├── package.json       ← needed at runtime
│       └── .env.production    ← copied from shared\ during deploy
│
├── previous\                  ← last known good (for rollback)
│   ├── backend\
│   └── frontend\
│
├── releases\                  ← release archive (clean up old releases monthly)
│   ├── 2026-03-15_001\
│   ├── 2026-03-20_001\
│   └── ...
│
├── shared\                    ← persistent across ALL releases — never deleted
│   ├── .env.backend           ← backend env (copied to current\backend\.env on deploy)
│   ├── .env.frontend          ← frontend env (copied to current\frontend\.env on deploy)
│   ├── web.config             ← IIS rewrite rules (copied to current\frontend\ on deploy)
│   └── uploads\               ← file attachments (if stored on disk)
│
├── logs\                      ← PM2 log files (persistent, not per-release)
│
└── ecosystem.config.js        ← PM2 process config (persistent, not per-release)
```

**Important:** The `shared\` directory, `logs\` directory, and `ecosystem.config.js` are **never part of a release**. They persist across all deployments. The `uploads\` directory in particular must never be deleted or replaced during a release switch — it contains user-uploaded file attachments.

### 7.4 Deploy Script (Dry-Run Tested March 27, 2026)

> **Dry-run results (dev machine, WSL2/Windows):**
> - `npm ci` (backend): PASS — 816 packages, 22s
> - `npm ci` (frontend): PASS — 483 packages, 3m
> - `npx tsc --noEmit`: PASS — no type errors
> - `npm run build` (backend): PASS — `dist/main.js` created
> - `npm run build` (frontend): PASS — 25 pages, Next.js 16.1.4, compiled in 4.4s
>
> **Design decision:** The script ships full `node_modules` (including dev deps) rather than stripping with `npm ci --omit=dev`. Reason: bcrypt's native `.node` binary gets locked by the build process on Windows, causing `npm ci --omit=dev` to fail with EPERM. Full `node_modules` is ~21 MB (backend) + ~517 MB (frontend) = ~538 MB total. With 900 GB free on the server, this is negligible. Eliminating the `--omit=dev` step removes a fragile failure point.
>
> **Remaining known issues to validate on first real deploy:**
> - The `%date%` parsing (`%date:~-4%` etc.) is **locale-sensitive on Windows**. If your regional date format is not `MM/DD/YYYY`, the date extraction will produce wrong values. Test by running `echo %date%` on both machines and adjusting the offsets if needed.
> - Next.js may need additional runtime files beyond `.next/`, `node_modules/`, `public/`, and `package.json` depending on project config. Verify by testing the release on the server before go-live.
> - The script assumes it is launched from the **project root** (the directory containing `erp/backend/` and `erp/frontend/`). It uses `%~dp0` to resolve this automatically.
> - Robocopy to the server share has not been tested yet (requires `\\erp.atacanada.ca\erp-deploy` to exist on SRV-AT&A).

```batch
@echo off
setlocal

:: ============================================================
:: ERP Release Build Script (run from project root on dev machine)
:: Dry-run tested: March 27, 2026
:: ============================================================

:: Configuration — adjust these for your environment
set SERVER_SHARE=\\erp.atacanada.ca\erp-deploy
set PROJECT_ROOT=%~dp0
set BACKEND_DIR=%PROJECT_ROOT%erp\backend
set FRONTEND_DIR=%PROJECT_ROOT%erp\frontend

:: Generate release name — VALIDATE THIS FOR YOUR LOCALE
:: Run "echo %date%" to check format. Adjust offsets if not MM/DD/YYYY.
set RELEASE_NAME=%date:~-4%-%date:~4,2%-%date:~7,2%_001

echo === ERP Release Build: %RELEASE_NAME% ===
echo Project root: %PROJECT_ROOT%
echo.

:: Step 1: Clean install with lockfile (deterministic)
echo [1/5] Installing backend dependencies...
cd /d "%BACKEND_DIR%"
call npm ci
if %ERRORLEVEL% NEQ 0 (echo FAILED: backend npm ci & exit /b 1)

echo [2/5] Installing frontend dependencies...
cd /d "%FRONTEND_DIR%"
call npm ci
if %ERRORLEVEL% NEQ 0 (echo FAILED: frontend npm ci & exit /b 1)

:: Step 2: Type check
echo [3/5] Type checking backend...
cd /d "%BACKEND_DIR%"
call npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (echo FAILED: type check & exit /b 1)

:: Step 3: Build
echo [4/5] Building backend...
call npm run build
if %ERRORLEVEL% NEQ 0 (echo FAILED: backend build & exit /b 1)

echo [5/5] Building frontend...
cd /d "%FRONTEND_DIR%"
call npm run build
if %ERRORLEVEL% NEQ 0 (echo FAILED: frontend build & exit /b 1)

:: Note: We ship full node_modules (dev deps included) because
:: npm ci --omit=dev fails on Windows when bcrypt native binary
:: is locked by the build process. Size impact is negligible (~538 MB
:: total vs 900 GB free on server).

:: Step 4: Copy to server
echo Copying to server...
set RELEASE_DIR=%SERVER_SHARE%\releases\%RELEASE_NAME%

echo   Copying backend...
robocopy "%BACKEND_DIR%\dist" "%RELEASE_DIR%\backend\dist" /E /NP /NFL /NDL
robocopy "%BACKEND_DIR%\node_modules" "%RELEASE_DIR%\backend\node_modules" /E /NP /NFL /NDL
copy "%BACKEND_DIR%\package.json" "%RELEASE_DIR%\backend\" >nul

echo   Copying frontend...
robocopy "%FRONTEND_DIR%\.next" "%RELEASE_DIR%\frontend\.next" /E /NP /NFL /NDL
robocopy "%FRONTEND_DIR%\node_modules" "%RELEASE_DIR%\frontend\node_modules" /E /NP /NFL /NDL
robocopy "%FRONTEND_DIR%\public" "%RELEASE_DIR%\frontend\public" /E /NP /NFL /NDL
copy "%FRONTEND_DIR%\package.json" "%RELEASE_DIR%\frontend\" >nul

echo.
echo === Release %RELEASE_NAME% built and copied to server ===
echo.
echo Next: RDP into server and run the switch procedure (Section 7.6)
echo.
endlocal
```

### 7.5 Migration Rollback Policy

Database migrations and code releases are **coupled**. A migration changes the schema; rolling back code without also rolling back the schema can break the application. This section defines the explicit policy.

#### The Rule

> **All migrations must be backward-compatible with the previous release for at least one release cycle.**

This means:
- **Adding** a new column → OK (old code ignores it)
- **Adding** a new table → OK (old code ignores it)
- **Renaming** a column → NOT OK without a transition period
- **Dropping** a column → NOT OK unless old code already stopped using it in a prior release
- **Changing** a column type → NOT OK without a transition period
- **Dropping** a table → NOT OK unless old code already stopped using it

#### Deployment Order When Migrations Are Involved

```
1. Take a database backup BEFORE the migration
   > C:\erp-backups\backup.bat

2. Run the migration (as postgres superuser)
   > cd C:\apps\erp\releases\YYYY-MM-DD_NNN\backend
   > npx typeorm migration:run -d dist/data-source.js

3. If migration fails → stop. Do not switch releases. Fix the migration on dev machine.

4. If migration succeeds → proceed with release switch (Section 7.6)

5. If the new release has problems AFTER migration:
   a. If the migration was backward-compatible → code rollback is safe
      > Follow normal rollback procedure (Section 7.7)
   b. If the migration was NOT backward-compatible → full database restore required
      > net stop erp-backend && net stop erp-frontend
      > pg_restore -U postgres -d erp_production --clean --if-exists <pre-migration-backup.dump>
      > Follow normal rollback procedure (Section 7.7)
      > net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend
```

#### Granting Permissions After Migration

After running a migration that creates new tables, grant permissions to `erp_app`:

```sql
-- Run as postgres superuser after migration
\c erp_production
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
```

### 7.6 Deployment Safety Checks

#### Pre-Flight (before switching releases)

Run these checks on the server before making any changes:

```batch
:: 1. Verify new release exists and has expected contents
dir C:\apps\erp\releases\YYYY-MM-DD_NNN\backend\dist\main.js
dir C:\apps\erp\releases\YYYY-MM-DD_NNN\frontend\.next\BUILD_ID

:: 2. Verify shared env files exist
dir C:\apps\erp\shared\.env.backend
dir C:\apps\erp\shared\.env.frontend

:: 3. Verify PM2 is currently running
pm2 status

:: 4. If migration needed: take backup first (Section 7.5)
:: 5. If migration needed: run migration first (Section 7.5)
```

#### Release Switch Procedure

> **For the revised, battle-tested upgrade procedure (including lessons learned from REV-002), see `UPGRADE_PROCEDURE.md`.** The steps below are the original reference; the upgrade procedure supersedes them for day-to-day deployments.

```batch
cd /d C:\apps\erp

:: Step 1: Clear any stale previous-backup (from a prior failed deploy)
if exist previous-backup (
    rmdir /s /q previous-backup
)

:: Step 2: Preserve current as rollback target
if exist previous (
    rename previous previous-backup
)
rename current previous

:: Step 3: Activate new release
rename releases\YYYY-MM-DD_NNN current

:: Step 4: Copy env files (these are NOT in the release)
copy shared\.env.backend current\backend\.env.production
copy shared\.env.frontend current\frontend\.env.production

:: Step 5: Restart
net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend

:: Step 6: Clean up old backup
if exist previous-backup (
    rmdir /s /q previous-backup
)
```

#### Post-Switch Verification

Run these checks **immediately** after `net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend`:

| Check | How | Expected Result |
|-------|-----|-----------------|
| **PM2 status** | `pm2 status` | Both processes show "online", uptime incrementing |
| **Backend health** | `curl http://127.0.0.1:3002/api/health` (or open in browser on server) | Returns `{"status":"ok"}` |
| **Frontend loads** | Open `http://erp.atacanada.ca` from a workstation browser | Login page renders |
| **Login works** | Log in with a test account | Dashboard loads with data |
| **Env files present** | `dir C:\apps\erp\current\backend\.env.production` | File exists, non-empty |

**If any check fails:** Immediately rollback (Section 7.7).

### 7.7 Rollback Procedure (< 30 seconds)

If a new release has problems:

```batch
cd /d C:\apps\erp
rename current broken-release
rename previous current
net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend
:: ERP is back on the last known good version

:: After investigation, clean up:
:: rmdir /s /q broken-release
```

**If the release included a non-backward-compatible migration**, a code rollback alone is not sufficient. You must also restore the database from the pre-migration backup taken in Section 7.5.

### 7.8 Key Rule: `npm ci` not `npm install`

- **`npm ci`** installs exactly what's in `package-lock.json` — deterministic, reproducible
- **`npm install`** may resolve different versions — non-deterministic, can drift
- Both `package-lock.json` files (backend + frontend) **must be committed to git**

---

## 8. Database — PostgreSQL Hardening

### Installation Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| **Listen address** | `localhost` only | No remote connections. App is on the same machine. Set `listen_addresses = 'localhost'` in `postgresql.conf`. |
| **Port** | `5432` (default) | No conflict — MES uses MySQL. |
| **Encoding** | `UTF8` | Standard for international text (French/English in Quebec). |
| **Locale/Collation** | `en_US.UTF-8` or `C` | `C` for fastest sorting, `en_US.UTF-8` for natural sort order. Choose during `initdb`. |
| **Superuser** | `postgres` | Used only for admin tasks (backup, restore, migrations). Never by the application. |
| **App user** | `erp_app` | Limited privileges: `CONNECT`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `erp_production` database only. No `CREATE`, no `DROP`, no superuser. |

### pg_hba.conf (Connection Security)

```
# TYPE  DATABASE        USER            ADDRESS         METHOD
local   all             postgres                        scram-sha-256
local   all             erp_app                         scram-sha-256
host    erp_production  erp_app         127.0.0.1/32    scram-sha-256
host    erp_production  erp_app         ::1/128         scram-sha-256

# Allow postgres superuser for local admin/migration tasks
host    all             postgres        127.0.0.1/32    scram-sha-256
host    all             postgres        ::1/128         scram-sha-256

# Deny everything else
host    all             all             0.0.0.0/0       reject
```

### postgresql.conf Key Settings

```ini
# Connection
listen_addresses = 'localhost'
port = 5432
max_connections = 30          # 5-10 users + backend pool + admin headroom

# Memory (conservative for shared VM)
shared_buffers = 512MB        # ~1.5% of 32GB RAM, safe for shared host
work_mem = 16MB               # Per-sort memory
maintenance_work_mem = 128MB  # For VACUUM, CREATE INDEX

# WAL (Write-Ahead Log)
wal_level = replica            # Enables point-in-time recovery if needed later
max_wal_size = 1GB
min_wal_size = 80MB

# Autovacuum (must stay enabled)
autovacuum = on
autovacuum_naptime = 60        # Check every 60 seconds
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50

# Logging
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000   # Log queries taking > 1 second
log_line_prefix = '%t [%p] %u@%d '
```

### Maintenance Expectations

| Task | Frequency | How |
|------|-----------|-----|
| **Autovacuum** | Automatic | PostgreSQL handles this. Verify it's running: `SELECT * FROM pg_stat_user_tables WHERE last_autovacuum IS NOT NULL;` |
| **ANALYZE** | Automatic | Part of autovacuum. Updates query planner statistics. |
| **Disk usage check** | Monthly | Check `C:\Program Files\PostgreSQL\16\data\` size. At small-CM volume, growth will be < 100 MB/year. |
| **WAL file growth** | Monthly | Check `C:\Program Files\PostgreSQL\16\data\pg_wal\` size. Should stay under `max_wal_size` (1 GB). |
| **Log cleanup** | Automatic | Logs rotate daily, old ones can be deleted after 90 days. |

### Database User Setup

```sql
-- Run as postgres superuser
CREATE USER erp_app WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE erp_production OWNER postgres ENCODING 'UTF8';

-- Grant app-level privileges only
GRANT CONNECT ON DATABASE erp_production TO erp_app;

-- After running migrations (which create the tables as postgres):
\c erp_production
GRANT USAGE ON SCHEMA public TO erp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_app;
```

**Note:** Migrations should be run as the `postgres` superuser (they may create enums, indexes, constraints). The app connects as `erp_app` at runtime. After any migration that creates new tables, re-run the GRANT statements above (see Section 7.5).

---

## 9. Backup & Recovery

### Backup Tiers

| Tier | What | When | Where | Protects Against |
|------|------|------|-------|-----------------|
| **Tier 1: Nightly logical backup** | `pg_dump` of `erp_production` | Every night at 2:00 AM | `C:\erp-backups\` (local) | Database corruption, bad data, accidental deletion |
| **Tier 2: Cross-VM copy** | Robocopy of backup to FactoryLogix VM | Every night at 2:30 AM | `\\FactoryLogix\erp-backups\` | VM-level failure, disk corruption on SRV-AT&A |
| **Tier 3: Off-host copy (MANDATORY)** | Manual copy to USB drive or cloud | Monthly (1st of month) | External USB drive or cloud storage | Physical server failure (both VMs lost) |

**Important:** Tier 1 + Tier 2 are both on the same physical host. This is **not real disaster recovery**. Tier 3 (monthly off-host copy) is the minimum for protecting against hardware failure. Treat it as mandatory, not optional.

### VMware Snapshots — Clarification

VMware snapshots are **not a backup tier**. They are a **temporary pre-change safety mechanism**.

**Correct usage:**
- Take a snapshot **before** risky maintenance (Windows updates, PostgreSQL upgrades, IIS config changes, server-level software installs)
- Verify the change works correctly
- **Delete the snapshot** after confirming stability (within 24-72 hours)

**Incorrect usage:**
- Do NOT keep weekly snapshots as routine retention
- Do NOT accumulate multiple snapshots over time
- VMware snapshots consume growing disk space and degrade VM performance if left in place. Snapshot consolidation issues can cause serious problems.

**Rule:** A snapshot should exist for hours or days, not weeks. If you need long-term protection, that's what Tiers 1-3 are for.

### Retention Policy

| Tier | Retention |
|------|-----------|
| Daily backups (Tier 1 & 2) | 30 days |
| Monthly off-host (Tier 3) | 12 months |
| VMware snapshots | Delete within 72 hours of the change that prompted them |

### Credential Handling

The backup script must **not** store the database password in plaintext in the script file. Instead, use PostgreSQL's `pgpass.conf` file:

**Create `%APPDATA%\postgresql\pgpass.conf`** (on the Windows account that runs the scheduled task):
```
# hostname:port:database:username:password
localhost:5432:erp_production:postgres:STRONG_BACKUP_PASSWORD_HERE
localhost:5432:*:postgres:STRONG_BACKUP_PASSWORD_HERE
```

Then restrict file permissions:
```powershell
# Run in PowerShell as Administrator
$pgpass = "$env:APPDATA\postgresql\pgpass.conf"
icacls $pgpass /inheritance:r /grant:r "$env:USERNAME:(R)"
```

PostgreSQL will automatically read this file. No `PGPASSWORD` environment variable needed.

### Backup Script: `C:\erp-backups\backup.bat`

```batch
@echo off
setlocal

set BACKUP_DIR=C:\erp-backups
set REMOTE_DIR=\\FactoryLogix\erp-backups
set PG_BIN="C:\Program Files\PostgreSQL\16\bin"
set DATE=%date:~-4%%date:~4,2%%date:~7,2%
set FILENAME=erp_production_%DATE%.dump
set LOGFILE=%BACKUP_DIR%\backup.log

echo [%date% %time%] === Starting database backup === >> %LOGFILE%

:: Step 1: Dump database (credentials from pgpass.conf — no inline password)
%PG_BIN%\pg_dump -U postgres -d erp_production -F c -f "%BACKUP_DIR%\%FILENAME%"

if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] SUCCESS: Backup created: %FILENAME% >> %LOGFILE%
) else (
    echo [%date% %time%] ERROR: pg_dump failed with exit code %ERRORLEVEL% >> %LOGFILE%
    exit /b 1
)

:: Step 2: Copy to remote VM (Tier 2)
if exist %REMOTE_DIR% (
    copy "%BACKUP_DIR%\%FILENAME%" "%REMOTE_DIR%\%FILENAME%" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [%date% %time%] SUCCESS: Copied to %REMOTE_DIR% >> %LOGFILE%
    ) else (
        echo [%date% %time%] WARNING: Remote copy failed >> %LOGFILE%
    )
) else (
    echo [%date% %time%] WARNING: Remote backup path %REMOTE_DIR% not accessible >> %LOGFILE%
)

:: Step 3: Clean up local backups older than 30 days
forfiles /p "%BACKUP_DIR%" /m "erp_production_*.dump" /d -30 /c "cmd /c del @path" 2>nul

:: Step 4: Clean up remote backups older than 30 days
if exist %REMOTE_DIR% (
    forfiles /p "%REMOTE_DIR%" /m "erp_production_*.dump" /d -30 /c "cmd /c del @path" 2>nul
)

echo [%date% %time%] === Backup job complete === >> %LOGFILE%
endlocal
```

### Weekly Restore Test Script: `C:\erp-backups\restore-test.bat`

```batch
@echo off
setlocal

set BACKUP_DIR=C:\erp-backups
set PG_BIN="C:\Program Files\PostgreSQL\16\bin"
set LOGFILE=%BACKUP_DIR%\restore-test.log
set TEST_DB=erp_backup_test

echo [%date% %time%] === Starting weekly restore test === >> %LOGFILE%

:: Find the most recent backup
for /f "delims=" %%F in ('dir /b /o-d "%BACKUP_DIR%\erp_production_*.dump" 2^>nul') do (
    set LATEST=%%F
    goto :found
)
echo [%date% %time%] ERROR: No backup files found >> %LOGFILE%
exit /b 1

:found
echo [%date% %time%] Testing restore of: %LATEST% >> %LOGFILE%

:: Drop and recreate test database
%PG_BIN%\psql -U postgres -c "DROP DATABASE IF EXISTS %TEST_DB%;" 2>>%LOGFILE%
%PG_BIN%\psql -U postgres -c "CREATE DATABASE %TEST_DB%;" 2>>%LOGFILE%

:: Restore
%PG_BIN%\pg_restore -U postgres -d %TEST_DB% "%BACKUP_DIR%\%LATEST%" 2>>%LOGFILE%

if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] SUCCESS: Restore test passed >> %LOGFILE%
) else (
    echo [%date% %time%] ERROR: Restore test FAILED >> %LOGFILE%
)

:: Quick sanity check: count rows in a core table
%PG_BIN%\psql -U postgres -d %TEST_DB% -c "SELECT 'materials: ' || count(*) FROM materials;" >> %LOGFILE% 2>&1

:: Clean up test database
%PG_BIN%\psql -U postgres -c "DROP DATABASE IF EXISTS %TEST_DB%;" 2>>%LOGFILE%

echo [%date% %time%] === Restore test complete === >> %LOGFILE%
endlocal
```

### Recovery Procedures

**Scenario A: Database corruption or bad data**
```batch
:: 1. Stop ERP
net stop erp-backend && net stop erp-frontend

:: 2. Restore from most recent backup
"C:\Program Files\PostgreSQL\16\bin\pg_restore" -U postgres -d erp_production --clean --if-exists "C:\erp-backups\erp_production_YYYYMMDD.dump"

:: 3. Restart ERP
net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend

:: Estimated recovery time: 2-5 minutes
```

**Scenario B: Bad release with backward-compatible migration**
```batch
:: Code rollback only — database is fine
cd /d C:\apps\erp
rename current broken-release
rename previous current
net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend

:: Estimated recovery time: < 30 seconds
```

**Scenario C: Bad release with non-backward-compatible migration**
```batch
:: Must restore both code AND database
net stop erp-backend && net stop erp-frontend

:: Restore database from pre-migration backup
"C:\Program Files\PostgreSQL\16\bin\pg_restore" -U postgres -d erp_production --clean --if-exists "C:\erp-backups\pre-migration-backup.dump"

:: Rollback code
cd /d C:\apps\erp
rename current broken-release
rename previous current
net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend

:: Estimated recovery time: 2-5 minutes
```

**Scenario D: Full VM failure**
```
1. Rebuild VM from VMware snapshot (if recent) or fresh Windows Server install
2. Reinstall PostgreSQL, Node.js, PM2, IIS (Phase 1 of deployment guide)
3. Copy most recent backup from \\FactoryLogix\erp-backups\ (or Tier 3 off-host)
4. Restore database from backup
5. Copy most recent release from dev machine or releases\ archive
6. Configure env files, IIS, PM2
7. Start PM2

Estimated recovery time: 1-2 hours (with this document as guide)
```

### Mandatory Pre-Go-Live Gate

> **A backup is not approved until restore is tested.**

Before go-live, perform a full backup → restore → verify cycle:
1. Run `backup.bat`
2. Run `restore-test.bat`
3. Check `restore-test.log` for SUCCESS
4. If restore fails, fix the backup configuration before proceeding

---

## 10. Environment Decisions (Resolved March 17, 2026)

### Q-A. Release copy method
> **Answer: Shared folder**

Create a shared folder `\\10.12.1.47\erp-deploy` on SRV-AT&A. Build script on dev machine copies release artifacts directly over the network via Robocopy. No Git on the production server.

### Q-B. Is IIS already enabled on SRV-AT&A?
> **Answer: Yes — already enabled (21 of 43 features installed)**

IIS is active with Web Server (18 of 34 sub-features) and Management Tools (3 of 7). FTP Server is not installed (not needed). Still need to install **URL Rewrite** and **Application Request Routing (ARR)** modules (separate downloads from iis.net).

### Q-C. DNS entry
> **Answer: `erp.atacanada.ca`**

Add an A record on the DNS server (SRV-AT&A itself): `erp.atacanada.ca` → `10.12.1.47`. Professional naming that leaves room for future services (e.g., `mes.atacanada.ca`).

### Q-D. HTTPS at launch?
> **Answer: No — launch with HTTP, HTTPS is post-launch hardening (Section 15)**

VPN users land on the 10.12.1.x network, so HTTP works for everyone. HTTPS is planned as Phase 2 hardening within 1 month of go-live.

> **Important:** Because we are running HTTP (not HTTPS), the session cookie `secure` flag in `main.ts` must be set to `false`. The default code sets `secure: config.NODE_ENV === 'production'` which enables `secure: true` in production — this causes the browser to refuse to send session cookies over HTTP, resulting in 401 errors on all authenticated requests. When HTTPS is enabled, change the flag back to `secure: true`.

### Q-E. Backup destination
> **Answer: Yes to both**

- **Tier 2:** Create `\\FactoryLogix\erp-backups\` for nightly cross-VM copy. Confirmed.
- **Tier 3:** Committed to monthly off-host copies (USB drive or cloud). Confirmed mandatory.

---

## 11. Step-by-Step Deployment Guide

> Environment questions resolved (Section 10). This guide is ready for execution.
> **Total estimated time: ~3 hours** (can be done in one session).
> **Downtime risk: zero** — this is a new service being added, nothing existing is affected until you point users to it.

### Pre-Deployment: Build Release (on your dev machine)

Before touching the server, build and stage the release:

- [ ] Stop any running backend/frontend dev servers
- [ ] Run the deploy script (Section 7.4), or manually:
  ```
  cd erp\backend && npm ci && npx tsc --noEmit && npm run build
  cd ..\frontend && npm ci && npm run build
  ```
- [ ] Verify `erp\backend\dist\main.js` exists
- [ ] Verify `erp\frontend\.next\BUILD_ID` exists
- [ ] Release artifacts are ready to copy to the server (will copy in Phase 4 after shared folder is created)

---

### Phase 1: Install Prerequisites & DNS (~30 min)

*RDP into SRV-AT&A (10.12.1.47)*

**1.1 — DNS Record**
- [ ] Open DNS Manager (`dnsmgmt.msc`)
- [ ] Navigate to Forward Lookup Zones → your zone
- [ ] Add New Host (A record): Name = `erp`, IP = `10.12.1.47`
- [ ] Verify from a workstation: `ping erp.atacanada.ca` should resolve to `10.12.1.47`

**1.2 — Node.js**
- [ ] Download and install Node.js LTS (v22.x) from nodejs.org — Windows installer
- [ ] Verify: open Command Prompt → `node -v` and `npm -v`

**1.3 — PostgreSQL 16**
- [ ] Download and install from postgresql.org — Windows installer
- [ ] Set superuser (`postgres`) password during install — **record securely**
- [ ] Choose locale: UTF-8
- [ ] Do NOT install Stack Builder
- [ ] Verify: `services.msc` → "postgresql-x64-16" shows "Running"

**1.4 — NSSM and PM2**
- [ ] Download NSSM 2.24-101 pre-release from nssm.cc — extract `win64\nssm.exe` to `C:\erp-deploy\nssm.exe`
- [ ] `npm install -g pm2` (optional — for manual admin use, not in startup path)

**1.5 — IIS Modules** (IIS itself is already enabled)
- [ ] Download and install URL Rewrite module from iis.net
- [ ] Download and install Application Request Routing (ARR) module from iis.net

**1.6 — Shared Folder for Releases**
- [ ] Create folder `C:\erp-deploy` on SRV-AT&A
- [ ] Right-click → Properties → Sharing → Advanced Sharing → share as `erp-deploy`
- [ ] Grant your dev machine user read/write access
- [ ] Verify from dev machine: `dir \\erp.atacanada.ca\erp-deploy` shows the folder

---

### Phase 2: Create Folder Structure (~5 min)

- [ ] Run in Command Prompt (as Administrator):
  ```batch
  mkdir C:\apps\erp\current\backend
  mkdir C:\apps\erp\current\frontend
  mkdir C:\apps\erp\previous
  mkdir C:\apps\erp\releases
  mkdir C:\apps\erp\shared
  mkdir C:\apps\erp\shared\uploads
  mkdir C:\apps\erp\logs
  mkdir C:\erp-backups
  ```

---

### Phase 3: Database Setup (~15 min)

**3.1 — Configure PostgreSQL**
- [ ] Open `C:\Program Files\PostgreSQL\16\data\postgresql.conf` in a text editor
- [ ] Set `listen_addresses = 'localhost'`
- [ ] Apply all settings from Section 8 (memory, WAL, autovacuum, logging)
- [ ] Open `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
- [ ] Replace contents with rules from Section 8
- [ ] Restart PostgreSQL service: `services.msc` → right-click "postgresql-x64-16" → Restart
- [ ] Verify startup type is set to "Automatic"

**3.2 — Create Database and User**
- [ ] Open Command Prompt:
  ```
  "C:\Program Files\PostgreSQL\16\bin\psql" -U postgres
  ```
- [ ] Run the SQL from Section 8:
  ```sql
  CREATE USER erp_app WITH PASSWORD 'STRONG_PASSWORD_HERE';
  CREATE DATABASE erp_production OWNER postgres ENCODING 'UTF8';
  ```
- [ ] Exit psql: `\q`

**3.3 — Setup Backup Credentials**
- [ ] Create `%APPDATA%\postgresql\pgpass.conf` with contents from Section 9
- [ ] Restrict permissions (PowerShell as Administrator):
  ```powershell
  $pgpass = "$env:APPDATA\postgresql\pgpass.conf"
  icacls $pgpass /inheritance:r /grant:r "$env:USERNAME:(R)"
  ```

---

### Phase 4: First Release Deployment (~20 min)

**4.1 — Copy Release to Server** (from dev machine)
- [ ] Copy backend artifacts to server:
  ```
  robocopy erp\backend\dist \\erp.atacanada.ca\erp-deploy\current\backend\dist /E /NP
  robocopy erp\backend\node_modules \\erp.atacanada.ca\erp-deploy\current\backend\node_modules /E /NP
  copy erp\backend\package.json \\erp.atacanada.ca\erp-deploy\current\backend\
  ```
- [ ] Copy frontend artifacts to server:
  ```
  robocopy erp\frontend\.next \\erp.atacanada.ca\erp-deploy\current\frontend\.next /E /NP
  robocopy erp\frontend\node_modules \\erp.atacanada.ca\erp-deploy\current\frontend\node_modules /E /NP
  robocopy erp\frontend\public \\erp.atacanada.ca\erp-deploy\current\frontend\public /E /NP
  copy erp\frontend\package.json \\erp.atacanada.ca\erp-deploy\current\frontend\
  ```

**4.2 — Move to App Directory** (on server)
- [ ] Copy from deploy share to app directory:
  ```batch
  robocopy C:\erp-deploy\current C:\apps\erp\current /E /NP
  ```

**4.3 — Create Environment Files**
- [ ] Create `C:\apps\erp\shared\.env.backend` with contents from Section 12
  - Generate session secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
  - Set actual `erp_app` password in DATABASE_URL
- [ ] Create `C:\apps\erp\shared\.env.frontend` with contents from Section 12
- [ ] Copy env files into release:
  ```batch
  copy C:\apps\erp\shared\.env.backend C:\apps\erp\current\backend\.env.production
  copy C:\apps\erp\shared\.env.frontend C:\apps\erp\current\frontend\.env.production
  ```

**4.4 — Run Migrations**
- [ ] Run as postgres superuser (migrations may create enums, indexes, constraints):
  ```batch
  cd /d C:\apps\erp\current\backend
  set DATABASE_URL=postgres://postgres:POSTGRES_PASSWORD@localhost:5432/erp_production
  npx typeorm migration:run -d dist/data-source.js
  ```

**4.5 — Grant App User Permissions**
- [ ] Open psql and run:
  ```sql
  \c erp_production
  GRANT USAGE ON SCHEMA public TO erp_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_app;
  ```

---

### Phase 5: Process Management — NSSM Direct Services (~15 min)

**5.0 — Clean Up Previous Attempts** (if applicable)
- [ ] Remove any existing scheduled tasks: `schtasks /delete /TN "PM2 ERP Startup" /F`
- [ ] Kill orphaned Node processes: `taskkill /F /IM node.exe`
- [ ] Kill PM2 daemon: `pm2 kill`

**5.1 — Install Backend Service**
- [ ] Run from Command Prompt (as Administrator):
  ```batch
  C:\erp-deploy\nssm.exe install erp-backend "C:\Program Files\nodejs\node.exe"
  C:\erp-deploy\nssm.exe set erp-backend AppParameters "--max-old-space-size=512 C:\apps\erp\current\backend\dist\main.js"
  C:\erp-deploy\nssm.exe set erp-backend AppDirectory "C:\apps\erp\current\backend"
  C:\erp-deploy\nssm.exe set erp-backend AppEnvironmentExtra NODE_ENV=production PORT=3002 HOST=127.0.0.1
  C:\erp-deploy\nssm.exe set erp-backend AppStdout "C:\apps\erp\logs\backend-out.log"
  C:\erp-deploy\nssm.exe set erp-backend AppStderr "C:\apps\erp\logs\backend-error.log"
  C:\erp-deploy\nssm.exe set erp-backend AppStdoutCreationDisposition 4
  C:\erp-deploy\nssm.exe set erp-backend AppStderrCreationDisposition 4
  C:\erp-deploy\nssm.exe set erp-backend AppRotateFiles 1
  C:\erp-deploy\nssm.exe set erp-backend AppRotateBytes 10485760
  C:\erp-deploy\nssm.exe set erp-backend Start SERVICE_AUTO_START
  ```
- [ ] Set recovery options: `services.msc` → `erp-backend` → Properties → Recovery tab:
  - First / Second / Subsequent failures: Restart the Service
  - Reset fail count after: 1 day

**5.2 — Install Frontend Service**
- [ ] Run from Command Prompt (as Administrator):
  ```batch
  C:\erp-deploy\nssm.exe install erp-frontend "C:\Program Files\nodejs\node.exe"
  C:\erp-deploy\nssm.exe set erp-frontend AppParameters "C:\apps\erp\current\frontend\node_modules\next\dist\bin\next start -p 3000 -H 127.0.0.1"
  C:\erp-deploy\nssm.exe set erp-frontend AppDirectory "C:\apps\erp\current\frontend"
  C:\erp-deploy\nssm.exe set erp-frontend AppEnvironmentExtra NODE_ENV=production PORT=3000
  C:\erp-deploy\nssm.exe set erp-frontend AppStdout "C:\apps\erp\logs\frontend-out.log"
  C:\erp-deploy\nssm.exe set erp-frontend AppStderr "C:\apps\erp\logs\frontend-error.log"
  C:\erp-deploy\nssm.exe set erp-frontend AppStdoutCreationDisposition 4
  C:\erp-deploy\nssm.exe set erp-frontend AppStderrCreationDisposition 4
  C:\erp-deploy\nssm.exe set erp-frontend AppRotateFiles 1
  C:\erp-deploy\nssm.exe set erp-frontend AppRotateBytes 10485760
  C:\erp-deploy\nssm.exe set erp-frontend Start SERVICE_AUTO_START
  ```
- [ ] Set recovery options: same as backend

**5.3 — Start Services**
- [ ] `net start erp-backend`
- [ ] `net start erp-frontend`
- [ ] Verify backend: `curl http://127.0.0.1:3002/api/health`
- [ ] Verify frontend: `curl http://127.0.0.1:3000`
- [ ] Verify in `services.msc`: both show "Running", startup type "Automatic"

**5.4 — GO/NO-GO GATE (mandatory)**

| # | Test | Action | Pass Criteria |
|---|------|--------|---------------|
| 1 | **Crash recovery** | Kill backend Node PID with `taskkill /F /PID <pid>`, wait 10s | `sc query erp-backend` shows RUNNING, health check returns OK |
| 2 | **Full reboot** | `shutdown /r /t 10` | After 3 min, `sc query erp-backend` and `sc query erp-frontend` both show RUNNING |
| 3 | **Service stop recovery** | Stop `erp-backend` in `services.msc`, wait 30s | N/A — manual stops do not trigger recovery (expected Windows behavior; recovery only fires on unexpected exits) |
| 4 | **Headless boot** | Reboot, do NOT log in via RDP, wait 5 min, access from workstation | Open `http://erp.atacanada.ca` from a workstation browser — ERP loads (requires IIS Phase 6 to be completed first) |

**Tests 1, 2, and 4 must pass.**

---

### Phase 6: IIS Reverse Proxy (~20 min)

**6.1 — Enable Proxy**
- [ ] Open IIS Manager (`inetmgr`)
- [ ] Click server name → Application Request Routing → Server Proxy Settings
- [ ] Check "Enable proxy" → Apply

**6.2 — Create Site**
- [ ] In IIS Manager → Sites → right-click → Add Website
  - Site name: `ERP`
  - Physical path: `C:\apps\erp\current\frontend` (IIS needs a physical path but it won't serve files — just proxies)
  - Binding: HTTP, port 80, All Unassigned
- [ ] Stop or remove "Default Web Site" if it's bound to port 80

**6.3 — Configure Rewrite Rules**
- [ ] Copy `deploy\web.config` to `C:\apps\erp\current\frontend\web.config`
- [ ] In IIS Manager → ERP site → URL Rewrite → verify two rules appear (API Proxy, Frontend Proxy)
- [ ] **Required:** In URL Rewrite → View Server Variables → Add these three:
  - `HTTP_X_FORWARDED_FOR`
  - `HTTP_X_FORWARDED_PROTO`
  - `HTTP_X_FORWARDED_HOST`
  - (Without these, IIS returns 500 URL Rewrite Module Error)

**6.4 — Firewall**
- [ ] Verify inbound TCP port 80 is allowed (check existing rules first — may already exist)
- [ ] Verify there are NO inbound allow rules for ports 3000, 3002, or 5432

**6.5 — Test**
- [ ] From a workstation browser: open `http://erp.atacanada.ca`
- [ ] Fallback test: open `http://10.12.1.47`
- [ ] Both should show the ERP login page
- [ ] Log in and verify dashboard loads with data

---

### Phase 7: Backup Configuration (~15 min)

**7.1 — Setup Scripts**
- [ ] Create `C:\erp-backups\backup.bat` with contents from Section 9
- [ ] Create `C:\erp-backups\restore-test.bat` with contents from Section 9

**7.2 — Cross-VM Backup (Tier 2)**
- [ ] On FactoryLogix VM: create shared folder `\\FactoryLogix\erp-backups\`
- [ ] From SRV-AT&A: verify write access → `echo test > \\FactoryLogix\erp-backups\test.txt` then delete it

**7.3 — Schedule**
- [ ] Open Task Scheduler (`taskschd.msc`)
- [ ] Create Task: "ERP Nightly Backup"
  - Trigger: Daily at 2:00 AM
  - Action: Start program → `C:\erp-backups\backup.bat`
  - Settings: "Run whether user is logged on or not", "Run with highest privileges"
- [ ] Create Task: "ERP Weekly Restore Test"
  - Trigger: Weekly, Sunday at 3:00 AM
  - Action: Start program → `C:\erp-backups\restore-test.bat`
  - Settings: same as above

**7.4 — MANDATORY GATE**
- [ ] Run `C:\erp-backups\backup.bat` manually
- [ ] Check `C:\erp-backups\backup.log` — must show SUCCESS
- [ ] Check `\\FactoryLogix\erp-backups\` — backup file must exist
- [ ] Run `C:\erp-backups\restore-test.bat` manually
- [ ] Check `C:\erp-backups\restore-test.log` — must show SUCCESS
- [ ] **Do not proceed to go-live if either gate fails.**

---

### Phase 8: Smoke Testing (~30 min)

- [ ] From a workstation browser: open `http://erp.atacanada.ca`
- [ ] Create admin user account (first user via seed or API)
- [ ] Test login / logout
- [ ] Create a test customer
- [ ] Create a test material
- [ ] Create a test product with a BOM
- [ ] Test BOM import (upload a CSV file — validates IIS 50 MB upload limit)
- [ ] Create a test order
- [ ] Verify from a **second workstation** (confirms network access)

---

### Phase 9: Go-Live Checklist

- [ ] Drop test data: re-create database clean, re-run migrations, re-grant permissions
  ```batch
  :: On server as postgres superuser
  psql -U postgres -c "DROP DATABASE erp_production;"
  psql -U postgres -c "CREATE DATABASE erp_production OWNER postgres ENCODING 'UTF8';"
  cd /d C:\apps\erp\current\backend
  set DATABASE_URL=postgres://postgres:POSTGRES_PASSWORD@localhost:5432/erp_production
  npx typeorm migration:run -d dist/data-source.js
  :: Then re-run GRANT statements from Phase 4.5
  ```
- [ ] Restart ERP: `net stop erp-backend && net stop erp-frontend && net start erp-backend && net start erp-frontend`
- [ ] Create real admin account with a strong password
- [ ] Create user accounts for all operators / managers
- [ ] Bookmark `http://erp.atacanada.ca` on all shared workstations
- [ ] Train users on basic workflows
- [ ] Set calendar reminder: monthly off-host backup (Tier 3) — 1st of each month
- [ ] Set calendar reminder: first monthly operations review (Section 14) — 1 month from go-live

---

## 12. Production Environment Files

### Backend: `C:\apps\erp\shared\.env.backend`

```env
# Database (erp_app user — limited privileges)
DATABASE_URL=postgres://erp_app:STRONG_PASSWORD_HERE@localhost:5432/erp_production

# Server — bind to localhost only, IIS handles external traffic
PORT=3002
HOST=127.0.0.1
NODE_ENV=production

# Session (generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
SESSION_SECRET=GENERATE_A_64_CHAR_RANDOM_STRING_HERE

# CORS — the URL users access the ERP from
CORS_ORIGIN=http://erp.atacanada.ca
```

### Frontend: `C:\apps\erp\shared\.env.frontend`

```env
# API URL — goes through IIS reverse proxy (same origin, no CORS issues)
NEXT_PUBLIC_API_URL=http://erp.atacanada.ca/api
```

### NSSM Service Configuration

Boot persistence is handled by two NSSM-managed Windows services (`erp-backend`, `erp-frontend`) that run `node.exe` directly. See Section 6 for the full NSSM configuration commands.

PM2 is **not** in the startup path. It remains available for optional manual use (`pm2 start`, `pm2 logs`, etc.) but services are managed via `services.msc`, `net start/stop`, and `sc query`.

---

## 13. Quick Reference Card

### Day-to-Day Operations

| Task | Command |
|------|---------|
| **Check ERP status** | `sc query erp-backend` and `sc query erp-frontend` (or `services.msc`) |
| **View backend logs** | `type C:\apps\erp\logs\backend-out.log` (or `pm2 logs erp-backend` if PM2 is running) |
| **View frontend logs** | `type C:\apps\erp\logs\frontend-out.log` |
| **Restart ERP** | `net stop erp-backend && net start erp-backend` (same for frontend) |
| **Stop ERP** | `net stop erp-backend && net stop erp-frontend` |
| **Manual backup** | `C:\erp-backups\backup.bat` |
| **Check backup log** | `type C:\erp-backups\backup.log` |
| **Check restore test log** | `type C:\erp-backups\restore-test.log` |
| **Check PostgreSQL** | `services.msc` → look for "postgresql-x64-16" |
| **Check IIS** | `inetmgr` (IIS Manager) |

### Deployment Operations

| Task | Steps |
|------|-------|
| **Deploy new release** | Build on dev machine → copy to server → run pre-flight (7.6) → switch release (7.6) → post-switch verify (7.6) |
| **Deploy with migration** | Take backup → run migration (7.5) → grant perms → switch release (7.6) → verify |
| **Rollback (no migration)** | `rename current broken` → `rename previous current` → `net stop erp-backend && net start erp-backend` (same for frontend) |
| **Rollback (with migration)** | Restore pre-migration backup → code rollback → restart services |
| **Restore from backup** | `net stop erp-backend && net stop erp-frontend` → `pg_restore -U postgres -d erp_production --clean --if-exists <backup.dump>` → `net start erp-backend && net start erp-frontend` |

### Key Paths

| Path | Purpose |
|------|---------|
| `C:\apps\erp\current\` | Active ERP release |
| `C:\apps\erp\previous\` | Rollback target |
| `C:\apps\erp\shared\` | Environment files, persistent uploads (NEVER deleted) |
| `C:\apps\erp\logs\` | Application logs (NSSM stdout/stderr) |
| `C:\erp-deploy\nssm.exe` | NSSM service manager binary |
| `C:\erp-backups\` | Database backups and logs |
| `C:\inetpub\logs\LogFiles\` | IIS access logs |
| `C:\Program Files\PostgreSQL\16\data\log\` | PostgreSQL logs |

### Network

| Item | Value |
|------|-------|
| **Server IP** | `10.12.1.47` |
| **ERP URL** | `http://erp.atacanada.ca` (fallback: `http://10.12.1.47`) |
| **IIS** | Port 80 (only externally exposed port) |
| **Backend** | `127.0.0.1:3002` (localhost only) |
| **Frontend** | `127.0.0.1:3000` (localhost only) |
| **PostgreSQL** | `127.0.0.1:5432` (localhost only) |

### Emergency Contacts

| System | Recovery Resource |
|--------|-------------------|
| **ERP application** | This document + `C:\apps\erp\previous\` for rollback |
| **Database** | `C:\erp-backups\` (local) + `\\FactoryLogix\erp-backups\` (remote) |
| **Full VM** | Fresh install using this document (Phases 1-9) + most recent backup |

---

## 14. Operational Monitoring Procedure

This section defines the minimum operational checks needed to keep the ERP healthy. Since there is no dedicated IT admin, these must be simple and quick.

### Daily Checks (~2 minutes)

| Check | How | What to Look For |
|-------|-----|-----------------|
| **ERP is running** | `sc query erp-backend` and `sc query erp-frontend` (RDP into server, or check `services.msc`) | Both services show "RUNNING". If either is "STOPPED", check logs in `C:\apps\erp\logs\` and restart with `net start erp-backend`. |
| **Backup succeeded** | `type C:\erp-backups\backup.log` | Last entry should show today's date and "SUCCESS". If "ERROR", check disk space and PostgreSQL service status. |

> **Shortcut:** If users are actively using the ERP without complaints, the daily service check can be skipped. But **always check the backup log** — backup failures are silent.

### Weekly Checks (~5 minutes, every Monday)

| Check | How | What to Look For |
|-------|-----|-----------------|
| **Restore test passed** | `type C:\erp-backups\restore-test.log` | Last Sunday's entry should show "SUCCESS". If "FAILED", fix immediately — your backups may be unusable. |
| **Service stability** | `services.msc` → check both ERP services are "Running" | If a service has stopped, check `C:\apps\erp\logs\backend-error.log` or `frontend-error.log` for crash details. |
| **IIS access logs exist** | Check `C:\inetpub\logs\LogFiles\` | New daily log files should be appearing. If not, IIS logging may be misconfigured. |

### Monthly Checks (~15 minutes, 1st of each month)

| Check | How | What to Look For |
|-------|-----|-----------------|
| **Disk space** | Open File Explorer → right-click C: drive → Properties | Should have > 50 GB free. If approaching limit, clean up old releases in `C:\apps\erp\releases\`. |
| **PostgreSQL data size** | Check folder size of `C:\Program Files\PostgreSQL\16\data\` | Should be < 5 GB for first year. If growing fast, check for runaway logging or bloated tables. |
| **WAL file size** | Check folder size of `C:\Program Files\PostgreSQL\16\data\pg_wal\` | Should be < 1 GB. If larger, check `max_wal_size` setting. |
| **PostgreSQL logs** | Check `C:\Program Files\PostgreSQL\16\data\log\` | Delete logs older than 90 days. Check recent logs for repeated ERROR entries. |
| **IIS log cleanup** | Check `C:\inetpub\logs\LogFiles\` | Delete logs older than 90 days. |
| **Application log size** | Check `C:\apps\erp\logs\` | Should be managed by NSSM log rotation (10 MB max). If individual files > 100 MB, check NSSM rotation config. |
| **Off-host backup (Tier 3)** | Copy most recent `.dump` file to USB drive or cloud storage | This is your disaster recovery. Do not skip. |
| **Release cleanup** | Check `C:\apps\erp\releases\` | Keep last 3-5 releases. Delete older ones to free disk space. |

### After Windows Updates

Windows Server may install updates that require a reboot. After any reboot:

| Check | How | What to Look For |
|-------|-----|-----------------|
| **ERP auto-started** | Open `http://erp.atacanada.ca` from a workstation, or `sc query erp-backend` on server | Both services should show "RUNNING". If not, check NSSM service status and restart with `net start erp-backend` / `net start erp-frontend`. |
| **PostgreSQL running** | `services.msc` → look for "postgresql-x64-16" | Should show "Running" with startup type "Automatic". |
| **IIS running** | `services.msc` → look for "World Wide Web Publishing Service" | Should show "Running". |

### When to Escalate

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Backup log shows ERROR for 2+ consecutive days | PostgreSQL service down, disk full, or pgpass.conf permissions changed | Check PostgreSQL service, check disk space, verify pgpass.conf |
| Restore test log shows FAILED | Backup file is corrupt, or test database creation failed | Run backup.bat manually, then restore-test.bat. If still failing, check PostgreSQL logs. |
| ERP service keeps stopping | Application crash loop | Check `C:\apps\erp\logs\backend-error.log`. Likely a code bug or database connection issue. Rollback if needed. |
| Users cannot access ERP | IIS down, ERP services down, or network issue | Check IIS service, `sc query erp-backend`, `sc query erp-frontend`, and that port 80 is not blocked by firewall. |
| Disk space below 20 GB | Old releases, backup accumulation, or PostgreSQL log growth | Clean old releases, verify backup retention cleanup is working, clean old PostgreSQL/IIS logs. |

---

## 15. Post-Launch Hardening Roadmap

These items are **not required for initial internal go-live** but should be implemented within the first few months of production operation. They are listed in priority order.

| Priority | Item | Why | Target |
|----------|------|-----|--------|
| **1** | **HTTPS everywhere** | HTTP transmits session cookies and passwords in cleartext over the network. Even on LAN, this is a security weakness. HTTPS should be the default, not an option for VPN users only. Use a self-signed certificate or Windows internal CA. **When enabling HTTPS:** change `secure: false` back to `secure: true` in `erp/backend/src/main.ts` (session cookie config) and redeploy. | Within 1 month of go-live |
| **2** | **Automated off-host backup** | Monthly manual USB copy is better than nothing, but easy to forget. Investigate cloud backup (e.g., BackBlaze B2, AWS S3 with lifecycle) or scheduled robocopy to a NAS. | Within 2 months |
| **3** | **Active Directory integration** | Replace built-in user accounts with AD authentication. Single sign-on for factory users. Already noted as future goal. | Within 6 months |
| **4** | **Monitoring alerts** | Currently relying on manual log checks. Add a simple health check script that emails you if backup fails or ERP is unreachable. Could be as simple as a Task Scheduler script that hits `http://127.0.0.1:3002/api/health` and sends an email on failure. | Within 3 months |
| **5** | **Next.js standalone build** | Next.js supports a `standalone` output mode that bundles only required `node_modules` into the `.next/standalone/` directory, significantly reducing release size and eliminating the need to copy the full `node_modules/`. Investigate switching to this for smaller, faster deployments. | When convenient |
