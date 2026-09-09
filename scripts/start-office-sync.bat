@echo off
setlocal
cd /d "%~dp0\..\dist"

if not exist "attendance-worker.exe" (
  echo Missing %cd%\attendance-worker.exe. Run npm run attendance:build first.
  exit /b 1
)

if not exist ".env" (
  echo Missing %cd%\.env. Copy .env.example to .env and configure it first.
  exit /b 1
)

echo Starting packaged LAN attendance worker...
attendance-worker.exe
