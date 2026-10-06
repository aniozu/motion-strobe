@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto python
node serve.mjs
goto end
:python
where py >nul 2>nul
if errorlevel 1 goto missing
echo Open http://localhost:5173 in Chrome or Edge.
echo Stop: Ctrl+C
py -3 -m http.server 5173 --bind 127.0.0.1 --directory dist
goto end
:missing
echo Install Node.js 22 or later, then run this file again.
:end
pause
