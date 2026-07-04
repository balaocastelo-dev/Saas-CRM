-- Reconcile the manually-applied remote schema with the application contract.
-- This migration is intentionally additive and preserves existing legacy columns.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.generate_prefixed_code(prefix TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', '') FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_campaign_counter(p_campaign_id UUID, p_field TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.campaigns
  SET
    sent_count = sent_count + CASE WHEN p_field = 'sent_count' THEN 1 ELSE 0 END,
    delivered_count = delivered_count + CASE WHEN p_field = 'delivered_count' THEN 1 ELSE 0 END,
    read_count = read_count + CASE WHEN p_field = 'read_count' THEN 1 ELSE 0 END,
    failed_count = failed_count + CASE WHEN p_field = 'failed_count' THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS is_secret BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

INSERT INTO public.settings (key, value, description, is_secret)
VALUES
  ('company_name', to_jsonb('Balão da Informática Castelo'::text), 'Nome da empresa', false),
  ('company_website', to_jsonb('https://www.balao.info'::text), 'Site da empresa', false),
  ('company_address', to_jsonb('Av. Anchieta, 789 - Campinas/SP'::text), 'Endereço da empresa', false),
  ('company_phone1', to_jsonb('(19) 98751-0267'::text), 'Telefone 1', false),
  ('company_phone2', to_jsonb('(19) 3255-1661'::text), 'Telefone 2', false),
  ('whatsapp_access_token', to_jsonb(''::text), 'Token de acesso WhatsApp Cloud API', true),
  ('whatsapp_phone_number_id', to_jsonb(''::text), 'ID do número de telefone WhatsApp', true),
  ('whatsapp_business_account_id', to_jsonb(''::text), 'ID da conta Business WhatsApp', true),
  ('whatsapp_verify_token', to_jsonb(''::text), 'Token de verificação do webhook', true),
  ('whatsapp_app_secret', to_jsonb(''::text), 'App Secret da Meta', true),
  ('campaign_daily_limit', to_jsonb('1000'::text), 'Limite diário de mensagens por campanha', false),
  ('campaign_batch_interval', to_jsonb('5'::text), 'Intervalo entre lotes (segundos)', false),
  ('business_hours_start', to_jsonb('08:00'::text), 'Início do horário de funcionamento', false),
  ('business_hours_end', to_jsonb('18:00'::text), 'Fim do horário de funcionamento', false),
  ('ai_enabled', to_jsonb('true'::text), 'Habilitar IA de atendimento', false),
  ('ai_transfer_keyword', to_jsonb('atendente'::text), 'Palavra-chave para transferir ao atendente', false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.products ALTER COLUMN id SET DEFAULT REPLACE(uuid_generate_v4()::TEXT, '-', '');
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INT NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.products
SET
  stock_quantity = COALESCE(stock_quantity, stock, 0),
  cost_price = COALESCE(cost_price, cost),
  sale_price = COALESCE(
    sale_price,
    CASE
      WHEN price ~ '^[0-9]+([.,][0-9]+)?$' THEN REPLACE(price, ',', '.')::NUMERIC
      ELSE NULL
    END
  ),
  photos = COALESCE(
    photos,
    CASE
      WHEN image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN to_jsonb(image_urls)
      WHEN image IS NOT NULL THEN to_jsonb(ARRAY[image])
      ELSE '[]'::jsonb
    END
  ),
  status = COALESCE(
    status,
    CASE WHEN COALESCE(stock_quantity, stock, 0) > 0 THEN 'ativo' ELSE 'sem_estoque' END
  ),
  updated_at = COALESCE(updated_at, created_at, NOW());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_status_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_status_check
      CHECK (status IN ('ativo', 'inativo', 'sem_estoque'));
  END IF;
END $$;

ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS product_interest TEXT;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2);
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS next_action_date DATE;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE public.opportunities
SET
  vendor_id = COALESCE(vendor_id, assigned_to),
  estimated_value = COALESCE(estimated_value, value),
  origin = COALESCE(origin, source),
  notes = COALESCE(notes, description),
  next_action_date = COALESCE(next_action_date, expected_close_date);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.opportunities'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%stage%'
  LOOP
    EXECUTE FORMAT('ALTER TABLE public.opportunities DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_stage_check
    CHECK (stage IN (
      'novo_lead',
      'qualificado',
      'orcamento',
      'orcamento_enviado',
      'negociacao',
      'em_atendimento',
      'aguardando_pagamento',
      'venda_concluida',
      'perdido'
    ));
END $$;

ALTER TABLE public.opportunity_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.opportunity_history ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'updated';
ALTER TABLE public.opportunity_history ADD COLUMN IF NOT EXISTS old_stage TEXT;
ALTER TABLE public.opportunity_history ADD COLUMN IF NOT EXISTS new_stage TEXT;
ALTER TABLE public.opportunity_history ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.opportunity_history
SET
  user_id = COALESCE(user_id, changed_by),
  old_stage = COALESCE(old_stage, from_stage),
  new_stage = COALESCE(new_stage, to_stage),
  notes = COALESCE(notes, note);

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE public.quotes ALTER COLUMN quote_number SET DEFAULT public.generate_prefixed_code('Q');
ALTER TABLE public.quotes ALTER COLUMN title SET DEFAULT 'Orçamento';

UPDATE public.quotes
SET vendor_id = COALESCE(vendor_id, created_by);

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.quote_items ALTER COLUMN product_name SET DEFAULT '';

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS equipment TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS reported_issue TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_performed TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS parts_used JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS total_value NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.service_orders ALTER COLUMN os_number SET DEFAULT public.generate_prefixed_code('OS');
ALTER TABLE public.service_orders ALTER COLUMN equipment_type SET DEFAULT 'Equipamento';
ALTER TABLE public.service_orders ALTER COLUMN problem_reported SET DEFAULT 'Sem descrição';

UPDATE public.service_orders
SET
  order_number = COALESCE(order_number, os_number),
  equipment = COALESCE(equipment, equipment_type),
  brand = COALESCE(brand, equipment_brand),
  model = COALESCE(model, equipment_model),
  reported_issue = COALESCE(reported_issue, problem_reported),
  service_performed = COALESCE(service_performed, solution_applied),
  total_value = COALESCE(total_value, total_cost, 0),
  deadline = COALESCE(deadline, estimated_delivery);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.service_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE FORMAT('ALTER TABLE public.service_orders DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE public.service_orders
    ADD CONSTRAINT service_orders_status_check
    CHECK (status IN (
      'aberta',
      'diagnostico',
      'aguardando_aprovacao',
      'em_reparo',
      'pronta',
      'entregue',
      'cancelado',
      'recebido',
      'em_analise',
      'em_manutencao',
      'aguardando_peca',
      'pronto'
    ));
END $$;

ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.audit_logs ALTER COLUMN entity DROP NOT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;

UPDATE public.audit_logs
SET
  entity_type = COALESCE(entity_type, entity),
  new_values = COALESCE(new_values, details);

DROP TRIGGER IF EXISTS set_updated_at_products ON public.products;
CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
