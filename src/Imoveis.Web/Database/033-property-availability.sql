ALTER TABLE properties
    ADD COLUMN sale_availability text NOT NULL DEFAULT 'available' CHECK (sale_availability IN ('available','negotiating','reserved','closed')),
    ADD COLUMN rent_availability text NOT NULL DEFAULT 'available' CHECK (rent_availability IN ('available','negotiating','reserved','closed')),
    ADD COLUMN sale_reserved_until timestamptz,
    ADD COLUMN rent_reserved_until timestamptz;

CREATE TABLE property_availability_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL,
    property_id uuid NOT NULL,
    operation text NOT NULL CHECK (operation IN ('sale','rent')),
    availability text NOT NULL CHECK (availability IN ('available','negotiating','reserved','closed')),
    reserved_until timestamptz,
    changed_by uuid NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id),
    FOREIGN KEY (tenant_id,changed_by) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX property_availability_events ON property_availability_history(tenant_id,property_id,id DESC);

CREATE FUNCTION imoveis_offer_visible(availability text, reserved_until timestamptz)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT availability IN ('available','negotiating')
        OR (availability='reserved' AND COALESCE(reserved_until<=now(),false))
$$;

CREATE FUNCTION imoveis_property_visible(p properties)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT (p).status='Publicado' AND (
        ((p).price>0 AND imoveis_offer_visible((p).sale_availability,(p).sale_reserved_until))
        OR ((p).rental IS NOT NULL AND imoveis_offer_visible((p).rent_availability,(p).rent_reserved_until)))
$$;
