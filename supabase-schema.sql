-- =====================================================
-- BabyFoodTrack v2 — Per-record sync schema
-- Run this in the Supabase SQL Editor
-- =====================================================
--
-- MIGRATION NOTE:
-- Old tables bft_backups and bft_latest_state are NOT dropped.
-- They are deprecated. The new system reads bft_latest_state
-- ONCE during migration to import existing data, then never
-- touches those tables again.
-- =====================================================

-- Profiles: a family unit. Sharing the UUID shares all data.
CREATE TABLE IF NOT EXISTS public.bft_profiles (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Babies: each profile can track multiple babies.
-- Current app creates one default baby per profile.
CREATE TABLE IF NOT EXISTS public.bft_babies (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id  UUID NOT NULL REFERENCES bft_profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Bebé',
    birth_date  DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bft_babies_profile
    ON public.bft_babies (profile_id);

-- Unified records table: all record types in one table.
-- record_type: 'feeding','diaper','measurement','medicine','temperature','appointment','journal'
-- data: JSONB payload with type-specific fields (absorbs changes without ALTER TABLE)
-- record_time: extracted from data for indexing
CREATE TABLE IF NOT EXISTS public.bft_records (
    id            BIGINT       NOT NULL,
    profile_id    UUID         NOT NULL REFERENCES bft_profiles(id) ON DELETE CASCADE,
    baby_id       UUID         REFERENCES bft_babies(id) ON DELETE CASCADE,
    record_type   TEXT         NOT NULL,
    data          JSONB        NOT NULL,
    record_time   TIMESTAMPTZ  NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, record_type, id)
);

CREATE INDEX IF NOT EXISTS idx_bft_records_type
    ON public.bft_records (profile_id, record_type, record_time DESC);

CREATE INDEX IF NOT EXISTS idx_bft_records_baby
    ON public.bft_records (baby_id, record_type, record_time DESC);

-- Settings: per-profile + per-baby. JSONB absorbs any new settings.
CREATE TABLE IF NOT EXISTS public.bft_settings (
    profile_id  UUID NOT NULL REFERENCES bft_profiles(id) ON DELETE CASCADE,
    baby_id     UUID NOT NULL REFERENCES bft_babies(id) ON DELETE CASCADE,
    data        JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, baby_id)
);

-- Ensure existing deployments migrate PK semantics from (profile_id, id)
-- to (profile_id, record_type, id).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'bft_records'
          AND tc.constraint_type = 'PRIMARY KEY'
          AND tc.constraint_name = 'bft_records_pkey'
    ) THEN
        ALTER TABLE public.bft_records DROP CONSTRAINT bft_records_pkey;
    END IF;

    ALTER TABLE public.bft_records
        ADD CONSTRAINT bft_records_pkey PRIMARY KEY (profile_id, record_type, id);
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Enforce that baby_id belongs to the same profile_id in synced tables.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bft_babies_profile_id_id
    ON public.bft_babies (profile_id, id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'bft_records'
          AND constraint_name = 'bft_records_profile_baby_fk'
    ) THEN
        ALTER TABLE public.bft_records
            ADD CONSTRAINT bft_records_profile_baby_fk
            FOREIGN KEY (profile_id, baby_id)
            REFERENCES public.bft_babies (profile_id, id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'bft_settings'
          AND constraint_name = 'bft_settings_profile_baby_fk'
    ) THEN
        ALTER TABLE public.bft_settings
            ADD CONSTRAINT bft_settings_profile_baby_fk
            FOREIGN KEY (profile_id, baby_id)
            REFERENCES public.bft_babies (profile_id, id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- =====================================================
-- Row Level Security
-- Access gated by knowing the profile UUID (no auth).
-- =====================================================
ALTER TABLE public.bft_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bft_babies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bft_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bft_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bft_request_profile_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    headers_json text;
    profile_text text;
BEGIN
    headers_json := current_setting('request.headers', true);
    IF headers_json IS NULL OR headers_json = '' THEN
        RETURN NULL;
    END IF;

    profile_text := (headers_json::json ->> 'x-profile-id');
    IF profile_text IS NULL OR profile_text = '' THEN
        RETURN NULL;
    END IF;

    RETURN profile_text::uuid;
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_realtime()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN current_setting('request.headers', true) IS NULL OR current_setting('request.headers', true) = '';
END;
$$;

DO $$
BEGIN
    -- Remove permissive legacy policies if present.
    DROP POLICY IF EXISTS "anon_profiles_all" ON public.bft_profiles;
    DROP POLICY IF EXISTS "anon_babies_all" ON public.bft_babies;
    DROP POLICY IF EXISTS "anon_records_all" ON public.bft_records;
    DROP POLICY IF EXISTS "anon_settings_all" ON public.bft_settings;

    -- Profile bootstrap: allow anonymous profile creation.
    DROP POLICY IF EXISTS "anon_profiles_insert" ON public.bft_profiles;
    CREATE POLICY "anon_profiles_insert" ON public.bft_profiles
        FOR INSERT TO anon
        WITH CHECK (true);

    -- Profile-scoped read/update/delete using x-profile-id header.
    DROP POLICY IF EXISTS "anon_profiles_select" ON public.bft_profiles;
    CREATE POLICY "anon_profiles_select" ON public.bft_profiles
        FOR SELECT TO anon
        USING (id = public.bft_request_profile_id());

    DROP POLICY IF EXISTS "anon_profiles_update" ON public.bft_profiles;
    CREATE POLICY "anon_profiles_update" ON public.bft_profiles
        FOR UPDATE TO anon
        USING (id = public.bft_request_profile_id())
        WITH CHECK (id = public.bft_request_profile_id());

    DROP POLICY IF EXISTS "anon_profiles_delete" ON public.bft_profiles;
    CREATE POLICY "anon_profiles_delete" ON public.bft_profiles
        FOR DELETE TO anon
        USING (id = public.bft_request_profile_id());

    DROP POLICY IF EXISTS "anon_babies_all_scoped" ON public.bft_babies;
    CREATE POLICY "anon_babies_all_scoped" ON public.bft_babies
        FOR ALL TO anon
        USING (public.is_realtime() OR profile_id = public.bft_request_profile_id())
        WITH CHECK (public.is_realtime() OR profile_id = public.bft_request_profile_id());

    DROP POLICY IF EXISTS "anon_records_all_scoped" ON public.bft_records;
    CREATE POLICY "anon_records_all_scoped" ON public.bft_records
        FOR ALL TO anon
        USING (public.is_realtime() OR profile_id = public.bft_request_profile_id())
        WITH CHECK (public.is_realtime() OR profile_id = public.bft_request_profile_id());

    DROP POLICY IF EXISTS "anon_settings_all_scoped" ON public.bft_settings;
    CREATE POLICY "anon_settings_all_scoped" ON public.bft_settings
        FOR ALL TO anon
        USING (public.is_realtime() OR profile_id = public.bft_request_profile_id())
        WITH CHECK (public.is_realtime() OR profile_id = public.bft_request_profile_id());
END $$;

-- =====================================================
-- Realtime: enable postgres_changes on synced tables
-- Also verify in Dashboard → Database → Replication
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'bft_records'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.bft_records;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'bft_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.bft_settings;
    END IF;
END $$;
