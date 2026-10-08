ALTER TABLE public.crm_campaigns
  DROP CONSTRAINT IF EXISTS crm_campaigns_contact_list_id_fkey;

ALTER TABLE public.crm_campaigns
  ADD CONSTRAINT crm_campaigns_contact_list_id_fkey
  FOREIGN KEY (contact_list_id)
  REFERENCES public.crm_contact_lists(id)
  ON DELETE SET NULL;
