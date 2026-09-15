#!/bin/bash
echo "=============================================="
echo "Restarting Diamond Shield Servers..."
echo "=============================================="

echo "Killing existing node and electron processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
pkill -f electron 2>/dev/null

echo "Starting Dashboard Server..."
cd diamond-dashboard && npm run dev &
DASHBOARD_PID=$!
cd ..

echo "Starting Browser Server..."
cd diamond-browser && npm run dev &
BROWSER_PID=$!
cd ..

echo "Servers are starting in the background."
echo "=============================================="
echo "  - Local Dashboard (Laptop): http://localhost:3000"
echo "=============================================="

wait $DASHBOARD_PID $BROWSER_PID
