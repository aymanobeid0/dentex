ALTER TABLE attendances DROP CONSTRAINT attendance_end_consistency;
ALTER TABLE attendances ADD CONSTRAINT attendance_end_consistency CHECK (
 (status IN ('waiting','with_doctor') AND recorded_end_at IS NULL) OR
 (status IN ('left_before_entry','completed','auto_closed') AND recorded_end_at IS NOT NULL AND recorded_end_at >= arrived_at)
);
ALTER TABLE visits DROP CONSTRAINT visit_end_consistency;
ALTER TABLE visits ADD CONSTRAINT visit_end_consistency CHECK (
 (status='in_progress' AND recorded_end_at IS NULL) OR
 (status IN ('completed','auto_closed') AND recorded_end_at IS NOT NULL AND recorded_end_at>=started_at) OR
 (status='entry_recorded_in_error' AND (recorded_end_at IS NULL OR recorded_end_at>=started_at))
);
CREATE TABLE attendance_corrections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 attendance_id UUID NOT NULL,
 actor_id UUID NOT NULL,
 kind VARCHAR(32) NOT NULL,
 reason VARCHAR(500),
 before JSONB NOT NULL,
 after JSONB NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(clinic_id,attendance_id) REFERENCES attendances(clinic_id,id) ON DELETE CASCADE ON UPDATE NO ACTION,
 FOREIGN KEY(clinic_id,actor_id) REFERENCES users(clinic_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX attendance_corrections_clinic_id_attendance_id_recorded_at_idx ON attendance_corrections(clinic_id,attendance_id,recorded_at);
