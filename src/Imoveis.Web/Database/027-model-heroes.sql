CREATE TABLE storefront_model_heroes (
    tenant_id uuid NOT NULL REFERENCES saas_tenants(id),
    template text NOT NULL CHECK(template IN ('premium','minimal','modern','commercial','boutique')),
    draft boolean NOT NULL,
    mode text NOT NULL CHECK(mode IN ('default','upload','property')),
    image bytea,
    mime text,
    property_id uuid,
    photo_id uuid,
    PRIMARY KEY(tenant_id,template,draft),
    CHECK (
        (mode='default' AND image IS NULL AND mime IS NULL AND property_id IS NULL AND photo_id IS NULL)
        OR (mode='upload' AND image IS NOT NULL AND mime IN ('image/jpeg','image/png','image/webp') AND property_id IS NULL AND photo_id IS NULL)
        OR (mode='property' AND image IS NULL AND mime IS NULL AND property_id IS NOT NULL AND photo_id IS NOT NULL)
    )
);
