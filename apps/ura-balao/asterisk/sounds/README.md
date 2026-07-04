# Arquivos de Áudio para a URA Ativa do Balão

Para o funcionamento correto da URA Ativa, os áudios gravados devem ser copiados para a pasta de sons padrão do Asterisk, geralmente:
`/var/lib/asterisk/sounds/` (ou na subpasta correspondente ao idioma, ex: `/var/lib/asterisk/sounds/pt_BR/`).

## Formato do Áudio Exigido pelo Asterisk
O Asterisk exige áudios em formato específico para evitar consumo desnecessário de CPU com transcodificação:
- **Formato:** WAV (PCM de 16 bits sem compressão)
- **Canais:** Mono (1 canal)
- **Taxa de Amostragem:** 8000 Hz (8kHz)

Você pode usar o script em `scripts/gerar-audio.ps1` para converter seus áudios gravados (.mp3, .wav de alta qualidade, etc.) para o formato correto.

## Lista de Áudios Necessários

1. **`ura-balao-intro.wav`**
   - *Texto sugerido:* "Olá, aqui é o Balão da Informática Castelo. Estamos ligando sobre:"

2. **Áudios de Motivos (deve corresponder ao campo `motivo` ou variável `MOTIVO_AUDIO`):**
   - **`ura-balao-motivo-assistencia.wav`** -> *Texto:* "a sua assistência técnica ou garantia."
   - **`ura-balao-motivo-orcamento.wav`** -> *Texto:* "o orçamento solicitado."
   - **`ura-balao-motivo-cobranca.wav`** -> *Texto:* "um lembrete de cobrança ou vencimento."
   - **`ura-balao-motivo-posvenda.wav`** -> *Texto:* "nossa pesquisa de pós-venda."
   - **`ura-balao-motivo-entrega.wav`** -> *Texto:* "a entrega do seu produto."

3. **`ura-balao-opcoes.wav`**
   - *Texto sugerido:* "Digite 1 para falar com um atendente. Digite 2 para receber atendimento pelo WhatsApp. Digite 9 para não receber mais ligações."

4. **`ura-balao-atendente.wav`**
   - *Texto sugerido:* "Perfeito. Um atendente do Balão da Informática vai falar com você."

5. **`ura-balao-whatsapp.wav`**
   - *Texto sugerido:* "Perfeito. Vamos te chamar pelo WhatsApp."

6. **`ura-balao-bloqueado.wav`**
   - *Texto sugerido:* "Tudo bem. Seu número foi removido da nossa lista de chamadas."

7. **`ura-balao-timeout.wav`**
   - *Texto sugerido:* "Não recebemos sua resposta. Obrigado."

8. **`ura-balao-invalido.wav`**
   - *Texto sugerido:* "Opção inválida. Obrigado."
