-- System-wide dentist patient-registration default.
-- Add only this grant, including customized/empty dentist roles in every clinic.
INSERT INTO permissions (key) VALUES ('patients.write')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'patients.write'
FROM roles
WHERE key = 'dentist'
ON CONFLICT (role_id, permission_key) DO NOTHING;
