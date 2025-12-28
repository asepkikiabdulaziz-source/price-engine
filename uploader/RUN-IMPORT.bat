@echo off
cd /d "%~dp0"

echo.
echo ========================================
echo Import CSV to Supabase - Step by Step
echo ========================================
echo.

if "%1"=="" (
    echo Usage: RUN-IMPORT.bat [step_number^|all]
    echo.
    echo Examples:
    echo   RUN-IMPORT.bat         Show list of steps
    echo   RUN-IMPORT.bat 1       Import step 1 (zones)
    echo   RUN-IMPORT.bat all     Import all steps
    echo.
    "C:\Program Files\nodejs\node.exe" import-csv.js
    if errorlevel 1 (
        echo.
        echo ERROR: Import failed!
        pause
        exit /b 1
    )
) else (
    echo Running step: %1
    echo.
    "C:\Program Files\nodejs\node.exe" import-csv.js %1
    if errorlevel 1 (
        echo.
        echo ERROR: Import failed!
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo Import completed!
echo ========================================
pause

