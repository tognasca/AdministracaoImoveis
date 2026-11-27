CREATE TABLE rental_contracts (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    property_id uuid NOT NULL,
    owner_name text NOT NULL,
    renter_name text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL CHECK (ends_on >= starts_on),
    monthly_rent numeric(15,2) NOT NULL CHECK (monthly_rent > 0),
    management_fee numeric(15,2) NOT NULL CHECK (management_fee >= 0 AND management_fee <= monthly_rent),
    due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 28),
    signed_at timestamptz,
    closed_at timestamptz,
    owner_token_hash bytea UNIQUE,
    owner_token_expires_at timestamptz,
    UNIQUE (tenant_id,id),
    FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id)
);

CREATE UNIQUE INDEX rental_contract_one_open_per_property
    ON rental_contracts (tenant_id, property_id) WHERE closed_at IS NULL;

CREATE TABLE rental_adjustments (
    tenant_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    month date NOT NULL CHECK (extract(day FROM month)=1),
    rent numeric(15,2) NOT NULL CHECK (rent > 0),
    fee numeric(15,2) NOT NULL CHECK (fee >= 0 AND fee <= rent),
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,contract_id,month),
    FOREIGN KEY (tenant_id,contract_id) REFERENCES rental_contracts(tenant_id,id)
);

CREATE TABLE rental_charges (
    tenant_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    month date NOT NULL CHECK (extract(day FROM month)=1),
    due_on date NOT NULL,
    rent numeric(15,2) NOT NULL,
    fee numeric(15,2) NOT NULL,
    payment_ref text,
    paid_at timestamptz,
    transfer_ref text,
    transferred_at timestamptz,
    PRIMARY KEY (tenant_id,contract_id,month),
    FOREIGN KEY (tenant_id,contract_id) REFERENCES rental_contracts(tenant_id,id)
);

CREATE TABLE rental_inspections (
    tenant_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('entrada','saida')),
    inspected_on date NOT NULL,
    notes text NOT NULL,
    PRIMARY KEY (tenant_id,contract_id,kind),
    FOREIGN KEY (tenant_id,contract_id) REFERENCES rental_contracts(tenant_id,id)
);

CREATE TABLE rental_attachments (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('contrato','entrada','saida')),
    content_type text NOT NULL,
    data bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id,contract_id) REFERENCES rental_contracts(tenant_id,id)
);
CREATE INDEX rental_attachments_lookup ON rental_attachments (tenant_id,contract_id,kind);
CREATE UNIQUE INDEX rental_signed_document_unique ON rental_attachments(tenant_id,contract_id)
    WHERE kind='contrato';
