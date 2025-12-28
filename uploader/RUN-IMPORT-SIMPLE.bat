@echo off
cd /d "%~dp0"

:menu
cls
echo.
echo ========================================
echo   IMPORT CSV TO SUPABASE
echo ========================================
echo.
echo   1. Zones                          (master_zona.csv)
echo   2. Principals                     (master_pincipal.csv)
echo   3. Products                       (master_product.csv)
echo   4. Prices                         (master_harga.csv)
echo   5. Product Groups                 (master_group.csv)
echo   6. Product Group Members          (master_group_member.csv)
echo   7. Bucket Members                 (master_bucket_member.csv)
echo   8. Product Group Availability     (master_group_availability.csv)
echo   9. Store Loyalty Classes          (master_loyalty_class.csv)
echo  10. Store Loyalty Availability      (master_loyalty_availability.csv)
echo  11. Principal Discount Tiers       (discon_principal_rule.csv)
echo  12. Group Promo                    (discon_strata_rule.csv)
echo  13. Bundle Promo                   (discon_paket_rule.csv)
echo  14. Invoice Discounts              (discon_invoice.csv)
echo  15. Free Product Promo             (promo_gratis_produk.csv)
echo  16. Promo Availability             (promo_availability.csv)
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
    echo ========================================
    echo Importing ALL steps...
    echo ========================================
    echo.
    "C:\Program Files\nodejs\node.exe" import-csv.js all
    if errorlevel 1 (
        echo.
        echo ERROR: Import failed!
        pause
        goto menu
    )
    echo.
    echo ========================================
    echo All imports completed successfully!
    echo ========================================
    pause
    goto menu
)

if "%choice%" GEQ "1" if "%choice%" LEQ "16" (
    echo.
    echo ========================================
    echo Importing step %choice%...
    echo ========================================
    echo.
    "C:\Program Files\nodejs\node.exe" import-csv.js %choice%
    if errorlevel 1 (
        echo.
        echo ERROR: Import failed!
        pause
        goto menu
    )
    echo.
    echo ========================================
    echo Import step %choice% completed successfully!
    echo ========================================
    pause
    goto menu
)

echo.
echo Invalid choice! Please select 1-16, A, or 0.
timeout /t 2 >nul
goto menu

