CREATE TABLE IF NOT EXISTS public.crm_contact_lists (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name),
  UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS public.crm_contact_list_members (
  contact_list_id BIGINT NOT NULL,
  contact_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_list_id, contact_id),
  FOREIGN KEY (contact_list_id) REFERENCES public.crm_contact_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_list_members_contact
  ON public.crm_contact_list_members(contact_id);

ALTER TABLE public.crm_campaigns
  ADD COLUMN IF NOT EXISTS contact_list_id BIGINT REFERENCES public.crm_contact_lists(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_contact_list
  ON public.crm_campaigns(contact_list_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaign_messages_campaign_contact
  ON public.crm_campaign_messages(campaign_contact_id);

ALTER TABLE public.crm_contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_list_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_contact_lists_crm_company_access ON public.crm_contact_lists;
DROP POLICY IF EXISTS crm_contact_lists_crm_company_insert ON public.crm_contact_lists;
DROP POLICY IF EXISTS crm_contact_lists_crm_company_update ON public.crm_contact_lists;
DROP POLICY IF EXISTS crm_contact_lists_crm_company_delete ON public.crm_contact_lists;
CREATE POLICY crm_contact_lists_crm_company_access ON public.crm_contact_lists
  FOR SELECT TO authenticated
  USING (public.crm_employee_has_access('crm_contacts', company_id, 'read'));
CREATE POLICY crm_contact_lists_crm_company_insert ON public.crm_contact_lists
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_employee_has_access('crm_contacts', company_id, 'add'));
CREATE POLICY crm_contact_lists_crm_company_update ON public.crm_contact_lists
  FOR UPDATE TO authenticated
  USING (public.crm_employee_has_access('crm_contacts', company_id, 'edit'))
  WITH CHECK (public.crm_employee_has_access('crm_contacts', company_id, 'edit'));
CREATE POLICY crm_contact_lists_crm_company_delete ON public.crm_contact_lists
  FOR DELETE TO authenticated
  USING (public.crm_employee_has_access('crm_contacts', company_id, 'delete'));

DROP POLICY IF EXISTS crm_contact_list_members_crm_company_access ON public.crm_contact_list_members;
DROP POLICY IF EXISTS crm_contact_list_members_crm_company_insert ON public.crm_contact_list_members;
DROP POLICY IF EXISTS crm_contact_list_members_crm_company_update ON public.crm_contact_list_members;
DROP POLICY IF EXISTS crm_contact_list_members_crm_company_delete ON public.crm_contact_list_members;
CREATE POLICY crm_contact_list_members_crm_company_access ON public.crm_contact_list_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_contact_lists list
    WHERE list.id = contact_list_id
      AND public.crm_employee_has_access('crm_contacts', list.company_id, 'read')
  ));
CREATE POLICY crm_contact_list_members_crm_company_insert ON public.crm_contact_list_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.crm_contact_lists list
    JOIN public.crm_contacts contact ON contact.company_id = list.company_id
    WHERE list.id = contact_list_id
      AND contact.id = contact_id
      AND public.crm_employee_has_access('crm_contacts', list.company_id, 'add')
  ));
CREATE POLICY crm_contact_list_members_crm_company_update ON public.crm_contact_list_members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_contact_lists list
    WHERE list.id = contact_list_id
      AND public.crm_employee_has_access('crm_contacts', list.company_id, 'edit')
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.crm_contact_lists list
    JOIN public.crm_contacts contact ON contact.company_id = list.company_id
    WHERE list.id = contact_list_id
      AND contact.id = contact_id
      AND public.crm_employee_has_access('crm_contacts', list.company_id, 'edit')
  ));
CREATE POLICY crm_contact_list_members_crm_company_delete ON public.crm_contact_list_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crm_contact_lists list
    WHERE list.id = contact_list_id
      AND public.crm_employee_has_access('crm_contacts', list.company_id, 'delete')
  ));
