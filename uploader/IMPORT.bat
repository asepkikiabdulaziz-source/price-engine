@echo off
cd /d "%~dp0"
chcp 65001 >nul

:menu
cls
echo.
echo ========================================
echo   IMPORT CSV TO SUPABASE
echo ========================================
echo.
echo   1. Zones (master_zona.csv)
echo   2. Principals (master_pincipal.csv)
echo   3. Products (master_product.csv)
echo   4. Prices (master_harga.csv)
echo   5. Product Groups (master_group.csv)
echo   6. Product Group Members (master_group_member.csv)
echo   7. Bucket Members (master_bucket_member.csv)
echo   8. Product Group Availability (master_group_availability.csv)
echo   9. Store Loyalty Classes (master_loyalty_class.csv)
echo  10. Store Loyalty Availability (master_loyalty_availability.csv)
echo 10b. Store Loyalty Area Rules (master_loyalty_area_rules.csv)
echo  11. Principal Discount Tiers (discon_principal_rule.csv)
echo  12. Group Promo (discon_strata_rule.csv)
echo  13. Bundle Promo (discon_paket_rule.csv)
echo  14. Invoice Discounts (discon_invoice.csv)
echo  15. Free Product Promo (promo_gratis_produk.csv)
echo  16. Promo Availability (promo_availability.csv)
echo.
echo   A. Import ALL (semua steps)
echo   0. Exit
echo.
echo ========================================
echo.

set /p choice="Pilih step (1-16, 10b, A=all, 0=exit): "

if "%choice%"=="" goto menu
if "%choice%"=="0" goto end
if /i "%choice%"=="A" goto import_all
if "%choice%"=="1" goto import_step
if "%choice%"=="2" goto import_step
if "%choice%"=="3" goto import_step
if "%choice%"=="4" goto import_step
if "%choice%"=="5" goto import_step
if "%choice%"=="6" goto import_step
if "%choice%"=="7" goto import_step
if "%choice%"=="8" goto import_step
if "%choice%"=="9" goto import_step
if "%choice%"=="10" goto import_step
if /i "%choice%"=="10b" goto import_step
if "%choice%"=="11" goto import_step
if "%choice%"=="12" goto import_step
if "%choice%"=="13" goto import_step
if "%choice%"=="14" goto import_step
if "%choice%"=="15" goto import_step
if "%choice%"=="16" goto import_step

echo.
echo Invalid choice! Please try again.
timeout /t 2 >nul
goto menu

:import_step
echo.
echo ========================================
echo Running import step %choice%...
echo ========================================
echo.
"C:\Program Files\nodejs\node.exe" import-csv.js %choice%
if errorlevel 1 (
    echo.
    echo ========================================
    echo ERROR: Import failed!
    echo ========================================
    pause
    goto menu
) else (
    echo.
    echo ========================================
    echo Import step %choice% completed!
    echo ========================================
    pause
    goto menu
)

:import_all
echo.
echo ========================================
echo Running import ALL steps...
echo ========================================
echo.
"C:\Program Files\nodejs\node.exe" import-csv.js all
if errorlevel 1 (
    echo.
    echo ========================================
    echo ERROR: Import failed!
    echo ========================================
    pause
    goto menu
) else (
    echo.
    echo ========================================
    echo All imports completed!
    echo ========================================
    pause
    goto menu
)

:end
echo.
echo Exiting...
exit /b 0

