@echo off
cd /d "%~dp0"
echo Starting HTTP Server...
echo Server akan berjalan di: http://localhost:8080
echo Tekan Ctrl+C untuk menghentikan
echo.
npx --yes http-server -p 8080 -a localhost --cors
pause

