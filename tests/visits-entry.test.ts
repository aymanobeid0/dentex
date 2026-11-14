import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Client } from "pg";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, prisma } from "../server/app";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "doctor entry through HTTP on isolated storage",
  () => {
    const prefix = `visits02-${crypto.randomUUID()}`;
    const clinics: string[] = [],
      patients: string[] = [],
      doctors: string[] = [];
    const users: string[] = [],
      roles: string[] = [];
    const origin = "http://localhost:5173";
    const cookie = (id: string, kind = "clinic", version = 1) =>
      `dentex_session=${jwt.sign({ kind, version }, process.env.JWT_SECRET!, { subject: id, expiresIn: "1h" })}`;
    let admin: string,
      receptionist: string,
      dentist: string,
      neither: string,
      platform: string;
    const get = (path = "", auth = admin) =>
      request(app).get(`/api/clinic/visits${path}`).set("Cookie", auth);
    const arrive = (
      patientId = patients[0],
      doctorId = doctors[0],
      auth = admin,
      extra = {},
    ) =>
      request(app)
        .post("/api/clinic/visits")
        .set("Cookie", auth)
        .set("Origin", origin)
        .send({ patientId, doctorId, ...extra });
    const edit = (id: string, body: object, auth = admin) =>
      request(app)
        .patch(`/api/clinic/visits/${id}`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send(body);
    beforeAll(async () => {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (
        url.pathname !== "/dentex_test" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
      )
        throw Error("Isolated dentex_test required");
      process.env.JWT_SECRET = "synthetic-visits-tests-secret-32-characters";
      process.env.APP_ORIGIN = origin;
      const used = new Set((await prisma.clinic.findMany()).map((x) => x.code));
      const codes = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      )
        .filter((x) => !used.has(x))
        .reverse();
      for (let c = 0; c < 2; c++) {
        const clinic = await prisma.clinic.create({
          data: { name: prefix, code: codes[c] },
        });
        clinics.push(clinic.id);
        for (let p = 0; p < 7; p++)
          patients.push(
            (
              await prisma.patient.create({
                data: {
                  clinicId: clinic.id,
                  name: `Arrival patient ${c}/${p}`,
                  fileNumber: BigInt(p + 1),
                  phone: "+22220123456",
                  gender: "male",
                  isChild: true,
                },
              })
            ).id,
          );
        for (const key of ["admin", "dentist", "receptionist"])
          roles.push(
            (await prisma.role.create({ data: { clinicId: clinic.id, key } }))
              .id,
          );
        for (let u = 0; u < 5; u++) {
          const user = await prisma.user.create({
            data: {
              clinicId: clinic.id,
              name: `Arrival doctor ${c}/${u}`,
              username: `${prefix}-${u}`,
              passwordHash: "unused-synthetic-hash",
            },
          });
          users.push(user.id);
          if (u < 4)
            await prisma.userRole.create({
              data: {
                clinicId: clinic.id,
                userId: user.id,
                roleId: roles[c * 3 + (u === 3 ? 1 : u)],
              },
            });
          if (u === 1 || u === 3) doctors.push(user.id);
        }
      }
      [admin, dentist, receptionist, , neither] = users.map((id) => cookie(id));
      const root = await prisma.platformAdmin.create({
        data: {
          username: prefix,
          email: `${prefix}@example.test`,
          passwordHash: "unused-synthetic-hash",
        },
      });
      platform = cookie(root.id, "platform");
    });
    afterAll(async () => {
      for (const clinicId of clinics) {
        await prisma.visit.deleteMany({ where: { clinicId } });
        // Cleanup only this suite's synthetic rows; tolerate the initial red before its table exists.
        await prisma.$executeRaw`DELETE FROM attendances WHERE clinic_id=${clinicId}::uuid`.catch(
          () => {},
        );
        await prisma.userRole.deleteMany({ where: { clinicId } });
        await prisma.role.deleteMany({ where: { clinicId } });
        await prisma.user.deleteMany({ where: { clinicId } });
        await prisma.patient.deleteMany({ where: { clinicId } });
        await prisma.clinic.delete({ where: { id: clinicId } });
      }
      await prisma.platformAdmin.deleteMany({ where: { username: prefix } });
      await prisma.$disconnect();
    });
    it("creates a visit only on entry and completes it without inventing departure or treatment", async () => {
      const row = (await arrive()).body;
      expect((await get(`/patient/${patients[0]}?page=1`)).body.items).toEqual([
        row,
      ]);
      const started = await request(app)
        .post(`/api/clinic/visits/${row.id}/start`)
        .set("Cookie", receptionist)
        .set("Origin", origin)
        .send({ editVersion: 1 });
      expect(started.status).toBe(200);
      expect(started.body).toMatchObject({
        id: row.id,
        status: "with_doctor",
        arrivedAt: row.arrivedAt,
        recordedEndAt: null,
        editVersion: 2,
        visit: { status: "in_progress", editVersion: 1, recordedEndAt: null },
      });
      const done = await request(app)
        .post(`/api/clinic/visits/${row.id}/complete`)
        .set("Cookie", dentist)
        .set("Origin", origin)
        .send({ editVersion: 2, visitVersion: 1 });
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({
        status: "completed",
        editVersion: 3,
        visit: {
          id: started.body.visit.id,
          status: "completed",
          editVersion: 2,
        },
      });
      expect((await get(`/patient/${patients[0]}?page=1`)).body.items).toEqual([
        done.body,
      ]);
      expect((await arrive()).status).toBe(201);
    });
    const start = (id: string, body: object, auth = admin) =>
      request(app)
        .post(`/api/clinic/visits/${id}/start`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send(body);
    const complete = (row: any, auth = admin) =>
      request(app)
        .post(`/api/clinic/visits/${row.id}/complete`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send({
          editVersion: row.editVersion,
          visitVersion: row.visit.editVersion,
        });
    it("starts a non-first patient with distinct entry time and atomically confirms the named previous visit", async () => {
      const first = (await arrive(patients[1])).body,
        second = (await arrive(patients[2])).body;
      const entered = (await start(second.id, { editVersion: 1 }, dentist))
        .body;
      expect(entered.arrivedAt).toBe(second.arrivedAt);
      expect(Date.parse(entered.visit.startedAt)).toBeGreaterThanOrEqual(
        Date.parse(second.arrivedAt),
      );
      expect((await start(first.id, { editVersion: 1 })).body).toEqual({
        error: "doctor_busy",
      });
      const confirmation = {
        attendanceId: entered.id,
        editVersion: entered.editVersion,
        visitVersion: entered.visit.editVersion,
        confirmed: true,
      };
      expect(
        (
          await start(first.id, {
            editVersion: 1,
            previous: { ...confirmation, visitVersion: 2 },
          })
        ).body,
      ).toEqual({ error: "edit_conflict" });
      expect((await get(`/${entered.id}`)).body).toEqual(entered);
      const next = await start(
        first.id,
        { editVersion: 1, previous: confirmation },
        receptionist,
      );
      expect(next.status).toBe(200);
      expect(next.body).toMatchObject({
        status: "with_doctor",
        arrivedAt: first.arrivedAt,
      });
      const previous = (await get(`/${entered.id}`)).body;
      expect(previous).toMatchObject({
        status: "completed",
        visit: { status: "completed", editVersion: 2 },
      });
      expect(previous.recordedEndAt).toBe(next.body.visit.startedAt);
      expect((await complete(next.body)).status).toBe(200);
    });
    it("serializes concurrent starts and duplicate completion without duplicate visits", async () => {
      const first = (await arrive(patients[3])).body,
        second = (await arrive(patients[4])).body;
      const result = await Promise.all([
        start(first.id, { editVersion: 1 }),
        start(second.id, { editVersion: 1 }, dentist),
      ]);
      expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
      const entered = result.find((r) => r.status === 200)!.body;
      expect((await arrive(entered.patient.id, doctors[1])).body).toEqual({
        error: "attendance_active",
      });
      const finished = await Promise.all([
        complete(entered),
        complete(entered, receptionist),
      ]);
      expect(finished.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        (await get(`/patient/${entered.patient.id}?page=1`)).body.items,
      ).toHaveLength(1);
    });
    it("checks next eligibility and both attendance versions before ending a previous visit, yet permits completion after lost eligibility", async () => {
      const previous = (
        await start((await arrive(patients[5])).body.id, { editVersion: 1 })
      ).body;
      const next = (await arrive(patients[6])).body;
      const confirmation = {
        attendanceId: previous.id,
        editVersion: previous.editVersion,
        visitVersion: 1,
        confirmed: true,
      };
      await prisma.patient.update({
        where: { id: patients[6] },
        data: { archived: true },
      });
      expect(
        (await start(next.id, { editVersion: 1, previous: confirmation })).body,
      ).toEqual({ error: "patient_archived" });
      expect((await get(`/${previous.id}`)).body).toEqual(previous);
      await prisma.patient.update({
        where: { id: patients[6] },
        data: { archived: false },
      });
      expect(
        (await start(next.id, { editVersion: 2, previous: confirmation })).body,
      ).toEqual({ error: "edit_conflict" });
      expect(
        (
          await start(next.id, {
            editVersion: 1,
            previous: { ...confirmation, editVersion: 1 },
          })
        ).body,
      ).toEqual({ error: "edit_conflict" });
      await prisma.user.update({
        where: { id: doctors[0] },
        data: { active: false },
      });
      expect(
        (await start(next.id, { editVersion: 1, previous: confirmation })).body,
      ).toEqual({ error: "doctor_ineligible" });
      await prisma.patient.update({
        where: { id: patients[5] },
        data: { archived: true },
      });
      expect((await complete(previous, receptionist)).status).toBe(200);
      await prisma.user.update({
        where: { id: doctors[0] },
        data: { active: true },
      });
      await prisma.patient.update({
        where: { id: patients[5] },
        data: { archived: false },
      });
    });
    it("protects entry, completion and paginated history from foreign clinics, platform and missing roles without leaking projections", async () => {
      const row = (await get()).body.items[0];
      for (const auth of [platform, neither]) {
        expect(
          (await start(row.id, { editVersion: row.editVersion }, auth)).status,
        ).toBe(403);
        expect(
          (await get(`/patient/${row.patient.id}?page=1`, auth)).status,
        ).toBe(403);
      }
      expect((await get(`/patient/${patients[7]}?page=1`)).status).toBe(404);
      expect(
        (await start(row.id, { editVersion: 1 }, cookie(users[5]))).status,
      ).toBe(404);
      expect((await get(`/patient/${patients[0]}?page=0`)).status).toBe(400);
      expect(
        (await start(row.id, { editVersion: 1, startedAt: "2020-01-01" }))
          .status,
      ).toBe(400);
      const history = await get(`/patient/${patients[1]}?page=1`);
      expect(history.body).toMatchObject({ page: 1, hasNext: false });
      expect(Object.keys(history.body.items[0].visit).sort()).toEqual(
        [
          "id",
          "status",
          "startedAt",
          "recordedEndAt",
          "editVersion",
          "appointmentLink",
        ].sort(),
      );
      expect(Object.keys(history.body.items[0].patient).sort()).toEqual(
        ["id", "name", "fileNumber", "archived"].sort(),
      );
    });
    it("rolls back the previous completion when inserting the next visit fails late", async () => {
      const waiting = (await get()).body.items.filter(
        (r: any) => r.doctor.id === doctors[0] && r.status === "waiting",
      );
      const previous = (
        await start(waiting[0].id, { editVersion: waiting[0].editVersion })
      ).body;
      const next = waiting[1];
      const connection = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await connection.connect();
      const suffix = crypto.randomUUID().replaceAll("-", "");
      try {
        await connection.query(
          `CREATE FUNCTION visit_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.attendance_id='${next.id}'::uuid THEN RAISE EXCEPTION 'synthetic late insert failure'; END IF; RETURN NEW; END $$`,
        );
        await connection.query(
          `CREATE TRIGGER visit_fail_${suffix} BEFORE INSERT ON visits FOR EACH ROW EXECUTE FUNCTION visit_fail_${suffix}()`,
        );
        const response = await start(next.id, {
          editVersion: next.editVersion,
          previous: {
            attendanceId: previous.id,
            editVersion: previous.editVersion,
            visitVersion: previous.visit.editVersion,
            confirmed: true,
          },
        });
        expect(response.status).toBe(500);
        expect((await get(`/${previous.id}`)).body).toEqual(previous);
        expect((await get(`/${next.id}`)).body).toEqual(next);
      } finally {
        await connection.query(
          `DROP TRIGGER IF EXISTS visit_fail_${suffix} ON visits`,
        );
        await connection.query(
          `DROP FUNCTION IF EXISTS visit_fail_${suffix}()`,
        );
        await connection.end();
      }
      expect((await complete(previous)).status).toBe(200);
    });
    it.each(["actor role", "patient archive", "doctor role"] as const)(
      "rechecks %s after the lock on entry and keeps waiting unchanged",
      async (change) => {
        const row = (await get()).body.items.find(
          (r: any) => r.status === "waiting" && r.doctor.id === doctors[0],
        );
        const connection = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
        await connection.connect();
        let operation: PromiseLike<request.Response> | undefined;
        try {
          await connection.query("BEGIN");
          await connection.query(
            "SELECT id FROM clinics WHERE id=$1::uuid FOR UPDATE",
            [clinics[0]],
          );
          operation = start(
            row.id,
            { editVersion: row.editVersion },
            receptionist,
          ).then((r) => r);
          const deadline = Date.now() + 4000;
          let waiting = false;
          while (Date.now() < deadline) {
            const result = await connection.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
            );
            if (result.rowCount) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(waiting).toBe(true);
          if (change === "actor role")
            await connection.query(
              "DELETE FROM user_roles WHERE user_id=$1::uuid",
              [users[2]],
            );
          if (change === "patient archive")
            await connection.query(
              "UPDATE patients SET archived=true WHERE id=$1::uuid",
              [row.patient.id],
            );
          if (change === "doctor role")
            await connection.query(
              "DELETE FROM user_roles WHERE user_id=$1::uuid",
              [doctors[0]],
            );
          await connection.query("COMMIT");
          expect((await operation).status).toBe(
            change === "actor role" ? 403 : 409,
          );
          const latest = (await get(`/${row.id}`)).body;
          expect(latest.status).toBe("waiting");
          expect(latest.visit).toBeUndefined();
          expect(latest.editVersion).toBe(row.editVersion);
        } finally {
          await connection.query("ROLLBACK");
          await connection.end();
          await operation;
          if (change === "actor role")
            await prisma.userRole.create({
              data: {
                clinicId: clinics[0],
                userId: users[2],
                roleId: roles[2],
              },
            });
          if (change === "patient archive")
            await prisma.patient.update({
              where: { id: row.patient.id },
              data: { archived: false },
            });
          if (change === "doctor role")
            await prisma.userRole.create({
              data: {
                clinicId: clinics[0],
                userId: doctors[0],
                roleId: roles[1],
              },
            });
        }
      },
    );
    it("closes yesterday waiting before entry and requires a new day attendance", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2026-11-13T23:59:00.000Z"));
        const waiting = (await arrive(patients[1], doctors[1])).body;
        vi.setSystemTime(new Date("2026-11-14T00:01:00.000Z"));
        const entered = await start(waiting.id, { editVersion: 1 });
        expect(entered.status).toBe(409);
        expect(entered.body).toEqual({ error: "edit_conflict" });
        const closed = (await get(`/${waiting.id}`)).body;
        expect(closed).toMatchObject({
          status: "auto_closed",
          arrivedAt: "2026-11-13T23:59:00.000Z",
          recordedEndAt: null,
          editVersion: 2,
        });
        expect(closed.visit).toBeUndefined();
        const fresh = (await arrive(patients[1], doctors[1])).body;
        const started = await start(fresh.id, { editVersion: 1 });
        expect(started.status).toBe(200);
        expect(started.body.visit.startedAt).toBe("2026-11-14T00:01:00.000Z");
        expect((await complete(started.body)).status).toBe(200);
      } finally {
        vi.useRealTimers();
      }
    });
    it("paginates attendance history without turning waiting or departures into visits", async () => {
      await prisma.attendance.createMany({
        data: Array.from({ length: 21 }, (_, i) => ({
          clinicId: clinics[0],
          patientId: patients[1],
          doctorId: doctors[1],
          createdBy: users[0],
          status: "left_before_entry",
          arrivedAt: new Date(
            `2026-10-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
          ),
          recordedEndAt: new Date(
            `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
          ),
        })),
      });
      const first = await get(`/patient/${patients[1]}?page=1`),
        second = await get(`/patient/${patients[1]}?page=2`);
      expect(first.body.items).toHaveLength(20);
      expect(first.body).toMatchObject({ page: 1, hasNext: true });
      //05 retains the closed prior-day attendance as well as the new day's entry.
      expect(second.body.items).toHaveLength(4);
      expect(second.body).toMatchObject({ page: 2, hasNext: false });
      expect(
        second.body.items.every(
          (r: any) => r.status === "left_before_entry" && !r.visit,
        ),
      ).toBe(true);
      expect(
        new Set(
          [...first.body.items, ...second.body.items].map((r: any) => r.id),
        ).size,
      ).toBe(24);
    });
  },
);
