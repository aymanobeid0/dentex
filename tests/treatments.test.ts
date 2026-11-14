import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../server/app";
import { Client } from "pg";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "treatment plans through HTTP and isolated storage",
  () => {
    const origin = "http://localhost:5173",
      prefix = `treatment-${randomUUID()}`;
    let clinicId: string,
      patientId: string,
      doctorId: string,
      actorId: string,
      cookie: string;
    const http = (
      method: "get" | "post" | "patch" | "delete",
      path: string,
      body?: object,
      auth = cookie,
    ) =>
      request(app)
        [method](`/api/clinic/visits${path}`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send(body);
    const sign = (id: string) =>
      `dentex_session=${jwt.sign({ kind: "clinic", version: 1 }, process.env.JWT_SECRET!, { subject: id, expiresIn: "1h" })}`;
    beforeAll(async () => {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (
        url.pathname !== "/dentex_test" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
      )
        throw Error("Isolated dentex_test required");
      process.env.JWT_SECRET = "synthetic-treatments-secret-32-characters";
      process.env.APP_ORIGIN = origin;
      const used = new Set((await prisma.clinic.findMany()).map((x) => x.code));
      const code = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      ).find((x) => !used.has(x))!;
      clinicId = (await prisma.clinic.create({ data: { name: prefix, code } }))
        .id;
      patientId = (
        await prisma.patient.create({
          data: {
            clinicId,
            name: prefix,
            fileNumber: 1n,
            phone: "+22220123456",
            gender: "male",
            isChild: true,
          },
        })
      ).id;
      for (const key of ["admin", "dentist", "receptionist"]) {
        const role = await prisma.role.create({ data: { clinicId, key } });
        const user = await prisma.user.create({
          data: {
            clinicId,
            name: key,
            username: `${prefix}-${key}`,
            passwordHash: "synthetic-unused",
          },
        });
        await prisma.userRole.create({
          data: { clinicId, roleId: role.id, userId: user.id },
        });
        if (key === "admin") actorId = user.id;
        if (key === "dentist") doctorId = user.id;
      }
      cookie = sign(actorId);
    });
    afterAll(async () => {
      if (clinicId) {
        // Only this suite's synthetic clinic; no development connection is allowed.
        await prisma.$executeRaw`DELETE FROM treatment_changes WHERE clinic_id=${clinicId}::uuid`.catch(
          () => {},
        );
        await prisma.$executeRaw`DELETE FROM treatment_items WHERE clinic_id=${clinicId}::uuid`.catch(
          () => {},
        );
        await prisma.$executeRaw`DELETE FROM treatment_plans WHERE clinic_id=${clinicId}::uuid`.catch(
          () => {},
        );
        await prisma.userRole.deleteMany({ where: { clinicId } });
        await prisma.role.deleteMany({ where: { clinicId } });
        await prisma.user.deleteMany({ where: { clinicId } });
        await prisma.patient.deleteMany({ where: { clinicId } });
        await prisma.clinic.delete({ where: { id: clinicId } });
      }
      await prisma.$disconnect();
    });
    it("creates an empty real plan, reads its persisted history, and rejects replay without duplicating it", async () => {
      const id = randomUUID(),
        body = {
          id,
          title: "Root canal then crown",
          notes: "Doctor's chosen plan",
        };
      const result = await http(
        "post",
        `/patient/${patientId}/treatment-plans`,
        body,
      );
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({
        id,
        title: body.title,
        notes: body.notes,
        status: "active",
        editVersion: 1,
        items: [],
        history: [{ kind: "plan_created", actorId }],
      });
      expect(
        (await http("get", `/patient/${patientId}/treatment-plans`)).body.items,
      ).toEqual([result.body]);
      expect(
        (await http("post", `/patient/${patientId}/treatment-plans`, body))
          .status,
      ).toBe(409);
      expect(
        (await http("get", `/patient/${patientId}/treatment-plans`)).body.items,
      ).toHaveLength(1);
    });
    it("adds and edits ordered planned procedures with versions, cancellation reasons and retained history", async () => {
      const plan = (
        await http("post", `/patient/${patientId}/treatment-plans`, {
          id: randomUUID(),
          title: "Restoration",
          notes: "",
        })
      ).body;
      const item = {
        id: randomUUID(),
        editVersion: 1,
        description: "Crown",
        location: "36",
        notes: "Zirconia chosen",
      };
      const added = await http(
        "post",
        `/treatment-plans/${plan.id}/items`,
        item,
      );
      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({
        editVersion: 2,
        items: [{ ...item, editVersion: 1, status: "pending" }],
      });
      const edited = await http("patch", `/treatment-items/${item.id}`, {
        kind: "edit",
        editVersion: 1,
        description: "Temporary crown",
        location: "36",
        notes: "Review later",
      });
      expect(edited.status).toBe(200);
      expect(edited.body.items[0]).toMatchObject({
        editVersion: 2,
        description: "Temporary crown",
      });
      expect(
        (
          await http("patch", `/treatment-items/${item.id}`, {
            kind: "status",
            editVersion: 1,
            status: "cancelled",
            reason: "Changed choice",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await http("patch", `/treatment-items/${item.id}`, {
            kind: "status",
            editVersion: 2,
            status: "cancelled",
            reason: " ",
          })
        ).status,
      ).toBe(400);
      const cancelled = await http("patch", `/treatment-items/${item.id}`, {
        kind: "status",
        editVersion: 2,
        status: "cancelled",
        reason: "Patient postponed",
      });
      expect(cancelled.body.items[0]).toMatchObject({
        status: "cancelled",
        editVersion: 3,
      });
      expect(cancelled.body.history).toHaveLength(4);
      expect(cancelled.body.history[3]).toMatchObject({
        reason: "Patient postponed",
        before: { description: "Temporary crown" },
        after: { status: "cancelled" },
      });
      const attempts = await Promise.all(
        [1, 2].map(() =>
          http("patch", `/treatment-plans/${plan.id}`, {
            kind: "edit",
            editVersion: cancelled.body.editVersion,
            title: "Updated",
            notes: "",
          }),
        ),
      );
      expect(attempts.map((x) => x.status).sort()).toEqual([200, 409]);
    });
    it("denies reception, foreign references, stale credentials and archived-patient writes without leaking care", async () => {
      const reception = await prisma.user.findFirstOrThrow({
        where: {
          clinicId,
          userRoles: { some: { role: { key: "receptionist" } } },
        },
      });
      const path = `/patient/${patientId}/treatment-plans`;
      expect(
        (await http("get", path, undefined, sign(reception.id))).status,
      ).toBe(403);
      expect(
        (
          await http(
            "post",
            path,
            { id: randomUUID(), title: "No", notes: "" },
            sign(reception.id),
          )
        ).status,
      ).toBe(403);
      expect(
        (await http("get", `/patient/${randomUUID()}/treatment-plans`)).status,
      ).toBe(404);
      expect(
        (
          await http("patch", `/treatment-plans/${randomUUID()}`, {
            kind: "edit",
            editVersion: 1,
            title: "No",
            notes: "",
          })
        ).status,
      ).toBe(404);
      await prisma.patient.update({
        where: { id: patientId },
        data: { archived: true },
      });
      try {
        expect(
          (
            await http("post", path, {
              id: randomUUID(),
              title: "No",
              notes: "",
            })
          ).body,
        ).toEqual({ error: "patient_archived" });
        expect((await http("get", path)).status).toBe(200);
      } finally {
        await prisma.patient.update({
          where: { id: patientId },
          data: { archived: false },
        });
      }
      const stale = `dentex_session=${jwt.sign({ kind: "clinic", version: 0 }, process.env.JWT_SECRET!, { subject: actorId, expiresIn: "1h" })}`;
      expect((await http("get", path, undefined, stale)).status).toBe(401);
    });
    it("rolls back a plan if its history cannot be stored", async () => {
      const id = randomUUID(),
        connection = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
      await connection.connect();
      const suffix = randomUUID().replaceAll("-", "");
      try {
        await connection.query(
          `CREATE FUNCTION treatment_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.plan_id='${id}'::uuid THEN RAISE EXCEPTION 'synthetic history failure'; END IF; RETURN NEW; END $$`,
        );
        await connection.query(
          `CREATE TRIGGER treatment_fail_${suffix} BEFORE INSERT ON treatment_changes FOR EACH ROW EXECUTE FUNCTION treatment_fail_${suffix}()`,
        );
        expect(
          (
            await http("post", `/patient/${patientId}/treatment-plans`, {
              id,
              title: "Must rollback",
              notes: "",
            })
          ).status,
        ).toBe(500);
        expect(
          (
            await http("get", `/patient/${patientId}/treatment-plans`)
          ).body.items.some((row: { id: string }) => row.id === id),
        ).toBe(false);
      } finally {
        await connection.query(
          `DROP TRIGGER IF EXISTS treatment_fail_${suffix} ON treatment_changes`,
        );
        await connection.query(
          `DROP FUNCTION IF EXISTS treatment_fail_${suffix}()`,
        );
        await connection.end();
      }
    });
  },
);
