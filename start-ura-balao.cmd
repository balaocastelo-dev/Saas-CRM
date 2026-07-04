@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0apps\ura-balao\scripts\rodar-painel.ps1"
endlocal
