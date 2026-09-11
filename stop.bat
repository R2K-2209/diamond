@echo off
title Diamond Ecosystem - Stop All Services

echo ========================================================
echo       💎 Diamond Parental Control Ecosystem 💎
echo               Stopping All Services...
echo ========================================================
echo.

:: Stop Electron
powershell -NoProfile -Command "Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Stop-Process -Force"

:: Free port 3000 (Next.js dashboard)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Free port 5173 (Vite dev server)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo All Diamond processes and ports have been released.
echo.
timeout /t 3 >nul
