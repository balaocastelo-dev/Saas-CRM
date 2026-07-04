@echo off
setlocal

cd /d "%~dp0"

if "%WHATSAPP_EXTRACTION_SERVICE_HOST%"=="" set "WHATSAPP_EXTRACTION_SERVICE_HOST=127.0.0.1"
if "%WHATSAPP_EXTRACTION_SERVICE_PORT%"=="" set "WHATSAPP_EXTRACTION_SERVICE_PORT=3011"

echo [WhatsApp Extraction Service] Iniciando em http://%WHATSAPP_EXTRACTION_SERVICE_HOST%:%WHATSAPP_EXTRACTION_SERVICE_PORT%
call npm run whatsapp-extraction-service

endlocal
