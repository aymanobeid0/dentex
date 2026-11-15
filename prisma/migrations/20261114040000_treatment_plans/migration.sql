-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'active',
    "edit_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_items" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "location" VARCHAR(80) NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "edit_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(500),
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_plans_clinic_id_patient_id_created_at_idx" ON "treatment_plans"("clinic_id", "patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_clinic_id_id_key" ON "treatment_plans"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "treatment_items_clinic_id_plan_id_created_at_idx" ON "treatment_items"("clinic_id", "plan_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_items_clinic_id_id_key" ON "treatment_items"("clinic_id", "id");

-- CreateIndex
CREATE INDEX "treatment_changes_clinic_id_plan_id_recorded_at_idx" ON "treatment_changes"("clinic_id", "plan_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_clinic_id_patient_id_fkey" FOREIGN KEY ("clinic_id", "patient_id") REFERENCES "patients"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_items" ADD CONSTRAINT "treatment_items_clinic_id_plan_id_fkey" FOREIGN KEY ("clinic_id", "plan_id") REFERENCES "treatment_plans"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_changes" ADD CONSTRAINT "treatment_changes_clinic_id_plan_id_fkey" FOREIGN KEY ("clinic_id", "plan_id") REFERENCES "treatment_plans"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatment_changes" ADD CONSTRAINT "treatment_changes_clinic_id_actor_id_fkey" FOREIGN KEY ("clinic_id", "actor_id") REFERENCES "users"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
