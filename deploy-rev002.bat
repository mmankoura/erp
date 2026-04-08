@echo off
setlocal

:: ============================================================
:: REV-002 — 2026-04-07
:: PO numbering + MRP shortage Excel fix
:: ============================================================
set REV=2026-04-07_001
set SERVER=\\10.12.1.47\erp-deploy
set PROJECT=C:\Users\mark.mankoura\Documents\projects\erp

set RELEASE=%SERVER%\releases\%REV%

echo.
echo === Deploying REV-002 (%REV%) to server ===
echo === Target: %RELEASE% ===
echo.
pause

echo [1/6] Backend dist...
robocopy "%PROJECT%\erp\backend\dist" "%RELEASE%\backend\dist" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: backend dist copy & exit /b 1)

echo [2/6] Backend node_modules...
robocopy "%PROJECT%\erp\backend\node_modules" "%RELEASE%\backend\node_modules" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: backend node_modules copy & exit /b 1)

echo [3/6] Backend package.json...
copy "%PROJECT%\erp\backend\package.json" "%RELEASE%\backend\" >nul
if %ERRORLEVEL% NEQ 0 (echo FAILED: backend package.json copy & exit /b 1)

echo [4/6] Frontend .next...
robocopy "%PROJECT%\erp\frontend\.next" "%RELEASE%\frontend\.next" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: frontend .next copy & exit /b 1)

echo [5/6] Frontend node_modules...
robocopy "%PROJECT%\erp\frontend\node_modules" "%RELEASE%\frontend\node_modules" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: frontend node_modules copy & exit /b 1)

echo [6/6] Frontend public + package.json...
robocopy "%PROJECT%\erp\frontend\public" "%RELEASE%\frontend\public" /E /NP /NFL /NDL
if %ERRORLEVEL% GEQ 8 (echo FAILED: frontend public copy & exit /b 1)
copy "%PROJECT%\erp\frontend\package.json" "%RELEASE%\frontend\" >nul
if %ERRORLEVEL% NEQ 0 (echo FAILED: frontend package.json copy & exit /b 1)

echo.
echo === REV-002 copy complete ===
echo.
echo Release staged at: %RELEASE%
echo.
echo Next steps (RDP into server):
echo   1. pg_dump backup:  "C:\Program Files\PostgreSQL\16\bin\pg_dump" -U postgres -d erp_production -F c -f "C:\erp-backups\pre-rev002.dump"
echo   2. Switch release:  cd /d C:\apps\erp
echo                       rename current previous
echo                       rename releases\%REV% current
echo                       copy shared\.env.backend current\backend\.env
echo                       copy shared\.env.frontend current\frontend\.env
echo                       copy shared\web.config current\frontend\web.config
echo                       net stop erp-frontend ^&^& net stop erp-backend ^&^& net start erp-backend ^&^& net start erp-frontend
echo   3. Verify:          curl http://127.0.0.1:3002/api/health
echo.
endlocal
