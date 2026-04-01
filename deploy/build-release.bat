@echo off
setlocal

:: ============================================================
:: ERP Release Build Script (run from project root on dev machine)
:: Dry-run tested: March 27, 2026
::
:: Usage: Place this script in the project root and double-click,
::        or run from Command Prompt: deploy\build-release.bat
::
:: Prerequisites:
::   - Node.js LTS installed
::   - Server share \\erp.company.local\erp-deploy accessible
::   - Backend and frontend dev servers stopped
:: ============================================================

:: Configuration — adjust these for your environment
set SERVER_SHARE=\\10.12.1.47\erp-deploy
set PROJECT_ROOT=%~dp0..
set BACKEND_DIR=%PROJECT_ROOT%\erp\backend
set FRONTEND_DIR=%PROJECT_ROOT%\erp\frontend

:: Generate release name
:: NOTE: %date% parsing is locale-sensitive on Windows.
:: Run "echo %date%" to check format. Adjust offsets if not MM/DD/YYYY.
set RELEASE_NAME=%date:~-4%-%date:~4,2%-%date:~7,2%_001

echo ============================================================
echo   ERP Release Build: %RELEASE_NAME%
echo   Project root: %PROJECT_ROOT%
echo ============================================================
echo.

:: Verify project structure
if not exist "%BACKEND_DIR%\package.json" (
    echo ERROR: Backend not found at %BACKEND_DIR%
    echo Make sure this script is in the deploy\ folder of the project root.
    exit /b 1
)
if not exist "%FRONTEND_DIR%\package.json" (
    echo ERROR: Frontend not found at %FRONTEND_DIR%
    exit /b 1
)

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

:: Verify build outputs
if not exist "%BACKEND_DIR%\dist\main.js" (
    echo ERROR: Backend build output missing (dist\main.js)
    exit /b 1
)
if not exist "%FRONTEND_DIR%\.next\BUILD_ID" (
    echo ERROR: Frontend build output missing (.next\BUILD_ID)
    exit /b 1
)

:: Step 4: Copy to server
echo.
echo Copying to server share: %SERVER_SHARE%\releases\%RELEASE_NAME%
set RELEASE_DIR=%SERVER_SHARE%\releases\%RELEASE_NAME%

echo   Copying backend dist...
robocopy "%BACKEND_DIR%\dist" "%RELEASE_DIR%\backend\dist" /E /NP /NFL /NDL
echo   Copying backend node_modules...
robocopy "%BACKEND_DIR%\node_modules" "%RELEASE_DIR%\backend\node_modules" /E /NP /NFL /NDL
copy "%BACKEND_DIR%\package.json" "%RELEASE_DIR%\backend\" >nul

echo   Copying frontend .next...
robocopy "%FRONTEND_DIR%\.next" "%RELEASE_DIR%\frontend\.next" /E /NP /NFL /NDL
echo   Copying frontend node_modules...
robocopy "%FRONTEND_DIR%\node_modules" "%RELEASE_DIR%\frontend\node_modules" /E /NP /NFL /NDL
echo   Copying frontend public...
robocopy "%FRONTEND_DIR%\public" "%RELEASE_DIR%\frontend\public" /E /NP /NFL /NDL
copy "%FRONTEND_DIR%\package.json" "%RELEASE_DIR%\frontend\" >nul

echo.
echo ============================================================
echo   Release %RELEASE_NAME% built and copied to server
echo ============================================================
echo.
echo Next: RDP into server and run deploy\switch-release.bat
echo   or follow the switch procedure in DEPLOYMENT_PLAN.md Section 7.6
echo.
endlocal
