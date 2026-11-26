CREATE TABLE property_price_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL,
    property_id uuid NOT NULL,
    previous_price numeric(15,2) NOT NULL,
    new_price numeric(15,2) NOT NULL,
    import_id bigint,
    changed_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX property_price_history_lookup
    ON property_price_history (tenant_id, property_id, id DESC);

CREATE FUNCTION record_property_price_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO property_price_history (tenant_id, property_id, previous_price, new_price, import_id)
    VALUES (NEW.tenant_id, NEW.id, OLD.price, NEW.price,
            NULLIF(current_setting('imoveis.import_id', true), '')::bigint);
    RETURN NEW;
END;
$$;

CREATE TRIGGER property_price_changed AFTER UPDATE OF price ON properties
    FOR EACH ROW WHEN (OLD.price IS DISTINCT FROM NEW.price)
    EXECUTE FUNCTION record_property_price_change();
