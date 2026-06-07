@echo off
REM ============================================
REM  DAICHU Packing Support - Initial Setup
REM  Run this once on first install.
REM ============================================

echo.
echo === DAICHU Packing Support - Setup ===
echo.

REM --- Check Python ---
echo [1/5] Checking Python...
python --version 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Python not found.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)
echo       OK
echo.

REM --- Check Node.js ---
echo [2/5] Checking Node.js...
node --version 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Node.js not found.
    echo Please install Node.js 18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo       OK
echo.

REM --- Install Python dependencies ---
echo [3/5] Installing Python packages...
cd /d "%~dp0backend"
pip install fastapi uvicorn[standard] pdfplumber python-multipart websockets 2>nul
if errorlevel 1 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
)
echo       OK
echo.

REM --- Build frontend ---
echo [4/5] Building frontend (npm install + build)...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo ERROR: npm run build failed.
    pause
    exit /b 1
)
echo       OK
echo.

REM --- Copy build output to backend/static ---
echo [5/5] Copying build to backend/static...
cd /d "%~dp0"
if exist "backend\static" rmdir /s /q "backend\static"
xcopy /e /i /y /q "frontend\dist" "backend\static" >nul
if errorlevel 1 (
    echo ERROR: Copy failed.
    pause
    exit /b 1
)
echo       OK
echo.

REM --- Copy serve.py if not already there ---
if not exist "backend\serve.py" (
    echo Copying serve.py to backend...
    copy /y "deploy\serve.py" "backend\serve.py" >nul 2>nul
)

echo.
echo ============================================
echo  Setup complete!
echo.
echo  Next steps:
echo    1. Run firewall-open.bat as Administrator
echo       (only needed once)
echo    2. Run start.bat to launch the server
echo ============================================
echo.
pause
