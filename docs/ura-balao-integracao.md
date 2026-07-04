# Integracao da URA Balao

## Estrutura

O projeto `URA-Bal-o` foi incorporado neste repositório em:

- `apps/ura-balao/backend`
- `apps/ura-balao/asterisk`
- `apps/ura-balao/scripts`

Ele continua sendo um servico Node.js/Express separado do CRM Next.js. Isso preserva a compatibilidade com:

- Asterisk AMI via socket TCP
- SQLite local
- scripts PowerShell/Windows
- WSL e geracao de audio local

## Como rodar pela raiz do CRM

1. Instalar dependencias da URA:

```bash
npm run ura:install
```

2. Iniciar a URA:

```bash
npm run ura:start
```

3. Desenvolvimento com reinicio automatico:

```bash
npm run ura:dev
```

## Atalhos Windows

- `install-ura-balao.cmd`
- `start-ura-balao.cmd`

## Porta padrao

- CRM Next.js: `http://localhost:3000`
- URA Balao: `http://localhost:3012`

## Observacoes operacionais

- O arquivo de exemplo da URA fica em `apps/ura-balao/backend/.env.example`.
- Crie `apps/ura-balao/backend/.env` antes de subir em ambiente real.
- O `SIP_PASSWORD` foi sanitizado no exemplo local para nao carregar segredo antigo para este repositório.
- O CRM e a URA agora convivem no mesmo repositório, mas continuam como runtimes separados por seguranca operacional.
