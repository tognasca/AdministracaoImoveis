CREATE TABLE storefront_menu (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 48),
    kind text NOT NULL CHECK (kind IN ('category', 'gallery', 'contact')),
    position integer NOT NULL CHECK (position BETWEEN 0 AND 999),
    visible boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX storefront_menu_category_name ON storefront_menu (lower(name)) WHERE kind = 'category';
INSERT INTO storefront_menu (id, name, kind, position) VALUES
    ('00000000-0000-4000-8000-000000000001', 'Novos', 'category', 10),
    ('00000000-0000-4000-8000-000000000002', 'Usados', 'category', 20),
    ('00000000-0000-4000-8000-000000000003', 'Galeria', 'gallery', 30),
    ('00000000-0000-4000-8000-000000000004', 'Contato', 'contact', 40);

ALTER TABLE properties ADD COLUMN category_id uuid REFERENCES storefront_menu(id);
CREATE INDEX properties_public_category ON properties (category_id) WHERE status = 'Publicado';
