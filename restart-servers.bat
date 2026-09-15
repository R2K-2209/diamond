@echo off
echo ==============================================
echo Restarting Diamond Shield Servers...
echo ==============================================

echo Killing existing node and electron processes...
taskkill /F /IM electron.exe /T >nul 2>&1

echo Starting Dashboard Server...
start "Diamond Dashboard" cmd /c "cd diamond-dashboard && npm run dev"

echo Starting Browser Server...
start "Diamond Browser" cmd /c "cd diamond-browser && npm run dev"

echo Servers are starting in new command windows.
echo ==============================================
echo   - Local Dashboard (Laptop): http://localhost:3000
echo   - Mobile Dashboard (Phone): http://192.168.137.1:3000
echo ==============================================
pause
