@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example. Add SMTP settings before using email alerts.
)

call npm install
if errorlevel 1 goto :error
call npx playwright install chromium
if errorlevel 1 goto :error
call npm start
exit /b 0

:error
echo Setup failed. Review the message above.
pause
exit /b 1
