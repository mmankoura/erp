@echo off
setlocal

:: ============================================================
:: ERP Release Switch Script (run on server as Administrator)
::
:: Usage:   switch-release.bat 2026-04-10_001
::          switch-release.bat 2026-04-10_001 --link-nm
::
:: Args:    %1 = Release folder name (must exist in C:\erp-deploy\releases\)
::          %2 = --link-nm (create junction links for node_modules
::               from previous release instead of expecting copied ones)
:: ============================================================

set REV=%~1
set LINK_NM=%~2

if "%REV%"=="" (
    echo Usage: switch-release.bat RELEASE-FOLDER [--link-nm]
    echo Example: switch-release.bat 2026-04-10_001 --link-nm
    exit /b 1
)

set STAGING=C:\erp-deploy\releases\%REV%
set APP=C:\apps\erp

:: Verify release exists in staging
if not exist "%STAGING%\backend\dist\main.js" (
    echo ERROR: %STAGING%\backend\dist\main.js not found
    echo Run the deploy script from your dev machine first.
    exit /b 1
)
if not exist "%STAGING%\frontend\.next\BUILD_ID" (
    echo ERROR: %STAGING%\frontend\.next\BUILD_ID not found
    echo Run the deploy script from your dev machine first.
    exit /b 1
)

echo.
echo ============================================================
echo  Switching to release: %REV%
if "%LINK_NM%"=="--link-nm" echo  Mode: Junction links for node_modules
if not "%LINK_NM%"=="--link-nm" echo  Mode: Full copy (node_modules included in release)
echo ============================================================
echo.
echo  This will:
echo    - Stop erp-frontend and erp-backend services
echo    - Move current release to 'previous' (for rollback)
echo    - Activate the new release
echo    - Copy env files and web.config
echo    - Start services
echo.
pause

:: Step 1: Stop services. "net stop" can return before the process fully
:: releases its file handles on current\, which made the rotate below fail
:: with "Access is denied" in REV-006. WAIT until both report STOPPED.
echo.
echo [1/6] Stopping services...
net stop erp-frontend 2>nul
net stop erp-backend 2>nul

echo     Waiting for services to fully stop...
set /a _tries=0
:wait_stopped
sc query erp-backend | find "STOPPED" >nul
if errorlevel 1 goto :still_running
sc query erp-frontend | find "STOPPED" >nul
if errorlevel 1 goto :still_running
goto :stopped
:still_running
set /a _tries+=1
if %_tries% GEQ 15 (
    echo FAILED: services did not report STOPPED within ~30s. Aborting before rotate.
    echo        Nothing was moved. Investigate the file lock, then retry.
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto :wait_stopped
:stopped
echo     Services stopped.

:: Step 2: Rotate releases. ABORT on any failed rename — silently continuing
:: past a failed rotate is what consumed the previous\ rollback target in REV-006.
echo [2/6] Rotating releases...
cd /d %APP%
if exist previous-backup (rmdir /s /q previous-backup)
if exist previous (
    rename previous previous-backup
    if errorlevel 1 (
        echo FAILED: could not rename previous -^> previous-backup. Aborting, no changes made.
        net start erp-backend
        net start erp-frontend
        exit /b 1
    )
)
rename current previous
if errorlevel 1 (
    echo FAILED: could not rename current -^> previous ^(file lock?^). Aborting.
    if exist previous-backup rename previous-backup previous
    net start erp-backend
    net start erp-frontend
    exit /b 1
)

:: Step 3: Move new release into place
echo [3/6] Activating new release...
move "%STAGING%" "%APP%\current"
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: Could not move release. Rolling back...
    rename previous current
    net start erp-backend
    net start erp-frontend
    exit /b 1
)

:: Step 4: Junction links for node_modules (if requested)
if "%LINK_NM%"=="--link-nm" (
    echo [4/6] Creating node_modules junction links...
    if not exist current\backend\node_modules (
        mklink /J current\backend\node_modules previous\backend\node_modules
        if !ERRORLEVEL! NEQ 0 (
            echo WARNING: Backend junction link failed. Falling back...
        ) else (
            echo     Backend: linked to previous\backend\node_modules
        )
    ) else (
        echo     Backend: node_modules already exists, skipping junction
    )
    if not exist current\frontend\node_modules (
        mklink /J current\frontend\node_modules previous\frontend\node_modules
        if !ERRORLEVEL! NEQ 0 (
            echo WARNING: Frontend junction link failed. Falling back...
        ) else (
            echo     Frontend: linked to previous\frontend\node_modules
        )
    ) else (
        echo     Frontend: node_modules already exists, skipping junction
    )
) else (
    echo [4/6] Node_modules included in release, no junction needed.
)

:: Step 5: Copy persistent files
echo [5/6] Copying env files...
copy shared\.env.backend current\backend\.env >nul
copy shared\.env.frontend current\frontend\.env >nul
copy shared\web.config current\frontend\web.config >nul

:: Verify env files
if not exist current\backend\.env (
    echo WARNING: backend .env not copied!
)
if not exist current\frontend\.env (
    echo WARNING: frontend .env not copied!
)

:: Step 6: Start services
echo [6/6] Starting services...
net start erp-backend
net start erp-frontend

:: Cleanup
if exist previous-backup (rmdir /s /q previous-backup)

:: Verify
echo.
echo ============================================================
echo  Verifying...
echo ============================================================
timeout /t 5 /nobreak >nul

sc query erp-backend | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo  [OK] erp-backend is RUNNING
) else (
    echo  [!!] erp-backend is NOT RUNNING — check C:\apps\erp\logs\backend-error.log
)

sc query erp-frontend | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo  [OK] erp-frontend is RUNNING
) else (
    echo  [!!] erp-frontend is NOT RUNNING — check C:\apps\erp\logs\frontend-error.log
)

echo.
curl -s http://127.0.0.1:3002/api/health
echo.
echo.
echo  If all OK, test from workstation: http://erp.atacanada.ca
echo  To rollback: rename current broken ^& rename previous current ^& net start erp-backend ^& net start erp-frontend
echo.
endlocal
