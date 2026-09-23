-- Service charges are optional because an order may be priced later.
ALTER TABLE public.crm_orders
  ALTER COLUMN service_charges DROP NOT NULL;