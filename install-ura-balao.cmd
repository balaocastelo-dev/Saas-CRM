@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0apps\ura-balao\scripts\instalar.ps1"
endlocal
