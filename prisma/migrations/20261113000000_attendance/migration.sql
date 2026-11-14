CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'waiting',
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  arrival_sequence BIGSERIAL NOT NULL UNIQUE,
  recorded_end_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  edit_version INTEGER NOT NULL DEFAULT 1 CHECK (edit_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY (clinic_id, doctor_id) REFERENCES users(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY (clinic_id, created_by) REFERENCES users(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT attendance_end_consistency CHECK (
    (status = 'waiting' AND recorded_end_at IS NULL) OR
    (status = 'left_before_entry' AND recorded_end_at IS NOT NULL AND recorded_end_at >= arrived_at)
  )
);
CREATE UNIQUE INDEX attendance_one_active_patient ON attendances(clinic_id, patient_id) WHERE status = 'waiting';
CREATE INDEX attendances_clinic_id_doctor_id_status_arrived_at_arrival_s_idx ON attendances(clinic_id, doctor_id, status, arrived_at, arrival_sequence);
