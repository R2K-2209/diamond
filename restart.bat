@echo off
setlocal enabledelayedexpansion
title Diamond Ecosystem - Restart Services

echo ========================================================
echo       💎 Diamond Parental Control Ecosystem 💎
echo               Restarting All Services...
echo ========================================================
echo.

echo [1/3] Stopping previous instances of Browser and Dashboard...

:: Stop any running Electron processes
powershell -NoProfile -Command "Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Stop-Process -Force"

:: Free port 3000 (Next.js dashboard)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Free port 5173 (Vite dev server)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo Previous processes stopped successfully.
echo.

echo [2/3] Starting Diamond Dashboard (Next.js on http://192.168.137.1:3000)...
start "Diamond Dashboard (Port 3000)" cmd /k "cd /d \"%~dp0diamond-dashboard\" && npm run dev"

echo Waiting 3 seconds for dashboard initialization...
timeout /t 3 /nobreak >nul

echo [3/3] Starting Diamond Browser (Electron Shield)...
start "Diamond Browser (Electron)" cmd /k "cd /d \"%~dp0diamond-browser\" && npm run dev"

echo.
echo ========================================================
echo   💎 Diamond Ecosystem restarted successfully!
echo.
echo   - Local Dashboard (Laptop): http://localhost:3000
echo   - Mobile Dashboard (Phone): http://192.168.137.1:3000
echo   - Browser App:  Running in Electron Window
echo ========================================================
echo.
echo This window will close in 5 seconds...
timeout /t 5 >nul
