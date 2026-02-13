-- ============================================================================
-- White-Label Domains & Subdomains Migration
-- Adds custom domain mapping, platform subdomains, and per-org branding
-- ============================================================================

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

CREATE TYPE domain_status AS ENUM ('pending', 'verified', 'failed');
CREATE TYPE subdomain_status AS ENUM ('active', 'inactive');

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- organization_domains — custom domain mappings (e.g., careers.acme.com)
-- --------------------------------------------------------------------------
CREATE TABLE organization_domains (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain            text NOT NULL,
    status            domain_status NOT NULL DEFAULT 'pending',
    verification_token text NOT NULL,
    verified_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT org_domains_domain_unique UNIQUE (domain),
    CONSTRAINT org_domains_domain_format CHECK (domain ~ '^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$')
);

CREATE INDEX idx_org_domains_org_id ON organization_domains(organization_id);
CREATE INDEX idx_org_domains_domain ON organization_domains(domain);
CREATE INDEX idx_org_domains_status ON organization_domains(status) WHERE status = 'verified';

CREATE TRIGGER trg_org_domains_updated_at
    BEFORE UPDATE ON organization_domains
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- organization_subdomains — platform subdomain mappings (e.g., acme.hireflow.com)
-- --------------------------------------------------------------------------
CREATE TABLE organization_subdomains (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subdomain         text NOT NULL,
    status            subdomain_status NOT NULL DEFAULT 'active',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT org_subdomains_subdomain_unique UNIQUE (subdomain),
    CONSTRAINT org_subdomains_subdomain_format CHECK (subdomain ~ '^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$'),
    CONSTRAINT org_subdomains_length CHECK (char_length(subdomain) >= 3 AND char_length(subdomain) <= 63)
);

CREATE INDEX idx_org_subdomains_org_id ON organization_subdomains(organization_id);
CREATE INDEX idx_org_subdomains_subdomain ON organization_subdomains(subdomain);

CREATE TRIGGER trg_org_subdomains_updated_at
    BEFORE UPDATE ON organization_subdomains
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- organization_branding — per-org visual branding
-- --------------------------------------------------------------------------
CREATE TABLE organization_branding (
    organization_id   uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    brand_name        text,
    logo_url          text,
    favicon_url       text,
    primary_color     text DEFAULT '#4f46e5',
    accent_color      text DEFAULT '#06b6d4',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT org_branding_primary_color_format CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT org_branding_accent_color_format CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TRIGGER trg_org_branding_updated_at
    BEFORE UPDATE ON organization_branding
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organization_domains    ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subdomains ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_branding   ENABLE ROW LEVEL SECURITY;

-- organization_domains policies
CREATE POLICY "org_domains_select"
    ON organization_domains FOR SELECT
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "org_domains_insert_admin"
    ON organization_domains FOR INSERT
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_domains_update_admin"
    ON organization_domains FOR UPDATE
    USING (public.user_role(organization_id) = 'admin')
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_domains_delete_admin"
    ON organization_domains FOR DELETE
    USING (public.user_role(organization_id) = 'admin');

-- organization_subdomains policies
CREATE POLICY "org_subdomains_select"
    ON organization_subdomains FOR SELECT
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "org_subdomains_insert_admin"
    ON organization_subdomains FOR INSERT
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_subdomains_update_admin"
    ON organization_subdomains FOR UPDATE
    USING (public.user_role(organization_id) = 'admin')
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_subdomains_delete_admin"
    ON organization_subdomains FOR DELETE
    USING (public.user_role(organization_id) = 'admin');

-- organization_branding policies
CREATE POLICY "org_branding_select"
    ON organization_branding FOR SELECT
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "org_branding_insert_admin"
    ON organization_branding FOR INSERT
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_branding_update_admin"
    ON organization_branding FOR UPDATE
    USING (public.user_role(organization_id) = 'admin')
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_branding_delete_admin"
    ON organization_branding FOR DELETE
    USING (public.user_role(organization_id) = 'admin');

-- Public read access for branding (needed for white-label rendering)
CREATE POLICY "org_branding_select_public"
    ON organization_branding FOR SELECT
    USING (true);

-- Public read for domains (needed for tenant resolution in middleware)
CREATE POLICY "org_domains_select_public"
    ON organization_domains FOR SELECT TO anon
    USING (status = 'verified');

CREATE POLICY "org_subdomains_select_public"
    ON organization_subdomains FOR SELECT TO anon
    USING (status = 'active');
