-- CRM data foundation for all planned CRM stages.
-- CRM companies are intentionally separate from public.companies, which is used
-- by the existing employee/company-account feature.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  logo_url TEXT,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_websites (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  website_url TEXT NOT NULL,
  technology VARCHAR(30) NOT NULL DEFAULT 'other' CHECK (technology IN ('react', 'nextjs', 'php', 'wordpress', 'other')),
  hosting_provider VARCHAR(50) NOT NULL DEFAULT 'other' CHECK (hosting_provider IN ('hostinger', 'orangehost', 'other')),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, website_url)
);

CREATE TABLE IF NOT EXISTS public.crm_website_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  website_id BIGINT NOT NULL REFERENCES public.crm_websites(id) ON DELETE CASCADE,
  integration_name VARCHAR(150) NOT NULL,
  public_identifier VARCHAR(150) NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (website_id, integration_name)
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  full_name VARCHAR(255),
  email VARCHAR(320) NOT NULL,
  normalized_email VARCHAR(320) NOT NULL,
  phone VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'unsubscribed', 'archived')),
  source VARCHAR(100),
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, normalized_email)
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  website_id BIGINT REFERENCES public.crm_websites(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.crm_website_integrations(id) ON DELETE SET NULL,
  converted_contact_id BIGINT REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  normalized_email VARCHAR(320) NOT NULL,
  phone VARCHAR(80),
  message TEXT,
  form_name VARCHAR(150),
  source_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_contact_tags (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_contact_tag_links (
  contact_id BIGINT NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES public.crm_contact_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.crm_mailboxes (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  email_address VARCHAR(320) NOT NULL,
  display_name VARCHAR(255),
  provider VARCHAR(100),
  imap_host VARCHAR(255) NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993 CHECK (imap_port BETWEEN 1 AND 65535),
  imap_security VARCHAR(20) NOT NULL DEFAULT 'ssl' CHECK (imap_security IN ('ssl', 'starttls', 'none')),
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 465 CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_security VARCHAR(20) NOT NULL DEFAULT 'ssl' CHECK (smtp_security IN ('ssl', 'starttls', 'none')),
  encrypted_credentials TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email_address)
);

CREATE TABLE IF NOT EXISTS public.crm_email_threads (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  mailbox_id BIGINT REFERENCES public.crm_mailboxes(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  subject TEXT,
  provider_thread_id TEXT,
  folder VARCHAR(30) NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'sent', 'drafts', 'archive', 'trash', 'spam')),
  is_starred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mailbox_id, provider_thread_id)
);

CREATE TABLE IF NOT EXISTS public.crm_email_messages (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  thread_id BIGINT NOT NULL REFERENCES public.crm_email_threads(id) ON DELETE CASCADE,
  mailbox_id BIGINT REFERENCES public.crm_mailboxes(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider_message_id TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  references_headers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sender TEXT,
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  cc TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mailbox_id, provider_message_id)
);

CREATE TABLE IF NOT EXISTS public.crm_email_attachments (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL REFERENCES public.crm_email_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type VARCHAR(255),
  storage_path TEXT NOT NULL,
  file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_email_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_segments (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  segment_id BIGINT REFERENCES public.crm_segments(id) ON DELETE SET NULL,
  template_id BIGINT REFERENCES public.crm_email_templates(id) ON DELETE SET NULL,
  mailbox_id BIGINT REFERENCES public.crm_mailboxes(id) ON DELETE SET NULL,
  from_name VARCHAR(255),
  reply_to VARCHAR(320),
  subject TEXT,
  schedule_at TIMESTAMPTZ,
  interval_seconds INTEGER NOT NULL DEFAULT 180 CHECK (interval_seconds > 0),
  batch_size INTEGER NOT NULL DEFAULT 1 CHECK (batch_size > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_campaign_contacts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  contact_id BIGINT NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked', 'replied', 'unsubscribed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.crm_campaign_messages (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  campaign_contact_id BIGINT NOT NULL REFERENCES public.crm_campaign_contacts(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked', 'replied', 'unsubscribed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_email_events (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  campaign_message_id BIGINT REFERENCES public.crm_campaign_messages(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES public.crm_email_messages(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'complained', 'unsubscribed', 'replied')),
  provider_event_id TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.crm_contact_timeline (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  contact_id BIGINT NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  lead_id BIGINT REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_automations (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_automation_steps (
  id BIGSERIAL PRIMARY KEY,
  automation_id BIGINT NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order >= 0),
  step_type VARCHAR(50) NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (automation_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.crm_automation_runs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  automation_id BIGINT NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  current_step_id BIGINT REFERENCES public.crm_automation_steps(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting', 'completed', 'stopped', 'failed')),
  next_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_websites_company ON public.crm_websites(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_company ON public.crm_website_integrations(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_status ON public.crm_leads(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_email ON public.crm_leads(company_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_status ON public.crm_contacts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_email ON public.crm_contacts(company_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_crm_mailboxes_company ON public.crm_mailboxes(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_threads_company_updated ON public.crm_email_threads(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_messages_thread_created ON public.crm_email_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_messages_due ON public.crm_campaign_messages(status, scheduled_at, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_crm_events_company_type ON public.crm_email_events(company_id, event_type, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_contact_created ON public.crm_contact_timeline(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_due ON public.crm_automation_runs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_crm_audit_company_created ON public.crm_audit_logs(company_id, created_at DESC);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'crm_companies', 'crm_websites', 'crm_website_integrations',
    'crm_contacts', 'crm_leads', 'crm_contact_tags', 'crm_contact_tag_links',
    'crm_mailboxes', 'crm_email_threads', 'crm_email_messages',
    'crm_email_attachments', 'crm_email_templates', 'crm_segments',
    'crm_campaigns', 'crm_campaign_contacts', 'crm_campaign_messages',
    'crm_email_events', 'crm_contact_timeline', 'crm_automations',
    'crm_automation_steps', 'crm_automation_runs', 'crm_audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_superadmin_access', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin())',
      table_name || '_superadmin_access', table_name
    );
  END LOOP;
END
$$;