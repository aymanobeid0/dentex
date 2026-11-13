CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'booked',
  administrative_note varchar(2000),
  edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version >= 1),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY (clinic_id, doctor_id) REFERENCES users(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY (clinic_id, created_by) REFERENCES users(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT appointment_status CHECK (status IN ('booked', 'attended', 'absent', 'cancelled')),
  CONSTRAINT appointment_minute CHECK (isfinite(starts_at) AND isfinite(ends_at) AND date_trunc('minute', starts_at) = starts_at),
  CONSTRAINT appointment_duration CHECK (ends_at - starts_at BETWEEN interval '5 minutes' AND interval '240 minutes' AND mod(extract(epoch FROM ends_at - starts_at), 300) = 0),
  CONSTRAINT appointment_same_day CHECK (ends_at AT TIME ZONE 'Africa/Nouakchott' <= date_trunc('day', starts_at AT TIME ZONE 'Africa/Nouakchott') + interval '1 day'),
  CONSTRAINT appointment_doctor_overlap EXCLUDE USING gist (clinic_id WITH =, doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status IN ('booked', 'attended')),
  CONSTRAINT appointment_patient_overlap EXCLUDE USING gist (clinic_id WITH =, patient_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status IN ('booked', 'attended'))
);
CREATE INDEX appointments_clinic_id_starts_at_idx ON appointments(clinic_id, starts_at);

CREATE TABLE appointment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action varchar(20) NOT NULL,
  "before" jsonb,
  "after" jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, appointment_id) REFERENCES appointments(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY (clinic_id, actor_id) REFERENCES users(clinic_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX appointment_changes_clinic_id_appointment_id_created_at_idx ON appointment_changes(clinic_id, appointment_id, created_at);
