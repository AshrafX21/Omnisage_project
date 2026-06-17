@echo off
setlocal enabledelayedexpansion
title Omnisage - Starting All Services
color 0A

echo.
echo  ============================================
echo   OMNISAGE - Medical Record Aggregator
echo   Starting all services...
echo  ============================================
echo.

cd /d "%~dp0"

:: ============================================
:: STEP 1: Find Node.js
:: ============================================
set "NODE_DIR="
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_DIR=C:\Program Files\nodejs\"
) else if exist "%~dp0.node\node-v22.18.0-win-x64\node.exe" (
    set "NODE_DIR=%~dp0.node\node-v22.18.0-win-x64\"
) else if exist "C:\Users\ashra\nodejs\node-v22.16.0-win-x64\node.exe" (
    set "NODE_DIR=C:\Users\ashra\nodejs\node-v22.16.0-win-x64\"
)

if not defined NODE_DIR (
    echo [FAIL] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
echo [OK] Node.js found

:: ============================================
:: STEP 2: Verify Python venv
:: ============================================
if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo [FAIL] Python venv not found. Run: python -m venv backend\venv
    pause
    exit /b 1
)
echo [OK] Python venv found

:: ============================================
:: STEP 3: Install frontend deps if needed
:: ============================================
if not exist "%~dp0frontend\node_modules" (
    echo [WAIT] Installing frontend dependencies...
    cd /d "%~dp0frontend"
    "%NODE_DIR%npm.cmd" install
    cd /d "%~dp0"
)
echo [OK] Frontend dependencies ready
echo.

:: ============================================
:: STEP 4: Start Ollama
:: ============================================
where ollama >nul 2>&1
if %errorlevel% equ 0 (
    echo [1/3] Starting Ollama...
    start /min "" ollama serve
    timeout /t 3 /nobreak >nul
    echo       Ollama started
) else (
    echo [SKIP] Ollama not installed - AI features unavailable
)

:: ============================================
:: STEP 5: Start Backend
:: ============================================
echo [2/3] Starting Backend on port 8000...
start "Omnisage-Backend" /min "%~dp0backend\venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
timeout /t 5 /nobreak >nul
echo       Backend started

:: ============================================
:: STEP 6: Start Frontend
:: ============================================
echo [3/3] Starting Frontend on port 5173...
start "Omnisage-Frontend" /min "%NODE_DIR%node.exe" "%~dp0frontend\node_modules\vite\bin\vite.js"
timeout /t 4 /nobreak >nul
echo       Frontend started

:: ============================================
:: STEP 7: Open browser
:: ============================================
echo.
echo  ============================================
echo   ALL SERVICES STARTED!
echo  ============================================
echo.
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:8000
echo   API Docs:  http://localhost:8000/docs
echo.

timeout /t 2 /nobreak >nul
start http://localhost:5173

echo  Press any key to close this launcher.
echo  Services keep running in the background.
pause >nul
