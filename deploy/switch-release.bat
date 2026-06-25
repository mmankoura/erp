@echo off
setlocal

:: ============================================================
:: ERP Release Switch Script (run on SRV-AT&A production server)
::
:: Usage: deploy\switch-release.bat YYYY-MM-DD_NNN
:: Example: deploy\switch-release.bat 2026-03-27_001
::
:: This script:
::   1. Runs pre-flight checks
::   2. Stops the NSSM services (erp-backend, erp-frontend) BEFORE rotating
::   3. Preserves current release as rollback target (aborts on rotate failure)
::   4. Activates the new release
::   5. Copies environment files
::   6. Starts the services
::   7. Runs post-switch verification
::
:: See DEPLOYMENT_PLAN.md Sections 7.5 and 7.6
:: ============================================================

set APP_DIR=C:\apps\erp
set RELEASE_NAME=%1

if "%RELEASE_NAME%"=="" (
    echo ERROR: Release name required.
    echo Usage: switch-release.bat YYYY-MM-DD_NNN
    echo.
    echo Available releases:
    dir /b "%APP_DIR%\releases\" 2>nul
    exit /b 1
)

echo ============================================================
echo   ERP Release Switch: %RELEASE_NAME%
echo ============================================================
echo.

:: ---- PRE-FLIGHT CHECKS ----

echo [Pre-flight] Checking release artifacts...
if not exist "%APP_DIR%\releases\%RELEASE_NAME%\backend\dist\main.js" (
    echo FAILED: backend dist\main.js not found in release
    exit /b 1
)
if not exist "%APP_DIR%\releases\%RELEASE_NAME%\frontend\.next\BUILD_ID" (
    echo FAILED: frontend .next\BUILD_ID not found in release
    exit /b 1
)
echo   Release artifacts: OK

echo [Pre-flight] Checking environment files...
if not exist "%APP_DIR%\shared\.env.backend" (
    echo FAILED: shared\.env.backend not found
    exit /b 1
)
if not exist "%APP_DIR%\shared\.env.frontend" (
    echo FAILED: shared\.env.frontend not found
    exit /b 1
)
echo   Environment files: OK

echo [Pre-flight] Checking ERP services...
sc query erp-backend >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: erp-backend service may not be installed. Continuing anyway...
) else (
    echo   ERP services: OK
)

echo.

:: ---- RELEASE SWITCH ----

echo [Switch] Starting release switch...
cd /d "%APP_DIR%"

:: Step 1: Stop services BEFORE any rotate. A running service holds a lock on
::         current\, which made "rename current previous" fail with "Access is
::         denied" in REV-006 — and because the rotate wasn't checked, the
::         script continued and destroyed the previous\ rollback target.
echo   Stopping services before rotate...
net stop erp-backend
net stop erp-frontend

:: Step 2: Clear any stale previous-backup from a prior failed deploy
if exist previous-backup (
    echo   Cleaning up stale previous-backup...
    rmdir /s /q previous-backup
)

:: Step 3: Preserve current as rollback target. ABORT on any rotate failure —
::         silently continuing past a failed rename is what consumed previous\
::         in REV-006.
if exist previous (
    rename previous previous-backup
    if errorlevel 1 (
        echo FAILED: could not rename previous -^> previous-backup. Aborting, no changes made.
        net start erp-backend
        net start erp-frontend
        exit /b 1
    )
)
if exist current (
    rename current previous
    if errorlevel 1 (
        echo FAILED: could not rename current -^> previous ^(file lock?^). Aborting.
        if exist previous-backup rename previous-backup previous
        net start erp-backend
        net start erp-frontend
        exit /b 1
    )
    echo   Preserved current as rollback target (previous\)
)

:: Step 4: Activate new release
rename "releases\%RELEASE_NAME%" current
if errorlevel 1 (
    echo FAILED: Could not rename release to current.
    echo Attempting rollback...
    if exist previous (
        rename previous current
        echo   Rollback complete.
    )
    net start erp-backend
    net start erp-frontend
    exit /b 1
)
echo   Activated release: %RELEASE_NAME%

:: Step 5: Copy env and config files
copy shared\.env.backend current\backend\.env >nul
copy shared\.env.frontend current\frontend\.env >nul
copy shared\web.config current\frontend\web.config >nul
echo   Environment and config files copied

:: Step 6: Start services (they were stopped before the rotate in Step 1)
echo   Starting services...
net start erp-backend
net start erp-frontend
echo   Services started

:: Step 7: Clean up old backup
if exist previous-backup (
    rmdir /s /q previous-backup
)

echo.

:: ---- POST-SWITCH VERIFICATION ----

echo [Verify] Checking service status...
timeout /t 5 /nobreak >nul
sc query erp-backend | findstr STATE
sc query erp-frontend | findstr STATE

echo.
echo [Verify] Checking backend health...
curl -s http://127.0.0.1:3002/api/health 2>nul
echo.

echo.
echo ============================================================
echo   Release switch complete: %RELEASE_NAME%
echo ============================================================
echo.
echo Post-switch checklist:
echo   1. Check service status above — both should show RUNNING
echo   2. Open http://erp.atacanada.ca from a workstation browser
echo   3. Test login
echo.
echo If anything is wrong, run: deploy\rollback.bat
echo.
endlocal
