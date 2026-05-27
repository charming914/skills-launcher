@echo off
setlocal
cd /d "%~dp0"

echo Starting AnythingLLM development services...
echo.
echo Frontend:  http://localhost:3000
echo Server:    http://localhost:3001
echo Collector: http://localhost:8888
echo.

start "AnythingLLM Server" cmd /k "cd /d %~dp0server && yarn dev"
start "AnythingLLM Frontend" cmd /k "cd /d %~dp0frontend && yarn dev"
start "AnythingLLM Collector" cmd /k "cd /d %~dp0collector && yarn dev"

echo Three service windows were opened.
echo You can close this launcher window now.

endlocal
