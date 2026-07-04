# Servico local de Extracao WhatsApp Web

Este servico mantem a sessao do `whatsapp-web.js` viva fora da Vercel e expõe uma API HTTP simples para o CRM.

## Variaveis de ambiente

No Windows local:

- `WHATSAPP_EXTRACTION_SERVICE_HOST` - opcional, padrao `127.0.0.1`
- `WHATSAPP_EXTRACTION_SERVICE_PORT` - opcional, padrao `3011`
- `WHATSAPP_EXTRACTION_SERVICE_TOKEN` - recomendado quando o servico for exposto por tunnel
- `SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY`
- `WHATSAPP_WEB_CHROME_PATH` - opcional, se quiser forcar o executavel do Chrome/Edge

No CRM hospedado:

- `WHATSAPP_EXTRACTION_SERVICE_URL` - URL publica do servico local, por exemplo `https://seu-tunnel.exemplo.com`
- `WHATSAPP_EXTRACTION_SERVICE_TOKEN` - mesmo token configurado no servico local

No navegador do CRM hospedado:

- Tambem e possivel informar a URL publica e o token diretamente na tela `/clientes/extracao`
- Esses valores ficam salvos no `localStorage` do navegador atual
- Esse modo evita depender de variaveis de ambiente da Vercel para gerar o QR Code

## Subir no Windows

```bat
start-whatsapp-extraction-service.cmd
```

Ou:

```bat
npm run whatsapp-extraction-service
```

## Endpoints

- `GET /health`
- `GET /session`
- `POST /session/start`
- `DELETE /session`
- `POST /sync`

## Fluxo recomendado

1. Subir o servico local no Windows
2. Expor a porta por um tunnel confiavel
3. Configurar `WHATSAPP_EXTRACTION_SERVICE_URL` e `WHATSAPP_EXTRACTION_SERVICE_TOKEN` no CRM
4. Abrir `/clientes/extracao`
5. Gerar QR Code e sincronizar

## CORS

O servico local agora responde com CORS liberado para `GET`, `POST`, `DELETE` e `OPTIONS`, para que a tela hospedada
consiga falar diretamente com o tunnel HTTPS a partir do navegador.
