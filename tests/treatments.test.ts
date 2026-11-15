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
        await prisma.treatmentProcedure.deleteMany({ where: { clinicId } });
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
        await prisma.treatmentProcedure.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitChange.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitPin.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitLink.deleteMany({ where: { clinicId } });
        await prisma.attendanceCorrection.deleteMany({ where: { clinicId } });
        await prisma.visit.deleteMany({ where: { clinicId } });
        await prisma.attendance.deleteMany({ where: { clinicId } });
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
    it("records actual care once against an outstanding plan item and preserves both sides when voided", async () => {
      const plan = (
        await http("post", `/patient/${patientId}/treatment-plans`, {
          id: randomUUID(),
          title: "Clinical plan",
          notes: "",
        })
      ).body;
      const itemId = randomUUID();
      await http("post", `/treatment-plans/${plan.id}/items`, {
        id: itemId,
        editVersion: 1,
        description: "Composite",
        location: "36",
        notes: "Planned care",
      });
      const arrived = (await http("post", "/", { patientId, doctorId })).body;
      const started = (
        await http("post", `/${arrived.id}/start`, {
          editVersion: arrived.editVersion,
        })
      ).body;
      const input = {
        source: "plan",
        id: randomUUID(),
        visitVersion: started.visit.editVersion,
        itemId,
        itemVersion: 1,
        notes: "Performed without complications",
      };
      const recorded = await http("post", `/${arrived.id}/procedures`, input);
      expect(recorded.status).toBe(201);
      expect(recorded.body.items).toMatchObject([
        {
          id: input.id,
          itemId,
          description: "Composite",
          location: "36",
          notes: input.notes,
          visitId: started.visit.id,
          voidedAt: null,
        },
      ]);
      const plans = (await http("get", `/patient/${patientId}/treatment-plans`))
        .body.items;
      const completed = plans.find((x: { id: string }) => x.id === plan.id);
      expect(completed.progress).toEqual({
        completed: 1,
        pending: 0,
        cancelled: 0,
      });
      expect(completed.items[0].procedure.id).toBe(input.id);
      expect(
        (await http("post", `/${arrived.id}/procedures`, input)).status,
      ).toBe(409);
      const current = (await http("get", `/${arrived.id}`)).body;
      expect(
        (
          await http("patch", `/${arrived.id}/correction`, {
            kind: "invalidate_entry",
            editVersion: current.editVersion,
            visitId: current.visit.id,
            visitVersion: current.visit.editVersion,
            outcome: "waiting",
            confirmed: true,
            reason: "Administrative error",
          })
        ).body,
      ).toEqual({ error: "treatment_history_exists" });
      const voided = await http("patch", `/procedures/${input.id}/void`, {
        editVersion: 1,
        reason: "Incorrectly recorded procedure",
      });
      expect(voided.status).toBe(200);
      expect(voided.body.items[0]).toMatchObject({
        id: input.id,
        voidReason: "Incorrectly recorded procedure",
        editVersion: 2,
      });
      const reopened = (
        await http("get", `/patient/${patientId}/treatment-plans`)
      ).body.items.find((x: { id: string }) => x.id === plan.id);
      expect(reopened.progress).toEqual({
        completed: 0,
        pending: 1,
        cancelled: 0,
      });
      expect(reopened.history.at(-1)).toMatchObject({
        kind: "procedure_voided",
        reason: "Incorrectly recorded procedure",
      });
      const afterVoid = (await http("get", `/${arrived.id}`)).body;
      expect(
        (
          await http("patch", `/${arrived.id}/correction`, {
            kind: "invalidate_entry",
            editVersion: afterVoid.editVersion,
            visitId: afterVoid.visit.id,
            visitVersion: afterVoid.visit.editVersion,
            outcome: "waiting",
            confirmed: true,
          })
        ).body.error,
      ).toBe("treatment_history_exists");
      expect(
        (
          await http("post", `/${arrived.id}/complete`, {
            editVersion: afterVoid.editVersion,
            visitVersion: afterVoid.visit.editVersion,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await http("get", `/patient/${patientId}/treatment-plans`)
        ).body.items.find((x: { id: string }) => x.id === plan.id).progress
          .pending,
      ).toBe(1);
    });
    it("serializes replay and fresh authorization, and rolls back all linked-care writes if audit fails", async () => {
      const arrived = (await http("post", "/", { patientId, doctorId })).body;
      const started = (
        await http("post", `/${arrived.id}/start`, { editVersion: 1 })
      ).body;
      const input = {
        source: "standalone",
        id: randomUUID(),
        visitVersion: started.visit.editVersion,
        description: "Scaling",
        location: "Full mouth",
        notes: "Actual procedure",
      };
      const race = await Promise.all([
        http("post", `/${arrived.id}/procedures`, input),
        http("post", `/${arrived.id}/procedures`, input),
      ]);
      expect(race.map((x) => x.status).sort()).toEqual([201, 409]);
      const snapshot = (await http("get", `/${arrived.id}/procedures`)).body;
      expect(snapshot.items).toHaveLength(1);
      expect(snapshot.visitVersion).toBe(2);
      const connection = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await connection.connect();
      let pending: PromiseLike<request.Response> | undefined;
      try {
        await connection.query("BEGIN");
        await connection.query(
          "SELECT id FROM clinics WHERE id=$1::uuid FOR UPDATE",
          [clinicId],
        );
        pending = http(
          "post",
          `/${arrived.id}/procedures`,
          { ...input, id: randomUUID(), visitVersion: 2 },
          sign(doctorId),
        ).then((x) => x);
        const deadline = Date.now() + 4000;
        let waiting = false;
        while (Date.now() < deadline) {
          const locks = await connection.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
          );
          if (locks.rowCount) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        await connection.query(
          "UPDATE users SET credential_version=credential_version+1 WHERE id=$1::uuid",
          [doctorId],
        );
        await connection.query("COMMIT");
        expect((await pending).status).toBe(403);
        expect((await http("get", `/${arrived.id}/procedures`)).body).toEqual(
          snapshot,
        );
      } finally {
        await connection.query("ROLLBACK");
        await pending;
        await connection.end();
        await prisma.user.update({
          where: { id: doctorId },
          data: { credentialVersion: 1 },
        });
      }
      const plans = (await http("get", `/patient/${patientId}/treatment-plans`))
        .body.items;
      const clinical = plans.find(
          (x: { title: string }) => x.title === "Clinical plan",
        ),
        item = clinical.items[0],
        suffix = randomUUID().replaceAll("-", "");
      const fail = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await fail.connect();
      try {
        await fail.query(
          `CREATE FUNCTION care_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.plan_id='${clinical.id}'::uuid AND NEW.kind='procedure_recorded' THEN RAISE EXCEPTION 'synthetic care audit failure'; END IF; RETURN NEW; END $$`,
        );
        await fail.query(
          `CREATE TRIGGER care_fail_${suffix} BEFORE INSERT ON treatment_changes FOR EACH ROW EXECUTE FUNCTION care_fail_${suffix}()`,
        );
        expect(
          (
            await http("post", `/${arrived.id}/procedures`, {
              source: "plan",
              id: randomUUID(),
              visitVersion: 2,
              itemId: item.id,
              itemVersion: item.editVersion,
              notes: "Must roll back",
            })
          ).status,
        ).toBe(500);
        expect((await http("get", `/${arrived.id}/procedures`)).body).toEqual(
          snapshot,
        );
        expect(
          (
            await http("get", `/patient/${patientId}/treatment-plans`)
          ).body.items.find((x: { id: string }) => x.id === clinical.id),
        ).toEqual(clinical);
      } finally {
        await fail.query(
          `DROP TRIGGER IF EXISTS care_fail_${suffix} ON treatment_changes`,
        );
        await fail.query(`DROP FUNCTION IF EXISTS care_fail_${suffix}()`);
        await fail.end();
      }
      const duplicateItem = {
        source: "plan",
        id: randomUUID(),
        visitVersion: 2,
        itemId: item.id,
        itemVersion: item.editVersion,
        notes: "Performed",
      };
      const linked = await Promise.all([
        http("post", `/${arrived.id}/procedures`, duplicateItem),
        http("post", `/${arrived.id}/procedures`, {
          ...duplicateItem,
          id: randomUUID(),
        }),
      ]);
      expect(linked.map((x) => x.status).sort()).toEqual([201, 409]);
      const planNow = (
        await http("get", `/patient/${patientId}/treatment-plans`)
      ).body.items.find((x: { id: string }) => x.id === clinical.id);
      expect(
        (
          await http("patch", `/treatment-items/${item.id}`, {
            kind: "edit",
            editVersion: planNow.items[0].editVersion,
            description: "Silent change",
            location: "36",
            notes: "",
          })
        ).body.error,
      ).toBe("treatment_not_allowed");
      const row = (await http("get", `/${arrived.id}`)).body;
      expect(
        (
          await http("post", `/${row.id}/complete`, {
            editVersion: row.editVersion,
            visitVersion: row.visit.editVersion,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await http("post", `/${row.id}/procedures`, {
            ...input,
            id: randomUUID(),
            visitVersion: row.visit.editVersion + 1,
          })
        ).body.error,
      ).toBe("treatment_not_allowed");
      const recorded = (await http("get", `/${row.id}/procedures`)).body
        .items[0];
      expect(
        (
          await http("patch", `/procedures/${recorded.id}/void`, {
            editVersion: recorded.editVersion,
            reason: "Correction after closure",
          })
        ).status,
      ).toBe(200);
    });
    it("rejects foreign-clinic and different-patient clinical references and keeps reception administrative", async () => {
      const codes = new Set(
        (await prisma.clinic.findMany()).map((x) => x.code),
      );
      const code = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      ).find((x) => !codes.has(x))!;
      const foreign = await prisma.clinic.create({
        data: { name: `${prefix}-foreign`, code },
      });
      const foreignPatient = await prisma.patient.create({
        data: {
          clinicId: foreign.id,
          name: "Foreign",
          fileNumber: 1n,
          phone: "+22220123456",
          gender: "male",
          isChild: true,
        },
      });
      const foreignPlan = await prisma.treatmentPlan.create({
        data: {
          id: randomUUID(),
          clinicId: foreign.id,
          patientId: foreignPatient.id,
          title: "Foreign plan",
          notes: "",
        },
      });
      const foreignItem = await prisma.treatmentItem.create({
        data: {
          id: randomUUID(),
          clinicId: foreign.id,
          planId: foreignPlan.id,
          description: "Private act",
          location: "36",
          notes: "",
        },
      });
      try {
        const other = await prisma.patient.create({
          data: {
            clinicId,
            name: "Other patient",
            fileNumber: 2n,
            phone: "+22220123456",
            gender: "male",
            isChild: true,
          },
        });
        const otherPlan = await prisma.treatmentPlan.create({
          data: {
            id: randomUUID(),
            clinicId,
            patientId: other.id,
            title: "Other plan",
            notes: "",
          },
        });
        const otherItem = await prisma.treatmentItem.create({
          data: {
            id: randomUUID(),
            clinicId,
            planId: otherPlan.id,
            description: "Other act",
            location: "26",
            notes: "",
          },
        });
        const arrived = (await http("post", "/", { patientId, doctorId })).body;
        const started = (
          await http("post", `/${arrived.id}/start`, { editVersion: 1 })
        ).body;
        for (const item of [foreignItem, otherItem])
          expect(
            (
              await http("post", `/${arrived.id}/procedures`, {
                source: "plan",
                id: randomUUID(),
                visitVersion: started.visit.editVersion,
                itemId: item.id,
                itemVersion: 1,
                notes: "",
              })
            ).status,
          ).toBe(404);
        expect(
          (await http("get", `/patient/${foreignPatient.id}/treatment-plans`))
            .status,
        ).toBe(404);
        expect(
          (
            await http("patch", `/treatment-items/${foreignItem.id}`, {
              kind: "status",
              editVersion: 1,
              status: "cancelled",
              reason: "No access",
            })
          ).status,
        ).toBe(404);
        const reception = await prisma.user.findFirstOrThrow({
          where: {
            clinicId,
            userRoles: { some: { role: { key: "receptionist" } } },
          },
        });
        const auth = sign(reception.id);
        expect(
          (await http("get", `/${arrived.id}/procedures`, undefined, auth))
            .status,
        ).toBe(403);
        expect(
          (
            await http(
              "post",
              `/${arrived.id}/procedures`,
              {
                source: "standalone",
                id: randomUUID(),
                visitVersion: 1,
                description: "No access",
                location: "",
                notes: "",
              },
              auth,
            )
          ).status,
        ).toBe(403);
        expect(
          (await http("get", `/${arrived.id}`, undefined, auth)).status,
        ).toBe(200);
        expect(
          (await http("get", `/${arrived.id}/procedures`)).body,
        ).toMatchObject({ visitVersion: 1, items: [] });
      } finally {
        await prisma.treatmentItem.delete({ where: { id: foreignItem.id } });
        await prisma.treatmentPlan.delete({ where: { id: foreignPlan.id } });
        await prisma.patient.delete({ where: { id: foreignPatient.id } });
        await prisma.clinic.delete({ where: { id: foreign.id } });
      }
    });
  },
);
