ALTER TABLE storefront_brand
    ADD COLUMN color_opacity integer NOT NULL DEFAULT 100 CHECK (color_opacity BETWEEN 0 AND 100);
