BEGIN;
LOCK TABLE clinics, patients IN ACCESS EXCLUSIVE MODE;
-- Deliberately not IF NOT EXISTS: replay must fail before any renumbering.
CREATE TABLE patient_numbering (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  start BIGINT NOT NULL CHECK (start > 0),
  last_number BIGINT NOT NULL CHECK (last_number >= start - 1)
);
CREATE UNIQUE INDEX patients_clinic_id_id_key ON patients(clinic_id, id);
CREATE TABLE patient_number_history (
  clinic_id UUID NOT NULL,
  old_file_number BIGINT NOT NULL CHECK (old_file_number > 0),
  patient_id UUID NOT NULL UNIQUE,
  PRIMARY KEY (clinic_id, old_file_number),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients(clinic_id, id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE TEMP TABLE patient_renumbering ON COMMIT DROP AS
  SELECT id, clinic_id, file_number AS old_file_number,
    row_number() OVER (PARTITION BY clinic_id ORDER BY file_number) AS new_file_number
  FROM patients;
INSERT INTO patient_number_history SELECT clinic_id, old_file_number, id FROM patient_renumbering;
-- All existing numbers are positive. Negatives make both update stages collision free.
UPDATE patients p SET file_number = -m.new_file_number FROM patient_renumbering m WHERE p.id = m.id;
UPDATE patients p SET file_number = m.new_file_number FROM patient_renumbering m WHERE p.id = m.id;
INSERT INTO patient_numbering (clinic_id, start, last_number)
  SELECT c.id, 1, count(p.id) FROM clinics c LEFT JOIN patients p ON p.clinic_id = c.id GROUP BY c.id;
ALTER TABLE patients ALTER COLUMN file_number DROP DEFAULT;
DROP SEQUENCE patients_file_number_seq;
ALTER TABLE patients ADD CONSTRAINT patients_positive_file_number CHECK (file_number > 0);
COMMIT;
