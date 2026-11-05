ALTER TABLE "roles" ADD COLUMN "edit_version" INTEGER NOT NULL DEFAULT 1 CHECK (edit_version > 0);
