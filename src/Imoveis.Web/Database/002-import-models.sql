CREATE TABLE IF NOT EXISTS import_models (
    signature text NOT NULL,
    source text NOT NULL,
    mapping jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (signature, source)
);
