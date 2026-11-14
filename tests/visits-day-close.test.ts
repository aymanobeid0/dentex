import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import { app, prisma, visitsMaintenance } from "../server/app";
import { startVisitsMaintenance } from "../server/infrastructure/visits-maintenance";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "automatic clinic-day close through HTTP",
  () => {
    const prefix = `visits05-${crypto.randomUUID()}`;
    const extraClinics: string[] = [];
    const origin = "http://localhost:5173";
    let clinicId: string,
      userId: string,
      doctorId: string,
      counter = 0;
    const cookie = () =>
      `dentex_session=${jwt.sign({ kind: "clinic", version: 1 }, process.env.JWT_SECRET!, { subject: userId, expiresIn: "1h" })}`;
    const get = (path = "") =>
      request(app).get(`/api/clinic/visits${path}`).set("Cookie", cookie());
    const post = (path: string, body: object) =>
      request(app)
        .post(`/api/clinic/visits${path}`)
        .set("Cookie", cookie())
        .set("Origin", origin)
        .send(body);
    async function arrive() {
      const patient = await prisma.patient.create({
        data: {
          clinicId,
          name: prefix,
          fileNumber: BigInt(++counter),
          phone: "+22220123456",
          gender: "male",
          isChild: true,
        },
      });
      const result = await post("", { patientId: patient.id, doctorId });
      expect(result.status).toBe(201);
      return result.body;
    }
    beforeAll(async () => {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (
        url.pathname !== "/dentex_test" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
      )
        throw Error("Isolated dentex_test required");
      process.env.JWT_SECRET = "synthetic-visits05-tests-secret-at-least-32";
      process.env.APP_ORIGIN = origin;
      const used = new Set((await prisma.clinic.findMany()).map((x) => x.code));
      const code = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      )
        .reverse()
        .find((x) => !used.has(x))!;
      clinicId = (await prisma.clinic.create({ data: { name: prefix, code } }))
        .id;
      const admin = await prisma.role.create({
        data: { clinicId, key: "admin" },
      });
      const dentist = await prisma.role.create({
        data: { clinicId, key: "dentist" },
      });
      userId = (
        await prisma.user.create({
          data: {
            clinicId,
            name: prefix,
            username: `${prefix}-admin`,
            passwordHash: "unused-synthetic-hash",
          },
        })
      ).id;
      doctorId = (
        await prisma.user.create({
          data: {
            clinicId,
            name: prefix,
            username: `${prefix}-doctor`,
            passwordHash: "unused-synthetic-hash",
          },
        })
      ).id;
      await prisma.userRole.createMany({
        data: [
          { clinicId, userId, roleId: admin.id },
          { clinicId, userId: doctorId, roleId: dentist.id },
        ],
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });
    afterAll(async () => {
      for (const owned of [clinicId, ...extraClinics].filter(Boolean)) {
        await prisma.attendanceCorrection.deleteMany({
          where: { clinicId: owned },
        });
        await prisma.visit.deleteMany({ where: { clinicId: owned } });
        await prisma.attendance.deleteMany({ where: { clinicId: owned } });
        await prisma.userRole.deleteMany({ where: { clinicId: owned } });
        await prisma.role.deleteMany({ where: { clinicId: owned } });
        await prisma.user.deleteMany({ where: { clinicId: owned } });
        await prisma.patient.deleteMany({ where: { clinicId: owned } });
        await prisma.clinic.delete({ where: { id: owned } });
      }
      await prisma.$disconnect();
    });
    it.each(["start", "complete"] as const)(
      "commits midnight closure before a %s whose independent catchup finished on the previous day",
      async (command) => {
        const day = command === "start" ? "2001-04-01" : "2001-04-03";
        const nextDay = command === "start" ? "2001-04-02" : "2001-04-04";
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(`${day}T09:00:00.000Z`));
        const row = await arrive();
        if (command === "complete")
          expect((await post(`/${row.id}/start`, { editVersion: 1 })).status).toBe(200);
        vi.setSystemTime(new Date(`${day}T23:59:59.000Z`));
        const original = Date.prototype.toISOString;
        let catchups = 0;
        // Only time is controlled: both maintenance transactions and the human
        // transaction still acquire real PostgreSQL locks and use real storage.
        const clock = vi.spyOn(Date.prototype, "toISOString").mockImplementation(function (this: Date) {
          const result = original.call(this);
          if (result === `${day}T23:59:59.000Z` && ++catchups === 2)
            vi.setSystemTime(new Date(`${nextDay}T00:00:00.000Z`));
          return result;
        });
        const result = await post(`/${row.id}/${command}`, command === "start"
          ? { editVersion: 1 }
          : { editVersion: 2, visitVersion: 1 });
        clock.mockRestore();
        expect(catchups).toBeGreaterThanOrEqual(2);
        expect(result.status).toBe(409);
        expect(result.body).toEqual({ error: "edit_conflict" });
        // Check persistence before a later GET could conceal a rolled-back close.
        expect(await prisma.attendance.findUnique({ where: { id: row.id } })).toMatchObject({
          status: "auto_closed", editVersion: command === "start" ? 2 : 3,
          recordedEndAt: null,
          autoClosedRecordedAt: new Date(`${nextDay}T00:00:00.000Z`),
        });
        const closed = (await get(`/${row.id}`)).body;
        expect(closed.status).toBe("auto_closed");
        if (command === "start") expect(closed.visit).toBeUndefined();
        else expect(closed.visit).toMatchObject({ status: "auto_closed", editVersion: 2, recordedEndAt: null });
      },
    );
    it.each([false, true])(
      "catches up after a human lock waits across midnight and freshly authorizes the retry (role removed: %s)",
      async (removeRole) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        const day = removeRole ? "2001-05-03" : "2001-05-01";
        const nextDay = removeRole ? "2001-05-04" : "2001-05-02";
        vi.setSystemTime(new Date(`${day}T09:00:00Z`));
        const row = await arrive();
        expect((await post(`/${row.id}/start`, { editVersion: 1 })).status).toBe(200);
        vi.setSystemTime(new Date(`${day}T23:59:59Z`));
        const assignment = await prisma.userRole.findFirstOrThrow({ where: { userId } });
        const blockers = Array.from({ length: 3 }, () => new Client({ connectionString: process.env.TEST_DATABASE_URL }));
        const blockerPids: number[] = [];
        let pending: Promise<request.Response> | undefined;
        const waitForBlockedRequest = async (holder: Client, waiterPid?: number) => {
          const deadline = performance.now() + 1500;
          while (performance.now() < deadline) {
            const result = await holder.query("SELECT 1 FROM pg_stat_activity WHERE ($1::integer IS NULL AND pg_backend_pid()=ANY(pg_blocking_pids(pid))) OR (pid=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0)", [waiterPid ?? null]);
            if (result.rowCount) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw Error("Expected request to wait on owned clinic lock");
        };
        const lock = (client: Client) => client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [clinicId]);
        try {
          for (const client of blockers) {
            await client.connect();
            blockerPids.push((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
            await client.query("BEGIN");
          }
          await lock(blockers[0]);
          pending = post(`/${row.id}/complete`, { editVersion: 2, visitVersion: 1 }).then((result) => result);
          await waitForBlockedRequest(blockers[0]);
          const secondLock = lock(blockers[1]);
          // Enqueue behind the controller's catchup, before releasing it.
          await waitForBlockedRequest(blockers[0], blockerPids[1]);
          await blockers[0].query("COMMIT");
          await secondLock;
          await waitForBlockedRequest(blockers[1]);
          const thirdLock = lock(blockers[2]);
          await waitForBlockedRequest(blockers[1], blockerPids[2]);
          await blockers[1].query("COMMIT");
          await thirdLock;
          // Both catchups committed yesterday; the human transaction is now
          // waiting behind our final real PostgreSQL lock at midnight.
          await waitForBlockedRequest(blockers[2]);
          vi.setSystemTime(new Date(`${nextDay}T00:00:00Z`));
          if (removeRole) await blockers[2].query("DELETE FROM user_roles WHERE user_id=$1", [userId]);
          await blockers[2].query("COMMIT");
          const result = await pending;
          expect(result.status).toBe(removeRole ? 403 : 409);
          expect(await prisma.attendance.findUnique({ where: { id: row.id } })).toMatchObject({ status: "auto_closed", editVersion: 3, recordedEndAt: null });
          expect(await prisma.visit.findFirst({ where: { attendanceId: row.id } })).toMatchObject({ status: "auto_closed", editVersion: 2, recordedEndAt: null });
        } finally {
          for (const client of blockers) {
            await client.query("ROLLBACK").catch(() => {});
            await client.end();
          }
          await pending?.catch(() => {});
          await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: assignment.roleId } }, create: assignment, update: {} });
        }
      },
    );
    it("closes waiting at exact midnight without a visit, preserving original arrival and distinct processing time", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-13T23:59:59.999Z"));
      const row = await arrive();
      expect((await get(`/${row.id}`)).body.status).toBe("waiting");
      vi.setSystemTime(new Date("2026-11-14T00:00:00.000Z"));
      const closed = await get(`/${row.id}`);
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({
        status: "auto_closed",
        arrivedAt: row.arrivedAt,
        recordedEndAt: null,
        editVersion: 2,
        autoClosure: {
          effectiveClosedAt: "2026-11-14T00:00:00.000Z",
          recordedAt: "2026-11-14T00:00:00.000Z",
          reason: "clinic_day_end",
        },
      });
      expect(closed.body.visit).toBeUndefined();
      vi.setSystemTime(new Date("2026-11-16T08:00:00.000Z"));
      expect((await get(`/${row.id}`)).body).toEqual(closed.body);
      expect((await get()).body.items).toEqual([]);
      expect(
        (await post("", { patientId: row.patient.id, doctorId })).status,
      ).toBe(201);
    });
    it("commits delayed closure before rejecting malformed IDs, invalid bodies, and stale human writes", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-17T15:00:00.000Z"));
      const waiting = await arrive();
      const entered = await post(`/${waiting.id}/start`, { editVersion: 1 });
      expect(entered.status).toBe(200);
      vi.setSystemTime(new Date("2026-11-20T10:15:00.000Z"));
      expect((await post("/invalid-id/complete", {})).status).toBe(404);
      // Observe persistence before another visits request could lazily repair it.
      expect(
        await prisma.attendance.findUnique({ where: { id: waiting.id } }),
      ).toMatchObject({ status: "auto_closed", editVersion: 3 });
      const closed = await get(`/${waiting.id}`);
      expect(closed.body).toMatchObject({
        status: "auto_closed",
        recordedEndAt: null,
        autoClosure: {
          effectiveClosedAt: "2026-11-18T00:00:00.000Z",
          recordedAt: "2026-11-20T10:15:00.000Z",
        },
        visit: {
          status: "auto_closed",
          startedAt: "2026-11-17T15:00:00.000Z",
          recordedEndAt: null,
          editVersion: 2,
        },
      });
      expect(
        (
          await post(`/${waiting.id}/complete`, {
            editVersion: 2,
            visitVersion: 1,
          })
        ).body,
      ).toEqual({ error: "edit_conflict" });
      const next = await arrive();
      expect((await post(`/${next.id}/start`, { editVersion: 1 })).status).toBe(
        200,
      );
      vi.setSystemTime(new Date("2026-11-21T00:00:00.000Z"));
      expect(
        (await post(`/${next.id}/complete`, { unrecognized: true })).status,
      ).toBe(400);
      expect(
        await prisma.attendance.findUnique({ where: { id: next.id } }),
      ).toMatchObject({ status: "auto_closed", editVersion: 3 });
    });
    it("preserves a current-day legacy visit and invalid entries while catching up its older attendance", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-22T10:00:00.000Z"));
      const row = await arrive();
      const entered = (await post(`/${row.id}/start`, { editVersion: 1 })).body;
      await prisma.attendance.update({
        where: { id: row.id },
        data: { arrivedAt: new Date("2026-11-20T09:00:00Z") },
      });
      const invalid = await prisma.visit.create({
        data: {
          clinicId,
          attendanceId: row.id,
          patientId: row.patient.id,
          doctorId,
          createdBy: userId,
          startedAt: new Date("2026-11-20T10:00:00Z"),
          status: "entry_recorded_in_error",
        },
      });
      const preserved = (await get(`/${row.id}`)).body;
      expect(preserved).toMatchObject({
        status: "with_doctor",
        editVersion: 2,
        visit: entered.visit,
        invalidEntries: [
          { id: invalid.id, status: "entry_recorded_in_error", editVersion: 1 },
        ],
      });
      expect(preserved.autoClosure).toBeUndefined();
      vi.setSystemTime(new Date("2026-11-23T02:00:00.000Z"));
      const closed = (await get(`/${row.id}`)).body;
      expect(closed).toMatchObject({
        status: "auto_closed",
        autoClosure: {
          effectiveClosedAt: "2026-11-23T00:00:00.000Z",
          recordedAt: "2026-11-23T02:00:00.000Z",
        },
        visit: {
          ...entered.visit,
          status: "auto_closed",
          editVersion: 2,
          autoClosure: { effectiveClosedAt: "2026-11-23T00:00:00.000Z" },
        },
      });
      expect(closed.invalidEntries).toEqual(preserved.invalidEntries);
    });
    it("rolls back both closure halves after a late database failure, then retries successfully", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-24T10:00:00.000Z"));
      const row = await arrive();
      const entered = (await post(`/${row.id}/start`, { editVersion: 1 })).body;
      vi.setSystemTime(new Date("2026-11-25T00:00:00.000Z"));
      const client = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await client.connect();
      const suffix = crypto.randomUUID().replaceAll("-", "");
      try {
        await client.query(
          `CREATE FUNCTION close_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${row.id}'::uuid AND NEW.status='auto_closed' THEN RAISE EXCEPTION 'synthetic late close failure'; END IF; RETURN NEW; END $$`,
        );
        await client.query(
          `CREATE TRIGGER close_fail_${suffix} BEFORE UPDATE ON attendances FOR EACH ROW EXECUTE FUNCTION close_fail_${suffix}()`,
        );
        expect((await get(`/${row.id}`)).status).toBe(500);
        expect(
          await prisma.attendance.findUnique({ where: { id: row.id } }),
        ).toMatchObject({
          status: "with_doctor",
          editVersion: 2,
          effectiveClosedAt: null,
        });
        expect(
          await prisma.visit.findUnique({ where: { id: entered.visit.id } }),
        ).toMatchObject({
          status: "in_progress",
          editVersion: 1,
          effectiveClosedAt: null,
        });
      } finally {
        await client.query(
          `DROP TRIGGER IF EXISTS close_fail_${suffix} ON attendances`,
        );
        await client.query(`DROP FUNCTION IF EXISTS close_fail_${suffix}()`);
        await client.end();
      }
      expect((await get(`/${row.id}`)).body).toMatchObject({
        status: "auto_closed",
        editVersion: 3,
        visit: { status: "auto_closed", editVersion: 2 },
      });
    });
    it("discovers due clinics without an actor, serializes with human writes, and is idempotent", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // Earlier than the pre-existing browser fixture: never process its activity.
      vi.setSystemTime(new Date("2001-01-01T09:00:00.000Z"));
      const row = await arrive();
      const entered = (await post(`/${row.id}/start`, { editVersion: 1 })).body;
      vi.setSystemTime(new Date("2001-01-04T12:00:00.000Z"));
      expect(
        await prisma.attendance.count({
          where: {
            clinicId: { not: clinicId },
            status: { in: ["waiting", "with_doctor"] },
            arrivedAt: { lt: new Date() },
          },
        }),
      ).toBe(0);
      const [, human] = await Promise.all([
        (async () => {
          const worker = startVisitsMaintenance(visitsMaintenance);
          await worker.stop();
        })(),
        post(`/${row.id}/complete`, { editVersion: 2, visitVersion: 1 }),
      ]);
      expect(human.status).toBe(409);
      const closed = (await get(`/${row.id}`)).body;
      expect(closed).toMatchObject({
        status: "auto_closed",
        editVersion: 3,
        autoClosure: {
          effectiveClosedAt: "2001-01-02T00:00:00.000Z",
          recordedAt: "2001-01-04T12:00:00.000Z",
        },
        visit: { id: entered.visit.id, status: "auto_closed", editVersion: 2 },
      });
      await visitsMaintenance.maintain();
      expect((await get(`/${row.id}`)).body).toEqual(closed);
    });
    it("keeps catchup committed when the actor loses their role while waiting for the clinic lock", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2001-02-01T09:00:00Z"));
      const row = await arrive();
      expect((await post(`/${row.id}/start`, { editVersion: 1 })).status).toBe(
        200,
      );
      vi.setSystemTime(new Date("2001-02-02T01:00:00Z"));
      const assignment = await prisma.userRole.findFirstOrThrow({
        where: { userId },
      });
      const client = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
          clinicId,
        ]);
        const pending = post(`/${row.id}/complete`, {
          editVersion: 2,
          visitVersion: 1,
        }).then((r) => r);
        let waiting = false;
        const deadline = performance.now() + 4000;
        while (performance.now() < deadline) {
          const found = await client.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
          );
          if (found.rowCount) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        await client.query("DELETE FROM user_roles WHERE user_id=$1", [userId]);
        await client.query("COMMIT");
        expect((await pending).status).toBe(403);
        expect(
          await prisma.attendance.findUnique({ where: { id: row.id } }),
        ).toMatchObject({ status: "auto_closed", editVersion: 3 });
        expect(
          await prisma.visit.findFirst({ where: { attendanceId: row.id } }),
        ).toMatchObject({
          status: "auto_closed",
          editVersion: 2,
          recordedEndAt: null,
        });
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        await client.end();
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId: assignment.roleId } },
          create: assignment,
          update: {},
        });
      }
    });
    it("commits each discovered clinic independently and retries a failed clinic without rewriting the successful one", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2001-03-01T09:00:00Z"));
      const first = await arrive();
      const used = new Set((await prisma.clinic.findMany()).map((x) => x.code));
      const code = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      ).find((x) => !used.has(x))!;
      const other = await prisma.clinic.create({
        data: { name: prefix, code },
      });
      extraClinics.push(other.id);
      const user = await prisma.user.create({
        data: {
          clinicId: other.id,
          name: prefix,
          username: prefix,
          passwordHash: "unused-synthetic-hash",
        },
      });
      const patient = await prisma.patient.create({
        data: {
          clinicId: other.id,
          name: prefix,
          fileNumber: 1n,
          phone: "+22220123456",
          gender: "male",
          isChild: true,
        },
      });
      const second = await prisma.attendance.create({
        data: {
          clinicId: other.id,
          patientId: patient.id,
          doctorId: user.id,
          createdBy: user.id,
          arrivedAt: new Date(),
        },
      });
      vi.setSystemTime(new Date("2001-03-02T03:00:00Z"));
      expect(
        await prisma.attendance.count({
          where: {
            clinicId: { notIn: [clinicId, other.id] },
            status: { in: ["waiting", "with_doctor"] },
            arrivedAt: { lt: new Date() },
          },
        }),
      ).toBe(0);
      const client = new Client({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      await client.connect();
      const suffix = crypto.randomUUID().replaceAll("-", "");
      try {
        await client.query(
          `CREATE FUNCTION close_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${first.id}'::uuid AND NEW.status='auto_closed' THEN RAISE EXCEPTION 'synthetic clinic failure'; END IF; RETURN NEW; END $$`,
        );
        await client.query(
          `CREATE TRIGGER close_fail_${suffix} BEFORE UPDATE ON attendances FOR EACH ROW EXECUTE FUNCTION close_fail_${suffix}()`,
        );
        await expect(visitsMaintenance.maintain()).rejects.toThrow(
          "Visits day-close maintenance failed",
        );
        expect(
          await prisma.attendance.findUnique({ where: { id: first.id } }),
        ).toMatchObject({ status: "waiting", editVersion: 1 });
        expect(
          await prisma.attendance.findUnique({ where: { id: second.id } }),
        ).toMatchObject({
          status: "auto_closed",
          editVersion: 2,
          autoClosedRecordedAt: new Date("2001-03-02T03:00:00Z"),
        });
      } finally {
        await client.query(
          `DROP TRIGGER IF EXISTS close_fail_${suffix} ON attendances`,
        );
        await client.query(`DROP FUNCTION IF EXISTS close_fail_${suffix}()`);
        await client.end();
      }
      vi.setSystemTime(new Date("2001-03-03T04:00:00Z"));
      // A delayed server startup retries the due clinic before any human read.
      const restarted = startVisitsMaintenance(visitsMaintenance);
      await restarted.stop();
      expect(
        await prisma.attendance.findUnique({ where: { id: first.id } }),
      ).toMatchObject({ status: "auto_closed", editVersion: 2 });
      expect((await get(`/${first.id}`)).body).toMatchObject({
        status: "auto_closed",
        editVersion: 2,
        autoClosure: { recordedAt: "2001-03-03T04:00:00.000Z" },
      });
      expect(
        await prisma.attendance.findUnique({ where: { id: second.id } }),
      ).toMatchObject({
        status: "auto_closed",
        editVersion: 2,
        autoClosedRecordedAt: new Date("2001-03-02T03:00:00Z"),
      });
    });
  },
);
