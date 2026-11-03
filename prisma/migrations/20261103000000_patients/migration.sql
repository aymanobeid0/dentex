CREATE TABLE "patients" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "clinic_id" UUID NOT NULL REFERENCES "clinics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "file_number" BIGSERIAL NOT NULL,
  "name" VARCHAR(200) NOT NULL CHECK (length(trim("name")) > 0),
  "phone" VARCHAR(12) NOT NULL CHECK ("phone" ~ '^\+222[0-9]{8}$'),
  "gender" VARCHAR(6) NOT NULL CHECK ("gender" IN ('male', 'female')),
  "is_child" BOOLEAN NOT NULL DEFAULT false,
  "birth_date" DATE,
  "address" VARCHAR(500),
  "administrative_note" VARCHAR(2000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "patients_clinic_id_file_number_key" ON "patients"("clinic_id", "file_number");
-- Children share a contact number; adults remain unique, including future archived files.
CREATE UNIQUE INDEX "patients_adult_phone_key" ON "patients"("clinic_id", "phone") WHERE NOT "is_child";
