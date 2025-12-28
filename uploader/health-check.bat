@echo off
REM Database Health Check Script for Windows
REM Run this daily to check system health

set DB_NAME=nabaticuan
set DB_USER=postgres
set REPORT_FILE=health_report_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.txt
set REPORT_FILE=%REPORT_FILE: =0%

echo ================================== > %REPORT_FILE%
echo Database Health Check Report >> %REPORT_FILE%
echo Date: %date% %time% >> %REPORT_FILE%
echo ================================== >> %REPORT_FILE%
echo. >> %REPORT_FILE%

REM 1. Check expired promotions
echo 1. EXPIRED PROMOTIONS (should be inactive): >> %REPORT_FILE%
psql -U %DB_USER% -d %DB_NAME% -t -c "SELECT code, name, valid_until, is_active FROM promotions WHERE is_active = true AND valid_until < CURRENT_DATE;" >> %REPORT_FILE%
echo. >> %REPORT_FILE%

REM 2. Check products without prices
echo 2. PRODUCTS WITHOUT PRICES: >> %REPORT_FILE%
psql -U %DB_USER% -d %DB_NAME% -t -c "SELECT p.code, p.name FROM products p WHERE p.is_active = true AND NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id);" >> %REPORT_FILE%
echo. >> %REPORT_FILE%

REM 3. Database size
echo 3. DATABASE SIZE: >> %REPORT_FILE%
psql -U %DB_USER% -d %DB_NAME% -t -c "SELECT pg_size_pretty(pg_database_size('%DB_NAME%')) AS db_size;" >> %REPORT_FILE%
echo. >> %REPORT_FILE%

REM 4. Active promotions count
echo 4. ACTIVE PROMOTIONS BY TYPE: >> %REPORT_FILE%
psql -U %DB_USER% -d %DB_NAME% -t -c "SELECT promo_type, COUNT(*) AS total FROM promotions WHERE is_active = true AND CURRENT_DATE BETWEEN valid_from AND COALESCE(valid_until, '9999-12-31') GROUP BY promo_type ORDER BY promo_type;" >> %REPORT_FILE%
echo. >> %REPORT_FILE%

echo ================================== >> %REPORT_FILE%
echo Health check completed! >> %REPORT_FILE%
echo ================================== >> %REPORT_FILE%

REM Display report
type %REPORT_FILE%

echo.
echo Health check report saved to: %REPORT_FILE%
echo.

REM Ask if should fix expired promotions
set /p answer=Do you want to deactivate expired promotions? (y/n): 

if /i "%answer%"=="y" (
    psql -U %DB_USER% -d %DB_NAME% -c "UPDATE promotions SET is_active = false, updated_at = NOW() WHERE is_active = true AND valid_until < CURRENT_DATE;"
    echo Expired promotions deactivated!
)

echo.
echo Refreshing materialized views...
psql -U %DB_USER% -d %DB_NAME% -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_availability_by_depo;"
echo Materialized views refreshed!

pause
