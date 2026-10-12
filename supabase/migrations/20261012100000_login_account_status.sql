CREATE OR REPLACE FUNCTION public.lookup_login_account_status(p_email TEXT)
RETURNS TABLE(is_active BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT profiles.is_active
  FROM auth.users AS auth_user
  INNER JOIN public.profiles AS profiles ON profiles.user_id = auth_user.id
  WHERE lower(auth_user.email) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_login_account_status(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_login_account_status(TEXT) TO service_role;
