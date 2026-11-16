ALTER TABLE properties ADD COLUMN notes text CHECK (char_length(notes) <= 2000);
