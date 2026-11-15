-- CreateTable
CREATE TABLE "treatment_procedures" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "item_id" UUID,
    "description" VARCHAR(200) NOT NULL,
    "location" VARCHAR(80) NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "actor_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edit_version" INTEGER NOT NULL DEFAULT 1,
    "voided_at" TIMESTAMPTZ,
    "void_actor_id" UUID,
    "void_reason" VARCHAR(500),

    CONSTRAINT "treatment_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_procedures_clinic_id_visit_id_recorded_at_idx" ON "treatment_procedures"("clinic_id", "visit_id", "recorded_at");

-- CreateIndex
CREATE INDEX "treatment_procedures_clinic_id_patient_id_idx" ON "treatment_procedures"("clinic_id", "patient_id");

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_clinic_id_patient_id_fkey" FOREIGN KEY ("clinic_id", "patient_id") REFERENCES "patients"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_clinic_id_visit_id_fkey" FOREIGN KEY ("clinic_id", "visit_id") REFERENCES "visits"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_clinic_id_item_id_fkey" FOREIGN KEY ("clinic_id", "item_id") REFERENCES "treatment_items"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_clinic_id_actor_id_fkey" FOREIGN KEY ("clinic_id", "actor_id") REFERENCES "users"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_clinic_id_void_actor_id_fkey" FOREIGN KEY ("clinic_id", "void_actor_id") REFERENCES "users"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
