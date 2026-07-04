-- =====================================================
-- Balão CRM WhatsApp — Schema Inicial
-- =====================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABELA: profiles (extensão de auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  user_role TEXT NOT NULL DEFAULT 'atendente' CHECK (user_role IN ('admin', 'vendedor', 'atendente', 'tecnico')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER para checar admin sem recursão
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Permite ver seu próprio perfil
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- Permite atualizar seu próprio perfil
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admin pode fazer tudo (sem recursão via SECURITY DEFINER)
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (public.is_admin());

-- Trigger para criar profile ao cadastrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- TABELA: tags
-- =====================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#DC2626',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_all_authenticated" ON public.tags FOR ALL USING (auth.uid() IS NOT NULL);

-- Tags padrão
INSERT INTO public.tags (name, color) VALUES
  ('Gamer', '#7C3AED'),
  ('Notebook', '#2563EB'),
  ('Assistência', '#D97706'),
  ('Empresa', '#059669'),
  ('Orçamento pendente', '#DC2626'),
  ('Comprou recentemente', '#16A34A'),
  ('Cliente antigo', '#6B7280'),
  ('Peças', '#B45309'),
  ('Impressoras', '#0891B2'),
  ('Apple', '#6B7280'),
  ('Promoção', '#E11D48')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABELA: customers (clientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL, -- formato 55DDDNUMERO
  email TEXT,
  cpf_cnpj TEXT,
  city TEXT,
  neighborhood TEXT,
  contact_origin TEXT,
  main_interest TEXT,
  notes TEXT,
  accepted_marketing BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado', 'opt-out')),
  last_contact TIMESTAMPTZ,
  assigned_vendor_id UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON public.customers(phone_normalized);
CREATE INDEX idx_customers_status ON public.customers(status);
CREATE INDEX idx_customers_accepted_marketing ON public.customers(accepted_marketing);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_all_authenticated" ON public.customers FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: customer_tags
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_tags (
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_tags_all_authenticated" ON public.customer_tags FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: whatsapp_conversations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_atendimento', 'resolvido', 'aguardando')),
  assigned_to UUID REFERENCES public.profiles(id),
  last_message_at TIMESTAMPTZ,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_customer ON public.whatsapp_conversations(customer_id);
CREATE INDEX idx_conversations_status ON public.whatsapp_conversations(status);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_all_authenticated" ON public.whatsapp_conversations FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: whatsapp_messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  wamid TEXT UNIQUE, -- ID da mensagem na API Meta
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'template', 'image', 'document', 'audio', 'video', 'interactive')),
  content TEXT,
  template_name TEXT,
  template_variables JSONB,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_code TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES public.profiles(id),
  is_ai_response BOOLEAN NOT NULL DEFAULT false,
  campaign_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX idx_messages_wamid ON public.whatsapp_messages(wamid);
CREATE INDEX idx_messages_status ON public.whatsapp_messages(status);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_all_authenticated" ON public.whatsapp_messages FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: templates
-- =====================================================
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication')),
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_text TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  header_text TEXT,
  footer_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  meta_template_id TEXT, -- ID retornado pela Meta após aprovação
  rejection_reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_all_authenticated" ON public.templates FOR ALL USING (auth.uid() IS NOT NULL);

-- Templates iniciais
INSERT INTO public.templates (name, category, body_text, variables, status) VALUES
  ('promocao_geral', 'marketing', 'Olá, {{1}}! Aqui é da Balão da Informática. Temos uma oferta especial hoje: {{2}}. Para falar com um vendedor, responda QUERO. Para não receber mais mensagens, responda SAIR.', '["nome_cliente", "descricao_oferta"]', 'draft'),
  ('recuperacao_orcamento', 'marketing', 'Olá, {{1}}! Aqui é da Balão da Informática. Vi que você fez um orçamento com a gente recentemente. Posso verificar uma condição melhor para você hoje?', '["nome_cliente"]', 'draft'),
  ('status_assistencia', 'utility', 'Olá, {{1}}! Seu equipamento está em atendimento na Balão da Informática. Status atual: {{2}}.', '["nome_cliente", "status"]', 'draft'),
  ('pos_venda', 'utility', 'Olá, {{1}}! Aqui é da Balão da Informática. Queremos saber se está tudo certo com seu produto. Se precisar de suporte, é só responder esta mensagem.', '["nome_cliente"]', 'draft'),
  ('campanha_gamer', 'marketing', 'Olá, {{1}}! Chegaram novas ofertas gamer na Balão da Informática: {{2}}. Temos poucas unidades disponíveis.', '["nome_cliente", "descricao_oferta"]', 'draft')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABELA: campaigns
-- =====================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES public.templates(id),
  target_filters JSONB DEFAULT '{}', -- filtros: tags, cidade, etc.
  template_variables JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  daily_limit INT NOT NULL DEFAULT 1000,
  batch_interval_seconds INT NOT NULL DEFAULT 5,
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  read_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(10,4),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_all_authenticated" ON public.campaigns FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: campaign_recipients
-- =====================================================
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.whatsapp_messages(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  skip_reason TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_customer ON public.campaign_recipients(customer_id);

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_recipients_all_authenticated" ON public.campaign_recipients FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: opportunities (CRM funil de vendas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  product_interest TEXT,
  estimated_value DECIMAL(12,2),
  stage TEXT NOT NULL DEFAULT 'novo_lead' CHECK (stage IN ('novo_lead', 'em_atendimento', 'orcamento_enviado', 'negociacao', 'aguardando_pagamento', 'venda_concluida', 'perdido')),
  next_action TEXT,
  next_action_date DATE,
  origin TEXT,
  notes TEXT,
  lost_reason TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_customer ON public.opportunities(customer_id);
CREATE INDEX idx_opportunities_stage ON public.opportunities(stage);
CREATE INDEX idx_opportunities_vendor ON public.opportunities(vendor_id);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunities_all_authenticated" ON public.opportunities FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: opportunity_history
-- =====================================================
CREATE TABLE IF NOT EXISTS public.opportunity_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  old_stage TEXT,
  new_stage TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.opportunity_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opp_history_all_authenticated" ON public.opportunity_history FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: quotes (orçamentos)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number SERIAL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id),
  vendor_id UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'rejeitado', 'expirado')),
  valid_until DATE,
  payment_method TEXT,
  notes TEXT,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  sent_via_whatsapp BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_all_authenticated" ON public.quotes FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: quote_items
-- =====================================================
CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_items_all_authenticated" ON public.quote_items FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: service_orders (ordens de serviço)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES public.profiles(id),
  equipment TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  reported_issue TEXT NOT NULL,
  diagnosis TEXT,
  service_performed TEXT,
  parts_used JSONB DEFAULT '[]',
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'em_analise', 'aguardando_aprovacao', 'em_manutencao', 'aguardando_peca', 'pronto', 'entregue', 'cancelado')),
  deadline DATE,
  notes TEXT,
  photos JSONB DEFAULT '[]',
  whatsapp_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_orders_customer ON public.service_orders(customer_id);
CREATE INDEX idx_service_orders_status ON public.service_orders(status);

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_orders_all_authenticated" ON public.service_orders FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: products
-- =====================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('notebooks', 'pcs_gamer', 'placas_video', 'monitores', 'perifericos', 'assistencia', 'licencas', 'impressoras', 'outros')),
  description TEXT,
  cost_price DECIMAL(12,2),
  sale_price DECIMAL(12,2),
  stock_quantity INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'sem_estoque')),
  photos JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_all_authenticated" ON public.products FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: quick_replies (respostas rápidas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick_replies_all_authenticated" ON public.quick_replies FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: conversation_notes (notas internas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_all_authenticated" ON public.conversation_notes FOR ALL USING (auth.uid() IS NOT NULL);

-- =====================================================
-- TABELA: settings (configurações globais)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_admin_only" ON public.settings FOR ALL USING (
  public.is_admin()
);

-- Configurações padrão
INSERT INTO public.settings (key, value, description, is_secret) VALUES
  ('company_name', 'Balão da Informática Castelo', 'Nome da empresa', false),
  ('company_website', 'https://www.balao.info', 'Site da empresa', false),
  ('company_address', 'Av. Anchieta, 789 – Campinas/SP', 'Endereço da empresa', false),
  ('company_phone1', '(19) 98751-0267', 'Telefone 1', false),
  ('company_phone2', '(19) 3255-1661', 'Telefone 2', false),
  ('whatsapp_access_token', '', 'Token de acesso WhatsApp Cloud API', true),
  ('whatsapp_phone_number_id', '', 'ID do número de telefone WhatsApp', true),
  ('whatsapp_business_account_id', '', 'ID da conta Business WhatsApp', true),
  ('whatsapp_verify_token', '', 'Token de verificação do webhook', true),
  ('whatsapp_app_secret', '', 'App Secret da Meta', true),
  ('campaign_daily_limit', '1000', 'Limite diário de mensagens por campanha', false),
  ('campaign_batch_interval', '5', 'Intervalo entre lotes (segundos)', false),
  ('business_hours_start', '08:00', 'Início do horário de funcionamento', false),
  ('business_hours_end', '18:00', 'Fim do horário de funcionamento', false),
  ('business_days', '1,2,3,4,5,6', 'Dias de funcionamento (0=Dom, 6=Sáb)', false),
  ('ai_enabled', 'true', 'Habilitar IA de atendimento', false),
  ('ai_transfer_keyword', 'atendente', 'Palavra-chave para transferir para humano', false)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- TABELA: audit_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs FOR SELECT USING (
  public.is_admin()
);
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- Funções de updated_at automático
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas com updated_at
CREATE OR REPLACE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_conversations BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_messages BEFORE UPDATE ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_templates BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_campaigns BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_opportunities BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_quotes BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_service_orders BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
