@echo off
setlocal enabledelayedexpansion
title Omnisage
color 0A

:: =====================================================================
::  OMNISAGE - single one-click launcher
::  - Rebuilds the website fresh every run (no stale-build surprises)
::  - Serves the whole app (frontend + API) from ONE server on
::    http://localhost:8000  -- no admin rights, no hosts-file edits,
::    no port 80 needed.
::  - The server runs in its own VISIBLE window titled "Omnisage Server"
::    so if anything goes wrong, you see the real error immediately
::    instead of a blank/404 page with no explanation.
::
::  Usage:
::    "Start Omnisage.bat"          start everything and open the app
::    "Start Omnisage.bat" stop     stop the running app
:: =====================================================================

cd /d "%~dp0"

if /i "%~1"=="stop" goto :STOP

echo.
echo  ============================================
echo   OMNISAGE - starting...
echo  ============================================
echo.

:: ---- STEP 1: find Node.js ----
set "NODE_DIR="
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_DIR=C:\Program Files\nodejs\"
) else if exist "%~dp0.node\node-v22.18.0-win-x64\node.exe" (
    set "NODE_DIR=%~dp0.node\node-v22.18.0-win-x64\"
) else if exist "C:\Users\ashra\nodejs\node-v22.16.0-win-x64\node.exe" (
    set "NODE_DIR=C:\Users\ashra\nodejs\node-v22.16.0-win-x64\"
)
if not defined NODE_DIR (
    echo [FAIL] Node.js not found. Install it from https://nodejs.org
    pause
    exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
echo [OK] Node.js found

:: ---- STEP 2: verify the Python venv exists ----
if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo [FAIL] Python venv not found.
    echo        Create it once with:
    echo            python -m venv backend\venv
    echo            backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    pause
    exit /b 1
)
echo [OK] Python environment found

:: ---- STEP 3: clear port 8000 of any old Omnisage process ----
echo [WAIT] Clearing port 8000 of any previous Omnisage run...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo         Stopping old process %%a...
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo [OK] Port 8000 is free

:: ---- STEP 4: install frontend deps if missing, then ALWAYS rebuild ----
:: Always rebuilding (instead of guessing whether the build is "fresh
:: enough") is what avoids the class of bug where an old build silently
:: keeps serving stale code. It only takes a few seconds.
if not exist "%~dp0frontend\node_modules" (
    echo [BUILD] Installing frontend packages - first run only, can take a few minutes...
    pushd "%~dp0frontend"
    call "%NODE_DIR%npm.cmd" install
    popd
)
echo [BUILD] Building the website...
pushd "%~dp0frontend"
call "%NODE_DIR%npm.cmd" run build
popd
if not exist "%~dp0frontend\dist\index.html" (
    echo [FAIL] Website build failed. See the messages above for the real error.
    pause
    exit /b 1
)
echo [OK] Website built

:: ---- STEP 5: start Ollama if installed (optional, only powers AI features) ----
where ollama >nul 2>&1
if %errorlevel% equ 0 (
    echo [AI] Starting Ollama...
    start /min "" ollama serve
    timeout /t 2 /nobreak >nul
) else (
    echo [SKIP] Ollama not installed - AI features will be unavailable, everything else still works
)

:: ---- STEP 6: start the Omnisage server in its OWN VISIBLE window ----
:: Using cmd /k (not /min, not silently piped to a log file) means that if
:: the server crashes or errors, you see the real Python traceback right
:: there instead of a mysterious blank page in the browser.
echo [RUN] Starting the Omnisage server...
start "Omnisage Server  -  closing this window stops the app" cmd /k ""%~dp0backend\venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

echo [WAIT] Waiting for the app to become ready...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ try{ $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; if($r.StatusCode -eq 200){ $ok=$true; break } }catch{}; Start-Sleep -Seconds 1 }; if($ok){exit 0}else{exit 1}"
if %errorlevel% neq 0 (
    echo [FAIL] The server did not come up in time.
    echo        Look at the "Omnisage Server" window that opened - it has the real error.
    pause
    exit /b 1
)

:: ---- STEP 7: keep a searchable "Omnisage" shortcut up to date ----
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; foreach($dir in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('Desktop'))){ $lnk=Join-Path $dir 'Omnisage.lnk'; $s=$ws.CreateShortcut($lnk); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,13'; $s.Description='Open Omnisage'; $s.Save() }" >nul 2>&1

echo.
echo  ============================================
echo   OMNISAGE IS RUNNING
echo  ============================================
echo.
echo   Open it any time at:   http://localhost:8000
echo   (or search "Omnisage" in the Windows Start menu / Desktop shortcut)
echo.
echo   IMPORTANT: the "Omnisage Server" window that just opened IS the
echo   app running. Leave it open while you use Omnisage. Closing it
echo   stops the app. You can minimize it, just don't close it.
echo.
echo   To stop the app from here instead, run:  "Start Omnisage.bat" stop
echo.
start http://localhost:8000

echo  This launcher window can be closed now - the server window is separate.
pause >nul
exit /b 0

:STOP
echo.
echo  Stopping Omnisage...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
echo  [x] Omnisage server stopped.
echo  (Ollama, if it was running, is left running.)
timeout /t 2 /nobreak >nul
exit /b 0
