@echo off
cd /d "%~dp0"

:menu
cls
echo.
echo ========================================
echo   IMPORT CSV TO SUPABASE
echo ========================================
echo.
echo   1. Zones
echo   2. Principals
echo   3. Products
echo   4. Prices
echo   5. Product Groups
echo   6. Product Group Members
echo   7. Bucket Members
echo   8. Product Group Availability
echo   9. Store Loyalty Classes
echo  10. Store Loyalty Availability
echo  11. Principal Discount Tiers
echo  12. Group Promo
echo  13. Bundle Promo
echo  14. Invoice Discounts
echo  15. Free Product Promo
echo  16. Promo Availability
echo.
echo   A. Import ALL steps
echo   0. Exit
echo.
echo ========================================
echo.

set /p choice="Pilih step (1-16, A=all, 0=exit): "

if "%choice%"=="" goto menu
if "%choice%"=="0" exit /b 0
if /i "%choice%"=="A" (
    echo.
    echo Importing ALL steps...
    echo.
    "C:\Program Files\nodejs\node.exe" import-csv.js all
    echo.
    pause
    goto menu
)

if "%choice%" GEQ "1" if "%choice%" LEQ "16" (
    echo.
    echo Importing step %choice%...
    echo.
    "C:\Program Files\nodejs\node.exe" import-csv.js %choice%
    echo.
    pause
    goto menu
)

echo Invalid choice!
timeout /t 2 >nul
goto menu

