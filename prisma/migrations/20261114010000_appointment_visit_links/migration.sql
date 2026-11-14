-- CreateTable
CREATE TABLE "appointment_visit_links" (
    "clinic_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "appointment_id" UUID,
    "edit_version" INTEGER NOT NULL,

    CONSTRAINT "appointment_visit_links_pkey" PRIMARY KEY ("clinic_id","visit_id")
);

-- CreateTable
CREATE TABLE "appointment_visit_pins" (
    "clinic_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "visit_day" VARCHAR(10) NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "appointment_visit_pins_pkey" PRIMARY KEY ("clinic_id","appointment_id","visit_id")
);

-- CreateTable
CREATE TABLE "appointment_visit_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_visit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX appointment_visit_one_valid_pin ON appointment_visit_pins(clinic_id, appointment_id) WHERE valid;
ALTER TABLE appointment_visit_links ADD CONSTRAINT appointment_visit_link_version CHECK (edit_version > 0);
ALTER TABLE appointment_visit_pins ADD CONSTRAINT appointment_visit_pin_day CHECK (visit_day ~ '^\d{4}-\d{2}-\d{2}$');

-- CreateIndex
CREATE UNIQUE INDEX "appointment_visit_links_clinic_id_appointment_id_key" ON "appointment_visit_links"("clinic_id", "appointment_id");

-- CreateIndex
CREATE INDEX "appointment_visit_changes_clinic_id_visit_id_created_at_idx" ON "appointment_visit_changes"("clinic_id", "visit_id", "created_at");

-- AddForeignKey
ALTER TABLE "appointment_visit_links" ADD CONSTRAINT "appointment_visit_links_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointment_visit_links" ADD CONSTRAINT "appointment_visit_links_clinic_id_appointment_id_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "appointments"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointment_visit_pins" ADD CONSTRAINT "appointment_visit_pins_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointment_visit_pins" ADD CONSTRAINT "appointment_visit_pins_clinic_id_appointment_id_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "appointments"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointment_visit_changes" ADD CONSTRAINT "appointment_visit_changes_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointment_visit_changes" ADD CONSTRAINT "appointment_visit_changes_clinic_id_actor_id_fkey" FOREIGN KEY ("clinic_id", "actor_id") REFERENCES "users"("clinic_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
