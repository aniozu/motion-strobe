@echo off
setlocal
cd /d "%~dp0"
set "SITE_URL=https://aniozu.github.io/motion-strobe"
echo Building pages with SITE_URL=%SITE_URL%
call npm run build
if errorlevel 1 goto failed
echo Testing generated pages...
call npm test
if errorlevel 1 goto failed
echo.
echo SUCCESS: build and tests passed.
pause
exit /b 0
:failed
echo.
echo FAILED: Copy the error and send it to ChatGPT.
pause
exit /b 1
