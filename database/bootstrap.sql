BEGIN;
CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code varchar(4) NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  credential_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  username text NOT NULL,
  email text,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  credential_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, username),
  UNIQUE (clinic_id, id)
);
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  key text NOT NULL CHECK (key IN ('admin','dentist','receptionist')),
  UNIQUE (clinic_id, key),
  UNIQUE (clinic_id, id)
);
CREATE TABLE IF NOT EXISTS user_roles (
  clinic_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (clinic_id, user_id) REFERENCES users(clinic_id, id),
  FOREIGN KEY (clinic_id, role_id) REFERENCES roles(clinic_id, id)
);
CREATE TABLE IF NOT EXISTS permissions (
  key text PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id),
  permission_key text NOT NULL REFERENCES permissions(key),
  PRIMARY KEY (role_id, permission_key)
);
COMMIT;
