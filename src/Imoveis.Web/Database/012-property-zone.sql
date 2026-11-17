ALTER TABLE properties ADD COLUMN zone text NULL
    CHECK (zone IS NULL OR zone IN ('Centro', 'Zona Norte', 'Zona Sul', 'Zona Leste', 'Zona Oeste'));
