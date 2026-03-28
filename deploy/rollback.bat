@echo off
setlocal

:: ============================================================
:: ERP Rollback Script (run on SRV-AT&A production server)
::
:: Usage: deploy\rollback.bat
::
:: This script rolls back to the previous release in < 30 seconds.
:: It does NOT restore the database. If the failed release included
:: a non-backward-compatible migration, you must also restore the
:: database from the pre-migration backup.
::
:: See DEPLOYMENT_PLAN.md Sections 7.5 and 7.7
:: ============================================================

set APP_DIR=C:\apps\erp

echo ============================================================
echo   ERP Rollback
echo ============================================================
echo.

cd /d "%APP_DIR%"

:: Check that previous exists
if not exist previous (
    echo ERROR: No previous release found. Cannot rollback.
    echo.
    echo If you need to restore from backup, see DEPLOYMENT_PLAN.md
    echo Section 9 "Recovery Procedures".
    exit /b 1
)

:: Check that previous has the expected structure
if not exist "previous\backend\dist\main.js" (
    echo ERROR: Previous release appears incomplete (missing backend\dist\main.js)
    exit /b 1
)

echo Rolling back...

:: Rename current to broken
if exist current (
    rename current broken-release
    echo   Current release moved to broken-release\
)

:: Restore previous
rename previous current
echo   Previous release restored as current\

:: Restart PM2
echo   Restarting PM2...
pm2 restart all

:: Wait and show status
timeout /t 5 /nobreak >nul
pm2 status

echo.
echo ============================================================
echo   Rollback complete
echo ============================================================
echo.
echo The ERP is now running the previous release.
echo.
echo Next steps:
echo   1. Verify http://erp.company.local loads correctly
echo   2. Investigate the failed release in broken-release\
echo   3. When done: rmdir /s /q broken-release
echo.
echo If the failed release included a non-backward-compatible
echo migration, you must also restore the database:
echo   pm2 stop all
echo   "C:\Program Files\PostgreSQL\16\bin\pg_restore" -U postgres -d erp_production --clean --if-exists "C:\erp-backups\pre-migration-backup.dump"
echo   pm2 restart all
echo.
endlocal
