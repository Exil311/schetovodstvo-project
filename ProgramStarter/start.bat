@echo off

:: 1. Check if the script is being launched as a background worker
if "%~1"=="NPM_WORKER" goto npm_worker
if "%~1"=="PYTHON_WORKER" goto python_worker

:: ==========================================
:: MAIN SCRIPT (This runs first)
:: ==========================================
title DormsMaster Manager
cd /d "%~dp0.."

echo Starting background services...

:: Launch THIS exact script ("%~f0") in the background, but tell it to act as a worker
start /b "" "%~f0" NPM_WORKER
start /b "" "%~f0" PYTHON_WORKER

echo Waiting 5 seconds for servers to initialize...
timeout /t 5 >nul
start http://localhost:3000

echo.
echo --------------------------------------------------
echo Services are running. Browser launched at localhost:3000.
echo Close this window to stop monitoring.
echo --------------------------------------------------
pause >nul
exit /b


:: ==========================================
:: BACKGROUND WORKERS (These handle the loops)
:: ==========================================

:npm_worker
cd /d "%~dp0.."
:loop_npm
:: 'call' is required here because NPM is actually a batch script itself!
call npm start
echo [NPM] Stopped or crashed! Restarting in 2 seconds...
timeout /t 2 >nul
goto loop_npm

:python_worker
cd /d "%~dp0.."
:loop_py
py print-receipt.py
echo [Python] Stopped or crashed! Restarting in 2 seconds...
timeout /t 2 >nul
goto loop_py