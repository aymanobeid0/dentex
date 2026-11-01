-- Populate the shared catalog and initialize only roles without existing grants.
-- Existing employee, role, and clinic records are preserved.
INSERT INTO permissions (key) VALUES
  ('employees.manage'),
  ('patients.read'),
  ('patients.write'),
  ('patient_records.read'),
  ('patient_records.write'),
  ('dental_chart.read'),
  ('dental_chart.write'),
  ('appointments.read'),
  ('appointments.write'),
  ('prescriptions.read'),
  ('prescriptions.write'),
  ('communications.read'),
  ('communications.write'),
  ('invoices.read'),
  ('invoices.write'),
  ('payments.read'),
  ('payments.write'),
  ('patient_financial.read')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_key)
SELECT role.id, initial.permission_key
FROM roles role
JOIN (VALUES
  ('dentist','patients.read'),
  ('dentist','patient_records.read'),
  ('dentist','patient_records.write'),
  ('dentist','dental_chart.read'),
  ('dentist','dental_chart.write'),
  ('dentist','appointments.read'),
  ('dentist','appointments.write'),
  ('dentist','prescriptions.read'),
  ('dentist','prescriptions.write'),
  ('dentist','invoices.read'),
  ('dentist','payments.read'),
  ('dentist','patient_financial.read'),
  ('receptionist','patients.read'),
  ('receptionist','patients.write'),
  ('receptionist','communications.read'),
  ('receptionist','communications.write'),
  ('receptionist','appointments.read'),
  ('receptionist','appointments.write'),
  ('receptionist','invoices.read'),
  ('receptionist','invoices.write'),
  ('receptionist','payments.read'),
  ('receptionist','payments.write'),
  ('receptionist','patient_financial.read')
) AS initial(role_key, permission_key) ON initial.role_key=role.key
WHERE NOT EXISTS (SELECT 1 FROM role_permissions existing WHERE existing.role_id=role.id)
ON CONFLICT DO NOTHING;
