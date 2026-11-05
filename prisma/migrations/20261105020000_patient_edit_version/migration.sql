ALTER TABLE "patients" ADD COLUMN "edit_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "patients" ADD CONSTRAINT "patients_edit_version_positive" CHECK ("edit_version" > 0);
