ALTER TABLE storefront_brand
    ADD COLUMN color text NOT NULL DEFAULT '#6B5140'
    CHECK (color ~ '^#[0-9A-Fa-f]{6}$');
