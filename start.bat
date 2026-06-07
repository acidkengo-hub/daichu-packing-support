@echo off
REM ============================================
REM  DAICHU Packing Support - Start Server
REM  Double-click this to launch.
REM ============================================

cd /d "%~dp0backend"

REM --- Check that static dir exists ---
if not exist "static\index.html" (
    echo.
    echo ERROR: Frontend not built yet.
    echo Please run setup.bat first.
    echo.
    pause
    exit /b 1
)

REM --- Check serve.py exists ---
if not exist "serve.py" (
    echo.
    echo ERROR: serve.py not found in backend directory.
    echo Please copy deploy\serve.py to backend\serve.py
    echo.
    pause
    exit /b 1
)

python serve.py

pause
