ALTER TABLE attendances DROP CONSTRAINT attendance_end_consistency;
ALTER TABLE attendances ADD CONSTRAINT attendance_end_consistency CHECK (
 (status IN ('waiting','with_doctor') AND recorded_end_at IS NULL) OR
 (status IN ('left_before_entry','completed') AND recorded_end_at IS NOT NULL AND recorded_end_at >= arrived_at)
);
DROP INDEX attendance_one_active_patient;
CREATE UNIQUE INDEX attendance_one_active_patient ON attendances(clinic_id, patient_id) WHERE status IN ('waiting','with_doctor');
CREATE TABLE visits (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 attendance_id UUID NOT NULL,
 patient_id UUID NOT NULL,
 doctor_id UUID NOT NULL,
 created_by UUID NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'in_progress',
 started_at TIMESTAMPTZ NOT NULL,
 recorded_end_at TIMESTAMPTZ,
 edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version > 0),
 UNIQUE(clinic_id,id),
 FOREIGN KEY(clinic_id,attendance_id) REFERENCES attendances(clinic_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY(clinic_id,patient_id) REFERENCES patients(clinic_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY(clinic_id,doctor_id) REFERENCES users(clinic_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY(clinic_id,created_by) REFERENCES users(clinic_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT visit_end_consistency CHECK ((status='in_progress' AND recorded_end_at IS NULL) OR (status='completed' AND recorded_end_at IS NOT NULL AND recorded_end_at>=started_at))
);
CREATE UNIQUE INDEX visit_one_active_doctor ON visits(clinic_id,doctor_id) WHERE status='in_progress';
CREATE UNIQUE INDEX visit_one_active_patient ON visits(clinic_id,patient_id) WHERE status='in_progress';
CREATE UNIQUE INDEX visit_one_active_attendance ON visits(clinic_id,attendance_id) WHERE status='in_progress';
CREATE INDEX visits_clinic_id_attendance_id_started_at_idx ON visits(clinic_id,attendance_id,started_at);
