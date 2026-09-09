@echo off
setlocal
cd /d "%~dp0\.."

if not exist ".env.local" (
  echo Missing .env.local in %cd%
  pause
  exit /b 1
)

echo Starting LAN attendance worker...
node --env-file=.env.local scripts/attendance-worker.cjs
pause
