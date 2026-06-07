@echo off
REM ============================================
REM  DAICHU Packing Support - Rebuild Frontend
REM  Run this after updating frontend code
REM  (App.tsx, index.css, etc.)
REM ============================================

echo.
echo === Rebuilding frontend ===
echo.

cd /d "%~dp0frontend"
echo Building...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)

echo Copying to backend/static...
cd /d "%~dp0"
if exist "backend\static" rmdir /s /q "backend\static"
xcopy /e /i /y /q "frontend\dist" "backend\static" >nul

echo.
echo Done. Restart the server (start.bat) to apply.
echo.
pause
