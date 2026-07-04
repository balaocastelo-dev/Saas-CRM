# Balão CRM WhatsApp 🔴⚫

> Plataforma SaaS completa de CRM com WhatsApp Business para a **Balão da Informática Castelo**.

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Cloud_API_Official-25D366)](https://developers.facebook.com/docs/whatsapp)

---

## 🏢 Sobre a Empresa

- **Empresa:** Balão da Informática Castelo
- **Site:** [www.balao.info](https://www.balao.info)
- **Endereço:** Av. Anchieta, 789 – Campinas/SP
- **Telefones:** (19) 98751-0267 | (19) 3255-1661

---

## 📋 Módulos

| Módulo | Descrição |
|--------|-----------|
| 🏠 Dashboard | Métricas em tempo real, gráficos de desempenho |
| 👥 Clientes | Cadastro completo, tags, importação CSV |
| 💬 Atendimento | Inbox WhatsApp, conversas, notas internas |
| 📣 Campanhas | Envio em massa via template aprovado pela Meta |
| 📋 Templates | Gerenciamento de templates WhatsApp |
| 🤖 IA | Respostas automáticas com base de conhecimento |
| 🎯 CRM | Funil de vendas Kanban drag-and-drop |
| 📄 Orçamentos | Geração e envio de orçamentos via WhatsApp |
| 🔧 Ordens de Serviço | Controle completo de assistência técnica |
| 📦 Produtos | Catálogo com controle de estoque |
| 📊 Relatórios | Métricas consolidadas de todos os módulos |
| ⚙️ Configurações | Tokens Meta, empresa, campanhas, IA |

---

## 🚀 Stack Técnica

- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Estilização:** Tailwind CSS + CSS customizado
- **Banco de dados:** Supabase (PostgreSQL)
- **Autenticação:** Supabase Auth
- **WhatsApp:** API Oficial Cloud API da Meta
- **Gráficos:** Recharts
- **Deploy:** Vercel

---

## 🛠️ Instalação

### Pré-requisitos

- Node.js 18+
- Conta no Supabase
- Conta de desenvolvedor Meta (para WhatsApp Cloud API)

### 1. Clonar o repositório

```bash
git clone https://github.com/balaocastelo-dev/Saas-CRM.git
cd Saas-CRM
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha as variáveis no `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ptqqvezawobgnheesgvh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# WhatsApp Cloud API (Meta)
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx...
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=9876543210
WHATSAPP_VERIFY_TOKEN=seu_token_secreto
WHATSAPP_APP_SECRET=seu_app_secret
```

### 4. Configurar banco de dados

Execute o arquivo SQL no painel do Supabase (SQL Editor):

```bash
# Abra: https://ptqqvezawobgnheesgvh.supabase.co
# SQL Editor → New Query → Cole o conteúdo de:
supabase/migrations/001_initial_schema.sql
```

### 5. Rodar localmente

```bash
npm run dev
```

Acesse: http://localhost:3000

---

## 📱 Configurar WhatsApp Cloud API (Meta)

### Passo 1 — Criar App no Meta Developer

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Crie um App → tipo **Business**
3. Adicione o produto **WhatsApp**
4. Configure o número de telefone

### Passo 2 — Obter credenciais

- **Access Token:** Em "Configuration" do produto WhatsApp
- **Phone Number ID:** Em "API Setup"
- **Business Account ID:** Em "WhatsApp" → "Account details"
- **App Secret:** Em "Settings" → "Basic"

### Passo 3 — Configurar Webhook

URL do webhook:
```
https://seu-dominio.vercel.app/api/webhooks/whatsapp
```

Campos a assinar:
- `messages`
- `message_deliveries`
- `message_reads`

**Verify Token:** Use o mesmo valor do `WHATSAPP_VERIFY_TOKEN` no `.env.local`

### Passo 4 — Criar Templates

Templates precisam ser criados e aprovados no WhatsApp Business Manager:
1. Meta Business Manager → WhatsApp → Templates de mensagem
2. Crie com as mesmas variáveis dos templates no sistema
3. Aguarde aprovação (1-3 dias úteis)

---

## 📋 Templates Incluídos

| Template | Categoria | Variáveis |
|----------|-----------|-----------|
| `promocao_geral` | Marketing | nome_cliente, descricao_oferta |
| `recuperacao_orcamento` | Marketing | nome_cliente |
| `status_assistencia` | Utilidade | nome_cliente, status |
| `pos_venda` | Utilidade | nome_cliente |
| `campanha_gamer` | Marketing | nome_cliente, descricao_oferta |

---

## 🔒 Segurança

- ✅ Row Level Security (RLS) no Supabase
- ✅ Validação de assinatura do webhook Meta
- ✅ Opt-out automático (palavras: SAIR, PARAR, STOP)
- ✅ Nunca envia para clientes com `accepted_marketing = false`
- ✅ Tokens sensíveis apenas em variáveis de ambiente
- ✅ Logs de auditoria em todas as ações

---

## 🚀 Deploy na Vercel

1. Importe o repositório no [vercel.com](https://vercel.com)
2. Configure as variáveis de ambiente (Settings → Environment Variables)
3. Deploy automático a cada push para `main`

```bash
# Build local para verificar
npm run build
```

---

## 📊 Checklist de Produção

- [ ] Variáveis de ambiente configuradas na Vercel
- [ ] Migrations SQL executadas no Supabase
- [ ] Webhook verificado no Meta Developer
- [ ] Templates aprovados no WhatsApp Business Manager
- [ ] Teste de envio de mensagem template
- [ ] Teste de opt-out (responder SAIR)
- [ ] Backup do banco configurado no Supabase
- [ ] Domínio configurado na Vercel
- [ ] SSL ativo

---

## 📞 Suporte

- **Site:** [www.balao.info](https://www.balao.info)
- **GitHub:** [balaocastelo-dev/Saas-CRM](https://github.com/balaocastelo-dev/Saas-CRM)

---

*Desenvolvido com ❤️ para a Balão da Informática Castelo*
