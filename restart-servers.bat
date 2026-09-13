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
pause
