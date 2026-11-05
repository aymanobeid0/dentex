import { describe, it, expect, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { prisma } from "../server/app";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "editing version migrations",
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it("initializes existing records without changing account data or customized grants", async () => {
      if (
        new URL(process.env.TEST_DATABASE_URL!).pathname !== "/dentex_test" ||
        process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
      )
        throw Error("Only dentex_test");
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "CREATE TEMP TABLE users (id integer PRIMARY KEY, name text, credential_version integer, active boolean) ON COMMIT DROP",
        );
        await tx.$executeRawUnsafe(
          "CREATE TEMP TABLE roles (id integer PRIMARY KEY, key text) ON COMMIT DROP",
        );
        await tx.$executeRawUnsafe(
          "CREATE TEMP TABLE role_permissions (role_id integer, permission_key text) ON COMMIT DROP",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO users VALUES (1,'Existing manager',7,true),(2,'Disabled employee',4,false)",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO roles VALUES (1,'dentist'),(2,'receptionist')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO role_permissions VALUES (1,'patients.read')",
        );
        for (const migration of [
          "20261105000000_employee_edit_version",
          "20261105010000_role_edit_version",
        ]) {
          const sql = await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            "utf8",
          );
          await tx.$executeRawUnsafe(sql);
        }
        expect(
          await tx.$queryRawUnsafe("SELECT * FROM users ORDER BY id"),
        ).toEqual([
          {
            id: 1,
            name: "Existing manager",
            credential_version: 7,
            active: true,
            edit_version: 1,
          },
          {
            id: 2,
            name: "Disabled employee",
            credential_version: 4,
            active: false,
            edit_version: 1,
          },
        ]);
        expect(
          await tx.$queryRawUnsafe("SELECT * FROM roles ORDER BY id"),
        ).toEqual([
          { id: 1, key: "dentist", edit_version: 1 },
          { id: 2, key: "receptionist", edit_version: 1 },
        ]);
        expect(
          await tx.$queryRawUnsafe("SELECT * FROM role_permissions"),
        ).toEqual([{ role_id: 1, permission_key: "patients.read" }]);
      });
    });
  },
);
