# URA-ATIVA-BALAO

> Este projeto foi incorporado ao repositório `Saas-CRM` em `apps/ura-balao`.
> O caminho recomendado agora e executar pela raiz do CRM usando:
>
> - `npm run ura:install`
> - `npm run ura:start`
> - `npm run ura:dev`
>
> Para Windows, use tambem:
>
> - `install-ura-balao.cmd`
> - `start-ura-balao.cmd`

Sistema de URA Ativa (Discador Automático com URA) integrado para o **Balão da Informática Castelo**, utilizando o ramal SIP da **Telefonia Fácil** e integração via AMI (Asterisk Manager Interface).

---

## 🚀 Como Funciona
O sistema realiza chamadas automáticas para clientes da lista de contatos, reproduz um áudio com o motivo personalizado da chamada (assistência, orçamento, cobrança, entrega, pós-venda) e coleta a resposta digitada no telefone (DTMF):
* **Tecla 1:** Redireciona para atendimento humano (salva como `PEDIU_ATENDENTE`).
* **Tecla 2:** Envia retorno via WhatsApp (salva como `QUER_WHATSAPP`).
* **Tecla 9:** Insere o cliente na Lista de Bloqueio (Opt-out) para nunca mais ligar (salva como `BLOQUEADO`).
* **Sem Resposta / Tecla Inválida:** Logs automáticos com encerramento automático da chamada.

---

## 📁 Estrutura de Pastas
```text
URA-ATIVA-BALAO/
  backend/
    routes/
      auth.js             # Autenticação de sessões
      clients.js          # Cadastro e Importação de clientes
      campaigns.js        # Gestão de campanhas ativas
      calls.js            # Logs de chamadas e Callbacks do Asterisk
      settings.js         # Edição de configurações do .env
      sip-diagnostic.js   # Endpoints de diagnóstico
    public/               # Interface Web Premium Escura
      index.html
      login.html
      dashboard.html
      clientes.html
      campanhas.html
      chamadas.html
      configuracoes.html
      diagnostico-sip.html
      style.css
      app.js
    server.js             # Express Server
    database.js           # SQLite Banco Local
    ami.js                # Conexão TCP socket com Asterisk AMI
    campaign-worker.js    # Fila e Pacing de chamadas
    sip-diagnostic.js     # Script de escaneamento de portas UDP
  asterisk/
    pjsip.conf.example    # Modelo de tronco e ramal SIP
    extensions.conf      # Dialplan da URA
    manager.conf.example  # Permissão de acesso ao AMI
    sounds/
      README.md           # Tabela de áudios requeridos
  scripts/
    instalar.ps1          # Instalador automático para Windows
    rodar-painel.ps1      # Executa a aplicação
    testar-conexao-ami.ps1# Procura porta AMI 5038
    testar-portas-sip.ps1 # Scaneia portas UDP da Telefonia Fácil
    testar-registro-sip.ps1# Ajuda a debugar console Asterisk
    gerar-audio.ps1       # Conversor de áudio para mono/8kHz
  README.md
```

---

## 🛠️ Requisitos de Instalação
1. **Node.js** (versão 16 ou superior) instalado na máquina host.
2. **Asterisk** (versão 16, 18 ou superior) com módulo `func_curl` e `res_pjsip` rodando localmente (pode ser WSL ou contêiner Docker).
3. **PowerShell** (no Windows para rodar scripts auxiliares).

---

## 📝 Passo a Passo de Configuração

### Passo 1: Instalação Automática
Abra o PowerShell como Administrador na pasta raiz do projeto e execute:
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\instalar.ps1
```
Isso irá:
1. Verificar a presença do Node.js.
2. Instalar todas as dependências do Node.js automaticamente na pasta `backend/`.
3. Criar o arquivo `backend/.env` baseado no arquivo de exemplo.

---

### Passo 2: Diagnosticar e Descobrir a Porta SIP
Como a Telefonia Fácil utiliza portas dinâmicas ou específicas (geralmente na faixa `51xx` ou `5060`/`5080`), você deve descobrir qual porta está respondendo:
1. Execute o script de varredura automática no PowerShell:
   ```powershell
   .\scripts\testar-portas-sip.ps1
   ```
2. O script enviará solicitações UDP do tipo `SIP OPTIONS` para `bala.pbx.telefoniafacil.com.br` e mostrará qual porta respondeu de volta.
3. Se você estiver usando o painel web, vá na tela **Diagnóstico SIP** e clique em **Buscar Portas SIP (Auto)**.

---

### Passo 3: Configurar o arquivo `.env`
Abra o arquivo `backend/.env` e configure com suas credenciais:
* `SIP_PORT`: Substitua `AUTO` pela porta descoberta no Passo anterior (ex: `5160` ou `5060`).
* `SIP_PASSWORD`: Digite a senha do ramal `2055`.
* `ASTERISK_AMI_PASSWORD`: Defina uma senha forte para comunicação do Node.js com o Asterisk.

---

### Passo 4: Configurar o Asterisk
1. Abra o arquivo `asterisk/manager.conf.example`, copie suas configurações para `/etc/asterisk/manager.conf` no seu servidor Asterisk e mude a senha para bater com a do `.env`.
2. Copie `asterisk/extensions.conf` para `/etc/asterisk/extensions.conf`.
3. Abra `asterisk/pjsip.conf.example`, substitua a palavra `PORTA_DESCOBERTA` pela porta ativa encontrada (ex: `5160`) e a senha do ramal, salvando como `/etc/asterisk/pjsip.conf`.
4. No console do Asterisk (`asterisk -rvvv`), recarregue as configurações:
   ```bash
   core reload
   ```

---

### Passo 5: Gerar e Copiar Áudios da URA
Use o script para converter seus arquivos gravados para o formato correto do Asterisk (WAV, Mono, 8kHz, 16-bit):
```powershell
.\scripts\gerar-audio.ps1 -InputFile "meu_audio.mp3" -OutputFile "saida/ura-balao-intro.wav"
```
Copie todos os arquivos resultantes listados em `asterisk/sounds/README.md` para a pasta de sons do Asterisk: `/var/lib/asterisk/sounds/`.

---

### Passo 6: Iniciar o Painel Web
No PowerShell na pasta raiz, execute:
```powershell
.\scripts\rodar-painel.ps1
```
Acesse no seu navegador: **[http://localhost:3000](http://localhost:3000)**.
* **Usuário Padrão:** `admin`
* **Senha Padrão:** `admin123` *(Pode ser alterada no arquivo `.env`)*

---

### Passo 7: Fazer o Teste do Ramal e Registro
1. No painel web, acesse a aba **Diagnóstico SIP**.
2. Clique em **Testar Registro SIP** para certificar-se que o ramal registrou com sucesso na Telefonia Fácil.
3. Acesse a aba **Histórico / Testes**, digite seu próprio telefone com DDD e clique em **Ligar Agora**.
4. Atenda a chamada no celular, digite as teclas de teste da URA e veja a resposta aparecendo em tempo real nos logs!
