@echo off
setlocal
title LLM Wiki Server Process

echo =======================================================
echo          LLM Wiki Manager - Bootstrapper
echo =======================================================
echo.

:: 1. Navigate to the project directory
cd /d "C:\Users\tube1\Projects\LLM WIKI"

:: 2. Check and Setup Local Environment
node scripts/setup-env.js
if %errorlevel% neq 0 (
    echo.
    echo Setup canceled. Closing in 5 seconds...
    timeout /t 5 >nul
    exit
)

echo.
echo Starting the local LLM Wiki Node Server...
echo.

:: 3. Start the dev server in the background using start /b or a new minimized window
start /min cmd /c "title LLM-WIKI-SERVER & npm run dev:cloud"

:: 4. Give the server a few seconds to boot
echo Server initialized. Waiting 10 seconds for Vercel CLI to compile...
timeout /t 10 /nobreak >nul

:: 5. Launch exactly as a Chrome App
echo Launching the Dashboard (Port 3005)...
start chrome --app=http://localhost:3005/

echo =======================================================
echo Dashboard launched! You can close this console window.
echo (The server is running minimized in the background)
echo =======================================================
timeout /t 2 >nul
exit
