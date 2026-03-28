@echo off
setlocal

:: ============================================================
:: ERP Nightly Database Backup
:: Place at: C:\erp-backups\backup.bat
::
:: Schedule: Windows Task Scheduler, daily at 2:00 AM
::   - Run whether user is logged on or not
::   - Run with highest privileges
::
:: Credentials: Uses pgpass.conf (no inline passwords)
::   Create %APPDATA%\postgresql\pgpass.conf with:
::   localhost:5432:erp_production:postgres:YOUR_PASSWORD
::   localhost:5432:*:postgres:YOUR_PASSWORD
::
:: See DEPLOYMENT_PLAN.md Section 9
:: ============================================================

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
