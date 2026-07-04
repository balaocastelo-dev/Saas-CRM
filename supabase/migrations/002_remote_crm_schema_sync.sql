-- Sync missing CRM/WhatsApp schema into an already-connected Supabase project.
-- This migration is intentionally additive and avoids rewriting existing tables
-- that may already be in use by other parts of the project.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the existing profiles table has the columns expected by the CRM app.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_role TEXT NOT NULL DEFAULT 'atendente';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_user_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_role_check
      CHECK (user_role IN ('admin', 'vendedor', 'atendente', 'tecnico'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND user_role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY "profiles_select_own" ON public.profiles
      FOR SELECT USING (auth.uid() = id OR public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY "profiles_update_own" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_admin_all'
  ) THEN
    CREATE POLICY "profiles_admin_all" ON public.profiles
      FOR ALL USING (public.is_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#DC2626',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'tags_all_authenticated'
  ) THEN
    CREATE POLICY "tags_all_authenticated" ON public.tags
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  cpf_cnpj TEXT,
  city TEXT,
  neighborhood TEXT,
  contact_origin TEXT,
  main_interest TEXT,
  notes TEXT,
  accepted_marketing BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo',
  last_contact TIMESTAMPTZ,
  assigned_vendor_id UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_accepted_marketing ON public.customers(accepted_marketing);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_status_check'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_status_check
      CHECK (status IN ('ativo', 'inativo', 'bloqueado', 'opt-out'));
  END IF;
END $$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'customers_all_authenticated'
  ) THEN
    CREATE POLICY "customers_all_authenticated" ON public.customers
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_tags (
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_tags' AND policyname = 'customer_tags_all_authenticated'
  ) THEN
    CREATE POLICY "customer_tags_all_authenticated" ON public.customer_tags
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  assigned_to UUID REFERENCES public.profiles(id),
  last_message_at TIMESTAMPTZ,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON public.whatsapp_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.whatsapp_conversations(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_conversations_status_check'
      AND conrelid = 'public.whatsapp_conversations'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_status_check
      CHECK (status IN ('aberto', 'em_atendimento', 'resolvido', 'aguardando'));
  END IF;
END $$;

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_conversations' AND policyname = 'conversations_all_authenticated'
  ) THEN
    CREATE POLICY "conversations_all_authenticated" ON public.whatsapp_conversations
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  wamid TEXT UNIQUE,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  template_name TEXT,
  template_variables JSONB,
  status TEXT NOT NULL DEFAULT 'sent',
  error_code TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES public.profiles(id),
  is_ai_response BOOLEAN NOT NULL DEFAULT false,
  campaign_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON public.whatsapp_messages(wamid);
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.whatsapp_messages(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_messages_direction_check'
      AND conrelid = 'public.whatsapp_messages'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_messages
      ADD CONSTRAINT whatsapp_messages_direction_check
      CHECK (direction IN ('inbound', 'outbound'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_messages_message_type_check'
      AND conrelid = 'public.whatsapp_messages'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_messages
      ADD CONSTRAINT whatsapp_messages_message_type_check
      CHECK (message_type IN ('text', 'template', 'image', 'document', 'audio', 'video', 'interactive'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_messages_status_check'
      AND conrelid = 'public.whatsapp_messages'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_messages
      ADD CONSTRAINT whatsapp_messages_status_check
      CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
  END IF;
END $$;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_messages' AND policyname = 'messages_all_authenticated'
  ) THEN
    CREATE POLICY "messages_all_authenticated" ON public.whatsapp_messages
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_text TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  header_text TEXT,
  footer_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  meta_template_id TEXT,
  rejection_reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_category_check'
      AND conrelid = 'public.templates'::regclass
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_category_check
      CHECK (category IN ('marketing', 'utility', 'authentication'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_status_check'
      AND conrelid = 'public.templates'::regclass
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_status_check
      CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'templates' AND policyname = 'templates_all_authenticated'
  ) THEN
    CREATE POLICY "templates_all_authenticated" ON public.templates
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

INSERT INTO public.templates (name, category, body_text, variables, status) VALUES
  ('promocao_geral', 'marketing', 'Olá, {{1}}! Aqui é da Balão da Informática. Temos uma oferta especial hoje: {{2}}. Para falar com um vendedor, responda QUERO. Para não receber mais mensagens, responda SAIR.', '["nome_cliente", "descricao_oferta"]', 'draft'),
  ('recuperacao_orcamento', 'marketing', 'Olá, {{1}}! Aqui é da Balão da Informática. Vi que você fez um orçamento com a gente recentemente. Posso verificar uma condição melhor para você hoje?', '["nome_cliente"]', 'draft'),
  ('status_assistencia', 'utility', 'Olá, {{1}}! Seu equipamento está em atendimento na Balão da Informática. Status atual: {{2}}.', '["nome_cliente", "status"]', 'draft'),
  ('pos_venda', 'utility', 'Olá, {{1}}! Aqui é da Balão da Informática. Queremos saber se está tudo certo com seu produto. Se precisar de suporte, é só responder esta mensagem.', '["nome_cliente"]', 'draft'),
  ('campanha_gamer', 'marketing', 'Olá, {{1}}! Chegaram novas ofertas gamer na Balão da Informática: {{2}}. Temos poucas unidades disponíveis.', '["nome_cliente", "descricao_oferta"]', 'draft')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES public.templates(id),
  target_filters JSONB DEFAULT '{}',
  template_variables JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaigns_status_check'
      AND conrelid = 'public.campaigns'::regclass
  ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_status_check
      CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'));
  END IF;
END $$;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns' AND policyname = 'campaigns_all_authenticated'
  ) THEN
    CREATE POLICY "campaigns_all_authenticated" ON public.campaigns
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  response_text TEXT,
  message_id UUID REFERENCES public.whatsapp_messages(id),
  error_message TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaign_recipients_status_check'
      AND conrelid = 'public.campaign_recipients'::regclass
  ) THEN
    ALTER TABLE public.campaign_recipients
      ADD CONSTRAINT campaign_recipients_status_check
      CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'responded', 'opt_out'));
  END IF;
END $$;

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaign_recipients' AND policyname = 'campaign_recipients_all_authenticated'
  ) THEN
    CREATE POLICY "campaign_recipients_all_authenticated" ON public.campaign_recipients
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  value DECIMAL(10,2),
  stage TEXT NOT NULL DEFAULT 'novo_lead',
  source TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  expected_close_date DATE,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunities_stage_check'
      AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
      ADD CONSTRAINT opportunities_stage_check
      CHECK (stage IN ('novo_lead', 'qualificado', 'orcamento', 'negociacao', 'venda_concluida', 'perdido'));
  END IF;
END $$;

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'opportunities' AND policyname = 'opportunities_all_authenticated'
  ) THEN
    CREATE POLICY "opportunities_all_authenticated" ON public.opportunities
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.opportunity_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.opportunity_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'opportunity_history' AND policyname = 'opp_history_all_authenticated'
  ) THEN
    CREATE POLICY "opp_history_all_authenticated" ON public.opportunity_history
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',
  valid_until DATE,
  sent_via_whatsapp BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotes_status_check'
      AND conrelid = 'public.quotes'::regclass
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_status_check
      CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'rejeitado', 'expirado'));
  END IF;
END $$;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes' AND policyname = 'quotes_all_authenticated'
  ) THEN
    CREATE POLICY "quotes_all_authenticated" ON public.quotes
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  description TEXT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quote_items' AND policyname = 'quote_items_all_authenticated'
  ) THEN
    CREATE POLICY "quote_items_all_authenticated" ON public.quote_items
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  os_number TEXT NOT NULL UNIQUE,
  equipment_type TEXT NOT NULL,
  equipment_brand TEXT,
  equipment_model TEXT,
  serial_number TEXT,
  problem_reported TEXT NOT NULL,
  diagnosis TEXT,
  solution_applied TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  technician_id UUID REFERENCES public.profiles(id),
  estimated_delivery DATE,
  delivered_at TIMESTAMPTZ,
  labor_cost DECIMAL(10,2),
  parts_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  warranty_days INT,
  whatsapp_notifications BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_orders_status_check'
      AND conrelid = 'public.service_orders'::regclass
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_status_check
      CHECK (status IN ('aberta', 'diagnostico', 'aguardando_aprovacao', 'em_reparo', 'pronta', 'entregue', 'cancelado'));
  END IF;
END $$;

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_orders' AND policyname = 'service_orders_all_authenticated'
  ) THEN
    CREATE POLICY "service_orders_all_authenticated" ON public.service_orders
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shortcut TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quick_replies' AND policyname = 'quick_replies_all_authenticated'
  ) THEN
    CREATE POLICY "quick_replies_all_authenticated" ON public.quick_replies
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

INSERT INTO public.quick_replies (shortcut, title, content) VALUES
  ('/boasvindas', 'Boas-vindas', 'Olá! Seja bem-vindo à Balão da Informática. Como posso ajudar você hoje?'),
  ('/orcamento', 'Solicitar orçamento', 'Perfeito. Me envie o modelo/equipamento e o que você precisa para eu montar um orçamento.'),
  ('/assistencia', 'Assistência técnica', 'Claro. Me informe o equipamento, defeito apresentado e um telefone para contato.'),
  ('/encerrar', 'Encerrar atendimento', 'Atendimento encerrado. Se precisar de algo novamente, é só chamar.')
ON CONFLICT (shortcut) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_notes' AND policyname = 'notes_all_authenticated'
  ) THEN
    CREATE POLICY "notes_all_authenticated" ON public.conversation_notes
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'settings' AND policyname = 'settings_admin_only'
  ) THEN
    CREATE POLICY "settings_admin_only" ON public.settings
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_admin_read'
  ) THEN
    CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_insert_authenticated'
  ) THEN
    CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_customers ON public.customers;
CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_conversations ON public.whatsapp_conversations;
CREATE TRIGGER set_updated_at_conversations
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_messages ON public.whatsapp_messages;
CREATE TRIGGER set_updated_at_messages
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_templates ON public.templates;
CREATE TRIGGER set_updated_at_templates
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_campaigns ON public.campaigns;
CREATE TRIGGER set_updated_at_campaigns
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_opportunities ON public.opportunities;
CREATE TRIGGER set_updated_at_opportunities
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_quotes ON public.quotes;
CREATE TRIGGER set_updated_at_quotes
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_service_orders ON public.service_orders;
CREATE TRIGGER set_updated_at_service_orders
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
