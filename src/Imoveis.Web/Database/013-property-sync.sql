-- Tracks incremental changes without changing existing property API contracts.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS modified_at timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION imoveis_touch_property() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.modified_at := clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS imoveis_touch_property_trigger ON properties;
CREATE TRIGGER imoveis_touch_property_trigger BEFORE UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION imoveis_touch_property();
CREATE INDEX IF NOT EXISTS properties_modified_at_idx ON properties(modified_at, id);
