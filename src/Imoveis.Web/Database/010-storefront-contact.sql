ALTER TABLE storefront_brand
    ADD COLUMN email text CHECK (char_length(email) <= 254),
    ADD COLUMN whatsapp text CHECK (whatsapp = '' OR whatsapp ~ '^[0-9]{10,15}$'),
    ADD COLUMN text_color text NOT NULL DEFAULT 'auto' CHECK (text_color IN ('auto', 'black', 'white'));
