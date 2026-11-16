CREATE TABLE staff_users (
    id uuid PRIMARY KEY,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('Administrador','Operador')),
    active boolean NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX staff_users_username ON staff_users(lower(username));
