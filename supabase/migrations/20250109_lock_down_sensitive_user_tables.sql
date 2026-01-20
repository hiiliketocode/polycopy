-- Lock down sensitive user data with owner-only RLS policies.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnkey_wallets ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/write their own row.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own
ON public.profiles
FOR DELETE
TO authenticated
USING (id = auth.uid());

-- Turnkey wallets: users can only access their own wallets.
DROP POLICY IF EXISTS turnkey_wallets_select_own ON public.turnkey_wallets;
CREATE POLICY turnkey_wallets_select_own
ON public.turnkey_wallets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS turnkey_wallets_insert_own ON public.turnkey_wallets;
CREATE POLICY turnkey_wallets_insert_own
ON public.turnkey_wallets
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS turnkey_wallets_update_own ON public.turnkey_wallets;
CREATE POLICY turnkey_wallets_update_own
ON public.turnkey_wallets
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS turnkey_wallets_delete_own ON public.turnkey_wallets;
CREATE POLICY turnkey_wallets_delete_own
ON public.turnkey_wallets
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
