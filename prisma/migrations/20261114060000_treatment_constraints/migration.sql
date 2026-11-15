-- One planned occurrence can have only one currently valid performance.
CREATE UNIQUE INDEX treatment_procedures_one_active_item
  ON treatment_procedures(clinic_id,item_id) WHERE item_id IS NOT NULL AND voided_at IS NULL;
ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_valid_state CHECK(status IN ('active','cancelled') AND edit_version>0 AND length(btrim(title))>0);
ALTER TABLE treatment_items ADD CONSTRAINT treatment_items_valid_state CHECK(status IN ('pending','cancelled') AND edit_version>0 AND length(btrim(description))>0);
ALTER TABLE treatment_procedures ADD CONSTRAINT treatment_procedures_valid_state CHECK(
  edit_version>0 AND length(btrim(description))>0 AND
  ((voided_at IS NULL AND void_actor_id IS NULL AND void_reason IS NULL) OR
   (voided_at IS NOT NULL AND void_actor_id IS NOT NULL AND length(btrim(void_reason))>0))
);
