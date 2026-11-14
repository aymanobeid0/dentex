ALTER TABLE attendances ADD COLUMN effective_closed_at TIMESTAMPTZ,
 ADD COLUMN auto_closed_recorded_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN effective_closed_at TIMESTAMPTZ,
 ADD COLUMN auto_closed_recorded_at TIMESTAMPTZ;
-- An automatic closure is distinct from a human-recorded completion/departure.
-- Existing terminal rows are preserved, including legacy automatic results.
ALTER TABLE attendances DROP CONSTRAINT attendance_end_consistency;
ALTER TABLE attendances ADD CONSTRAINT attendance_end_consistency CHECK (
 (status IN ('waiting','with_doctor') AND recorded_end_at IS NULL) OR
 (status IN ('left_before_entry','completed') AND recorded_end_at IS NOT NULL AND recorded_end_at >= arrived_at) OR
 (status='auto_closed' AND (recorded_end_at IS NULL OR recorded_end_at>=arrived_at))
);
ALTER TABLE visits DROP CONSTRAINT visit_end_consistency;
ALTER TABLE visits ADD CONSTRAINT visit_end_consistency CHECK (
 (status='in_progress' AND recorded_end_at IS NULL) OR
 (status='completed' AND recorded_end_at IS NOT NULL AND recorded_end_at>=started_at) OR
 (status IN ('auto_closed','entry_recorded_in_error') AND (recorded_end_at IS NULL OR recorded_end_at>=started_at))
);
ALTER TABLE attendances ADD CONSTRAINT attendance_auto_close_consistency CHECK (
 (effective_closed_at IS NULL AND auto_closed_recorded_at IS NULL) OR
 (effective_closed_at IS NOT NULL AND auto_closed_recorded_at IS NOT NULL AND effective_closed_at>arrived_at AND auto_closed_recorded_at>=effective_closed_at)
);
ALTER TABLE visits ADD CONSTRAINT visit_auto_close_consistency CHECK (
 (effective_closed_at IS NULL AND auto_closed_recorded_at IS NULL) OR
 (effective_closed_at IS NOT NULL AND auto_closed_recorded_at IS NOT NULL AND effective_closed_at>started_at AND auto_closed_recorded_at>=effective_closed_at)
);
