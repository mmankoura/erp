@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: ERP Deploy Script (reusable for all revisions)
::
:: Usage:   deploy.bat REV-004 2026-04-10_001
::          deploy.bat REV-004 2026-04-10_001 --full
::
:: Args:    %1 = REV label (for display only)
::          %2 = Release folder name (YYYY-MM-DD_NNN)
::          %3 = --full (optional, forces full node_modules copy)
::
:: Smart node_modules:
::   Compares package-lock.json between dev and server's current
::   release. If unchanged, skips node_modules copy (uses junction
::   links on server). If changed, does full robocopy.
::   Use --full to force full copy regardless.
:: ============================================================

set REV_LABEL=%~1
set REV=%~2
set FORCE_FULL=%~3
set SERVER=\\10.12.1.47\erp-deploy
set PROJECT=C:\Users\mark.mankoura\Documents\projects\erp

if "%REV_LABEL%"=="" (
    echo Usage: deploy.bat REV-LABEL RELEASE-FOLDER [--full]
    echo Example: deploy.bat REV-004 2026-04-10_001
    exit /b 1
)
if "%REV%"=="" (
    echo Usage: deploy.bat REV-LABEL RELEASE-FOLDER [--full]
    echo Example: deploy.bat REV-004 2026-04-10_001
    exit /b 1
)

set RELEASE=%SERVER%\releases\%REV%

echo.
echo ============================================================
echo  ERP Deploy: %REV_LABEL% (%REV%)
echo  Target: %RELEASE%
echo ============================================================
echo.

:: ============================================================
:: Check if node_modules need copying
:: ============================================================
set BACKEND_NM=SKIP
set FRONTEND_NM=SKIP

if "%FORCE_FULL%"=="--full" (
    echo [*] --full flag set: will copy ALL node_modules
    set BACKEND_NM=COPY
    set FRONTEND_NM=COPY
    goto :start_copy
)

:: Compare backend package-lock.json
echo [*] Checking backend package-lock.json...
fc /b "%PROJECT%\erp\backend\package-lock.json" "%SERVER%\current-locks\backend-package-lock.json" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo     CHANGED — will copy backend node_modules
    set BACKEND_NM=COPY
) else (
    echo     Unchanged — will use junction link for backend node_modules
)

:: Compare frontend package-lock.json
echo [*] Checking frontend package-lock.json...
fc /b "%PROJECT%\erp\frontend\package-lock.json" "%SERVER%\current-locks\frontend-package-lock.json" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo     CHANGED — will copy frontend node_modules
    set FRONTEND_NM=COPY
) else (
    echo     Unchanged — will use junction link for frontend node_modules
)

:start_copy
echo.
pause

:: ============================================================
:: Copy backend
:: ============================================================
echo.
echo [1/7] Backend dist...
robocopy "%PROJECT%\erp\backend\dist" "%RELEASE%\backend\dist" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: backend dist copy & exit /b 1)

if "%BACKEND_NM%"=="COPY" (
    echo [2/7] Backend node_modules - FULL COPY - this will take a while...
    robocopy "%PROJECT%\erp\backend\node_modules" "%RELEASE%\backend\node_modules" /E /NP /NFL /NDL
) else (
    echo [2/7] Backend node_modules — SKIPPED
)

echo [3/7] Backend package.json + package-lock.json...
copy "%PROJECT%\erp\backend\package.json" "%RELEASE%\backend\" >nul
copy "%PROJECT%\erp\backend\package-lock.json" "%RELEASE%\backend\" >nul

:: ============================================================
:: Copy frontend
:: ============================================================
echo [4/7] Frontend .next...
robocopy "%PROJECT%\erp\frontend\.next" "%RELEASE%\frontend\.next" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: frontend .next copy & exit /b 1)

if "%FRONTEND_NM%"=="COPY" (
    echo [5/7] Frontend node_modules - FULL COPY - this will take a while...
    robocopy "%PROJECT%\erp\frontend\node_modules" "%RELEASE%\frontend\node_modules" /E /NP /NFL /NDL
) else (
    echo [5/7] Frontend node_modules — SKIPPED
)

echo [6/7] Frontend public + package.json + package-lock.json...
robocopy "%PROJECT%\erp\frontend\public" "%RELEASE%\frontend\public" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: frontend public copy & exit /b 1)
copy "%PROJECT%\erp\frontend\package.json" "%RELEASE%\frontend\" >nul
copy "%PROJECT%\erp\frontend\package-lock.json" "%RELEASE%\frontend\" >nul

:: ============================================================
:: Save current lock files for next deploy comparison
:: ============================================================
echo [7/7] Saving package-lock.json snapshots for next deploy...
if not exist "%SERVER%\current-locks" mkdir "%SERVER%\current-locks"
copy "%PROJECT%\erp\backend\package-lock.json" "%SERVER%\current-locks\backend-package-lock.json" >nul
copy "%PROJECT%\erp\frontend\package-lock.json" "%SERVER%\current-locks\frontend-package-lock.json" >nul

:: ============================================================
:: Summary and next steps
:: ============================================================
echo.
echo ============================================================
echo  %REV_LABEL% deploy complete
echo  Release at: %RELEASE%
echo ============================================================
echo.
if "%BACKEND_NM%"=="SKIP" echo  [!] Backend node_modules SKIPPED — create junction link on server
if "%FRONTEND_NM%"=="SKIP" echo  [!] Frontend node_modules SKIPPED — create junction link on server
echo.
echo  Next steps (RDP into server):
echo.
echo  1. Backup:
echo     "C:\Program Files\PostgreSQL\16\bin\pg_dump" -U postgres -d erp_production -F c -f "C:\erp-backups\pre-%REV_LABEL%.dump"
echo.
echo  2. Stop services:
echo     net stop erp-frontend ^& net stop erp-backend
echo.
echo  3. Switch release:
echo     cd /d C:\apps\erp
echo     if exist previous-backup (rmdir /s /q previous-backup)
echo     if exist previous (rename previous previous-backup)
echo     rename current previous
echo     move C:\erp-deploy\releases\%REV% current
echo.
if "%BACKEND_NM%"=="SKIP" (
echo  4. Create backend node_modules junction:
echo     mklink /J current\backend\node_modules previous\backend\node_modules
echo.
)
if "%FRONTEND_NM%"=="SKIP" (
echo  5. Create frontend node_modules junction:
echo     mklink /J current\frontend\node_modules previous\frontend\node_modules
echo.
)
echo  6. Copy env files:
echo     copy shared\.env.backend current\backend\.env
echo     copy shared\.env.frontend current\frontend\.env
echo     copy shared\web.config current\frontend\web.config
echo.
echo  7. Start services:
echo     net start erp-backend ^& net start erp-frontend
echo     if exist previous-backup (rmdir /s /q previous-backup)
echo.
echo  8. Verify:
echo     sc query erp-backend ^| find "RUNNING"
echo     sc query erp-frontend ^| find "RUNNING"
echo     curl http://127.0.0.1:3002/api/health
echo.
endlocal
