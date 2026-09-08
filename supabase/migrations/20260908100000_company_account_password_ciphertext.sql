-- AES-GCM ciphertext is stored as a versioned text envelope: v1:iv:auth_tag:ciphertext.
-- The encryption key must remain in the server environment, never in Supabase or the browser.
ALTER TABLE public.company_accounts
  ALTER COLUMN encrypted_password TYPE TEXT
  USING CASE
    WHEN encrypted_password IS NULL THEN NULL
    ELSE encode(encrypted_password, 'base64')
  END;

ALTER TABLE public.company_accounts
  ALTER COLUMN encrypted_password SET NOT NULL;