@echo off
setlocal

:: ============================================================
:: ERP Weekly Restore Test
:: Place at: C:\erp-backups\restore-test.bat
::
:: Schedule: Windows Task Scheduler, weekly Sunday at 3:00 AM
::   - Run whether user is logged on or not
::   - Run with highest privileges
::
:: This script restores the most recent backup to a test database,
:: runs a sanity check, then drops the test database.
:: A backup is not approved until restore is tested.
::
:: See DEPLOYMENT_PLAN.md Section 9
:: ============================================================

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
