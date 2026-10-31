-- Lock every table in "public" away from Supabase's public API (PostgREST / GraphQL).
--
-- The app and website only use Supabase for sign-in; all data goes through the game
-- server, which connects as the tables' owner (postgres). Owners bypass RLS, so the
-- server is unaffected. The browser-facing roles (anon, authenticated) get nothing:
-- RLS on with no policies denies every row, and their table grants are revoked too.

DO $$
DECLARE
    t record;
BEGIN
    -- Every table, including ones Prisma made outside the schema (_prisma_migrations).
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;

    -- Supabase roles; absent on a plain Postgres (local / CI databases).
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
        REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
        -- Tables later migrations create aren't handed to them either.
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    END IF;
END
$$;
