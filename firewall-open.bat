@echo off
REM ============================================
REM  DAICHU Packing Support - Firewall Setup
REM  Run this ONCE as Administrator.
REM  Right-click -> "Run as administrator"
REM ============================================

echo.
echo Adding firewall rule for port 8000...
echo.

netsh advfirewall firewall add rule name="DAICHU Packing Support" dir=in action=allow protocol=TCP localport=8000

if errorlevel 1 (
    echo.
    echo ERROR: Failed to add firewall rule.
    echo Please right-click this file and select
    echo "Run as administrator".
    echo.
) else (
    echo.
    echo Firewall rule added successfully.
    echo iPad can now connect to this PC on port 8000.
    echo.
)

pause
