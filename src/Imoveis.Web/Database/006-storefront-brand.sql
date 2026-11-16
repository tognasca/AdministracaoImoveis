CREATE TABLE storefront_brand (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80)
);
