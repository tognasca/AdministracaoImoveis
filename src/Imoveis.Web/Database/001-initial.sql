CREATE TABLE IF NOT EXISTS properties (
    id uuid PRIMARY KEY,
    code text NOT NULL,
    source text NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    district text NOT NULL,
    city text NOT NULL,
    price numeric(15,2) NOT NULL CHECK (price >= 0),
    bedrooms integer NOT NULL CHECK (bedrooms >= 0),
    size numeric(12,2) NOT NULL CHECK (size >= 0),
    status text NOT NULL CHECK (status IN ('Rascunho','Publicado','Vendido','Retirado')),
    album text,
    version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS properties_source_code ON properties (lower(source), lower(code));
CREATE INDEX IF NOT EXISTS properties_public ON properties (city, kind, price) WHERE status = 'Publicado';

CREATE TABLE IF NOT EXISTS photos (
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    id uuid NOT NULL UNIQUE,
    slot integer NOT NULL CHECK (slot BETWEEN 0 AND 4),
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    PRIMARY KEY (property_id, slot) DEFERRABLE INITIALLY DEFERRED
);
