# =========================================================================
# SCRIPT DE DIAGNÓSTICO DO REGISTRO SIP NO ASTERISK
# =========================================================================
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "INSTRUCOES PARA VERIFICAR REGISTRO SIP NO ASTERISK" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para verificar se o seu ramal da Telefonia Facil registrou no Asterisk, execute os seguintes comandos no terminal do Linux/Asterisk:" -ForegroundColor White
Write-Host ""
Write-Host "1. Acessar o Console do Asterisk:" -ForegroundColor Yellow
Write-Host "   asterisk -rvvv" -ForegroundColor Green
Write-Host ""
Write-Host "2. Mostrar o status dos registros SIP ativos:" -ForegroundColor Yellow
Write-Host "   pjsip show registrations" -ForegroundColor Green
Write-Host ""
Write-Host "3. Mostrar o status dos endpoints SIP configurados:" -ForegroundColor Yellow
Write-Host "   pjsip show endpoints" -ForegroundColor Green
Write-Host ""
Write-Host "4. Se o registro falhou, verifique no console se ha erros de rede ou de autenticacao." -ForegroundColor Yellow
Write-Host "   Geralmente os erros de autenticacao aparecem com a mensagem '401 Unauthorized' ou 'Forbidden'." -ForegroundColor Yellow
Write-Host ""
Write-Host "DICA: O status ideal para a Telefonia Facil no comando 'pjsip show registrations' eh 'Registered'." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
