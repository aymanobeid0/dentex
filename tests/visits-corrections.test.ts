import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Client } from "pg";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, prisma } from "../server/app";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "attendance corrections through HTTP on isolated storage",
  () => {
    const prefix = `visits04-${crypto.randomUUID()}`;
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
        await prisma.appointmentChange.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitChange.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitLink.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitPin.deleteMany({ where: { clinicId } });
        await prisma.appointment.deleteMany({ where: { clinicId } });
        await prisma.attendanceCorrection.deleteMany({ where: { clinicId } });
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
    const start = async (row: any) =>
      request(app)
        .post(`/api/clinic/visits/${row.id}/start`)
        .set("Cookie", admin)
        .set("Origin", origin)
        .send({ editVersion: row.editVersion });
    const correct = (row: any, body: object, auth = admin) =>
      request(app)
        .patch(`/api/clinic/visits/${row.id}/correction`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send({ editVersion: row.editVersion, ...body });
    it("invalidates a false entry with named audit and preserves it when a new visit starts", async () => {
      const row = (await arrive()).body;
      const entered = (await start(row)).body;
      const result = await correct(
        entered,
        {
          kind: "invalidate_entry",
          visitId: entered.visit.id,
          visitVersion: entered.visit.editVersion,
          outcome: "waiting",
          confirmed: true,
          reason: "Entry did not occur",
        },
        receptionist,
      );
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        status: "waiting",
        editVersion: 3,
        arrivedAt: row.arrivedAt,
        invalidEntries: [
          {
            id: entered.visit.id,
            status: "entry_recorded_in_error",
            startedAt: entered.visit.startedAt,
          },
        ],
        corrections: [
          {
            kind: "invalidate_entry",
            reason: "Entry did not occur",
            actor: { name: "Arrival doctor 0/2" },
            before: {
              status: "with_doctor",
              visit: { id: entered.visit.id, status: "in_progress" },
            },
            after: {
              status: "waiting",
              visit: {
                id: entered.visit.id,
                status: "entry_recorded_in_error",
              },
            },
          },
        ],
      });
      expect(result.body.visit).toBeUndefined();
      const next = await start(result.body);
      expect(next.status).toBe(200);
      expect(next.body.visit.id).not.toBe(entered.visit.id);
      expect(next.body.invalidEntries).toHaveLength(1);
      expect(
        (await get(`/patient/${patients[0]}?page=1`)).body.items[0],
      ).toEqual(next.body);
    });
    it("restores same-day waiting and reopens a completed visit only when both resources are free", async () => {
      const row = (await arrive(patients[1], doctors[1])).body;
      const left = (await edit(row.id, { kind: "leave", editVersion: 1 })).body;
      const restored = await correct(
        left,
        { kind: "restore_waiting" },
        dentist,
      );
      expect(restored.status).toBe(200);
      expect(restored.body.corrections[0]).toMatchObject({
        kind: "restore_waiting",
        before: { status: "left_before_entry" },
        after: { status: "waiting" },
        actor: { name: "Arrival doctor 0/1" },
      });
      const entered = (await start(restored.body)).body;
      const done = (
        await request(app)
          .post(`/api/clinic/visits/${row.id}/complete`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            editVersion: entered.editVersion,
            visitVersion: entered.visit.editVersion,
          })
      ).body;
      const reopened = await correct(done, {
        kind: "reopen_visit",
        visitId: done.visit.id,
        visitVersion: done.visit.editVersion,
      });
      expect(reopened.status).toBe(200);
      expect(reopened.body).toMatchObject({
        status: "with_doctor",
        recordedEndAt: null,
        visit: {
          id: entered.visit.id,
          startedAt: entered.visit.startedAt,
          status: "in_progress",
          recordedEndAt: null,
        },
      });
    });
    const remove = (row: any, auth = admin, extra = {}) =>
      request(app)
        .delete(`/api/clinic/visits/${row.id}`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send({
          editVersion: row.editVersion,
          confirmedNeverArrived: true,
          ...extra,
        });
    it("deletes a confirmed false attendance and its invalid entries but never a genuine encounter", async () => {
      const row = (await arrive(patients[2], doctors[1])).body;
      // Release the doctor's genuine prior encounter before creating this independent false entry.
      const active = (await get()).body.items.find(
        (x: any) =>
          x.doctor.id === doctors[1] && x.visit?.status === "in_progress",
      );
      if (active)
        await request(app)
          .post(`/api/clinic/visits/${active.id}/complete`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            editVersion: active.editVersion,
            visitVersion: active.visit.editVersion,
          });
      const entered = (await start(row)).body;
      const invalid = (
        await correct(entered, {
          kind: "invalidate_entry",
          visitId: entered.visit.id,
          visitVersion: 1,
          outcome: "left_before_entry",
          confirmed: true,
        })
      ).body;
      expect((await remove(invalid, receptionist)).status).toBe(204);
      expect((await get(`/${row.id}`)).status).toBe(404);
      expect((await get(`/patient/${patients[2]}?page=1`)).body.items).toEqual(
        [],
      );
      expect((await remove(invalid)).status).toBe(404);
      const genuine = (
        await start((await arrive(patients[3], doctors[1])).body)
      ).body;
      expect((await remove(genuine, dentist)).status).toBe(409);
      expect((await get(`/${genuine.id}`)).body).toEqual(genuine);
    });
    afterEach(() => vi.useRealTimers());
    let number = 100;
    async function fresh() {
      const p = await prisma.patient.create({
        data: {
          clinicId: clinics[0],
          name: `Correction patient ${++number}`,
          fileNumber: BigInt(number),
          phone: "+22220123456",
          gender: "male",
          isChild: true,
        },
      });
      return p.id;
    }
    async function freeDoctor() {
      for (const row of (await get()).body.items.filter(
        (x: any) => x.status === "with_doctor",
      ))
        expect(
          (
            await request(app)
              .post(`/api/clinic/visits/${row.id}/complete`)
              .set("Cookie", admin)
              .set("Origin", origin)
              .send({
                editVersion: row.editVersion,
                visitVersion: row.visit.editVersion,
              })
          ).status,
        ).toBe(200);
    }
    async function completed() {
      await freeDoctor();
      const entered = (await start((await arrive(await fresh())).body)).body;
      return (
        await request(app)
          .post(`/api/clinic/visits/${entered.id}/complete`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            editVersion: entered.editVersion,
            visitVersion: entered.visit.editVersion,
          })
      ).body;
    }
    const invalidation = (row: any, outcome = "waiting") => ({
      kind: "invalidate_entry",
      visitId: row.visit.id,
      visitVersion: row.visit.editVersion,
      outcome,
      confirmed: true,
    });
    it("selects the genuine current entry when its timestamp equals the retained invalid entry", async () => {
      await freeDoctor();
      vi.useFakeTimers({ toFake: ["Date"] });
      const entered = (await start((await arrive(await fresh())).body)).body;
      const invalid = await correct(entered, invalidation(entered));
      expect(invalid.status).toBe(200);
      const genuine = await start(invalid.body);
      expect(genuine.status).toBe(200);
      expect(genuine.body.visit.startedAt).toBe(entered.visit.startedAt);
      expect(genuine.body.visit.id).not.toBe(entered.visit.id);
      expect((await get(`/${entered.id}`)).body.visit.id).toBe(
        genuine.body.visit.id,
      );
      expect((await remove(genuine.body)).status).toBe(409);
    });
    it("keeps historical truth correctable after archive and doctor deactivation but rejects a new entry", async () => {
      const done = await completed();
      await prisma.patient.update({
        where: { id: done.patient.id },
        data: { archived: true },
      });
      await prisma.user.update({
        where: { id: done.doctor.id },
        data: { active: false },
      });
      try {
        const reopened = await correct(done, {
          kind: "reopen_visit",
          visitId: done.visit.id,
          visitVersion: done.visit.editVersion,
        });
        expect(reopened.status).toBe(200);
        const invalid = await correct(
          reopened.body,
          invalidation(reopened.body),
        );
        expect(invalid.status).toBe(200);
        expect((await start(invalid.body)).body.error).toBe("patient_archived");
        expect(invalid.body.doctor.eligible).toBe(false);
      } finally {
        await prisma.user.update({
          where: { id: done.doctor.id },
          data: { active: true },
        });
      }
    });
    it("rejects stale attendance and visit versions and unsupported transitions without adding audit", async () => {
      const done = await completed();
      expect(
        (
          await correct(done, {
            kind: "reopen_visit",
            visitId: done.visit.id,
            visitVersion: 1,
          })
        ).status,
      ).toBe(409);
      expect(
        (await correct({ ...done, editVersion: 1 }, { kind: "mark_left" }))
          .status,
      ).toBe(409);
      expect((await correct(done, { kind: "mark_left" })).body.error).toBe(
        "correction_not_allowed",
      );
      expect(
        (
          await correct(done, {
            kind: "confirm_completed",
            visitId: done.visit.id,
            visitVersion: done.visit.editVersion,
          })
        ).status,
      ).toBe(409);
      expect((await get(`/${done.id}`)).body).toEqual(done);
      expect(
        (await correct(done, { kind: "mark_left", doctorId: doctors[1] }))
          .status,
      ).toBe(400);
      expect(
        (await correct(done, { ...invalidation(done), confirmed: false }))
          .status,
      ).toBe(400);
      expect(
        (await remove(done, admin, { confirmedNeverArrived: false })).status,
      ).toBe(400);
    });
    it("never reopens an old day; permits only truthful terminal correction without changing original entry time", async () => {
      await freeDoctor();
      const old = new Date(Date.now() - 172800000);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(old);
      const row = (await arrive(await fresh())).body;
      const entered = (await start(row)).body;
      const done = (
        await request(app)
          .post(`/api/clinic/visits/${row.id}/complete`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({ editVersion: 2, visitVersion: 1 })
      ).body;
      vi.useRealTimers();
      expect(
        (
          await correct(done, {
            kind: "reopen_visit",
            visitId: done.visit.id,
            visitVersion: 2,
          })
        ).status,
      ).toBe(409);
      expect((await correct(done, invalidation(done))).status).toBe(409);
      const invalid = await correct(
        done,
        invalidation(done, "left_before_entry"),
      );
      expect(invalid.status).toBe(200);
      expect(invalid.body.invalidEntries[0].startedAt).toBe(
        entered.visit.startedAt,
      );
      expect(invalid.body.invalidEntries[0].recordedEndAt).toBe(
        done.visit.recordedEndAt,
      );
      expect(
        (await correct(invalid.body, { kind: "restore_waiting" })).status,
      ).toBe(409);
      expect(invalid.body.recordedEndAt > done.recordedEndAt).toBe(true);
    });
    it("confirms an auto-closed visit or waiting attendance without inventing a historical departure", async () => {
      await freeDoctor();
      const patientId = await fresh(),
        at = new Date(Date.now() - 172800000);
      const attendance = await prisma.attendance.create({
        data: {
          clinicId: clinics[0],
          patientId,
          doctorId: doctors[0],
          createdBy: users[0],
          arrivedAt: at,
          status: "auto_closed",
          recordedEndAt: new Date(at.getTime() + 3600000),
        },
      });
      await prisma.visit.create({
        data: {
          clinicId: clinics[0],
          attendanceId: attendance.id,
          patientId,
          doctorId: doctors[0],
          createdBy: users[0],
          startedAt: at,
          status: "auto_closed",
          recordedEndAt: new Date(at.getTime() + 3600000),
        },
      });
      const old = (await get(`/${attendance.id}`)).body;
      const confirmed = await correct(old, {
        kind: "confirm_completed",
        visitId: old.visit.id,
        visitVersion: 1,
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.visit.startedAt).toBe(at.toISOString());
      expect(confirmed.body.corrections[0].before).toMatchObject({
        status: "auto_closed",
        visit: {
          status: "auto_closed",
          recordedEndAt: old.visit.recordedEndAt,
        },
      });
      expect(confirmed.body.recordedEndAt > old.recordedEndAt).toBe(true);
      const absent = await prisma.attendance.create({
        data: {
          clinicId: clinics[0],
          patientId: await fresh(),
          doctorId: doctors[0],
          createdBy: users[0],
          arrivedAt: at,
          status: "auto_closed",
          recordedEndAt: new Date(at.getTime() + 3600000),
        },
      });
      expect(
        (
          await correct((await get(`/${absent.id}`)).body, {
            kind: "mark_left",
          })
        ).status,
      ).toBe(200);
    });
    it("serializes two reopens competing for one doctor and two restores competing for one patient", async () => {
      const first = await completed(),
        second = await completed();
      const results = await Promise.all(
        [first, second].map((row) =>
          correct(row, {
            kind: "reopen_visit",
            visitId: row.visit.id,
            visitVersion: row.visit.editVersion,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const patientId = await fresh();
      const a = (await arrive(patientId)).body;
      const leftA = (await edit(a.id, { kind: "leave", editVersion: 1 })).body;
      const b = (await arrive(patientId)).body;
      const leftB = (await edit(b.id, { kind: "leave", editVersion: 1 })).body;
      const restore = await Promise.all(
        [leftA, leftB].map((row) => correct(row, { kind: "restore_waiting" })),
      );
      expect(restore.map((r) => r.status).sort()).toEqual([200, 409]);
    });
    it.each([0, 1, 2])(
      "authorizes role %s while isolating clinics, platform and invalid credentials",
      async (index) => {
        const auth = cookie(users[index]),
          row = (await arrive(await fresh())).body;
        const changed = await correct(row, { kind: "mark_left" }, auth);
        expect(changed.status).toBe(200);
        expect((await remove(changed.body, auth)).status).toBe(204);
        const other = (await arrive(await fresh())).body;
        for (const wrong of [
          cookie(users[5]),
          platform,
          neither,
          cookie(users[index], "clinic", 99),
        ]) {
          const r = await correct(other, { kind: "mark_left" }, wrong);
          expect([401, 403, 404]).toContain(r.status);
          expect((await remove(other, wrong)).status).toBe(r.status);
        }
        expect((await get(`/${other.id}`)).body).toEqual(other);
      },
    );
    it.each([0, 1, 2])(
      "rechecks role %s after waiting for the clinic lock",
      async (index) => {
        const row = (await arrive(await fresh())).body,
          assignment = await prisma.userRole.findFirstOrThrow({
            where: { userId: users[index] },
          });
        const client = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
        await client.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
            clinics[0],
          ]);
          const pending = correct(
            row,
            { kind: "mark_left" },
            cookie(users[index]),
          ).then((r) => r);
          let waiting = false;
          const deadline = Date.now() + 4000;
          while (Date.now() < deadline) {
            const found = await client.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
            );
            if (found.rowCount) {
              waiting = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 20));
          }
          expect(waiting).toBe(true);
          await client.query("DELETE FROM user_roles WHERE user_id=$1", [
            users[index],
          ]);
          await client.query("COMMIT");
          expect((await pending).status).toBe(403);
          expect(
            (await get(`/${row.id}`, cookie(users[(index + 1) % 3]))).body,
          ).toEqual({
            ...row,
            doctor: { ...row.doctor, eligible: index !== 1 },
          });
        } finally {
          await client.query("ROLLBACK").catch(() => {});
          await client.end();
          await prisma.userRole.upsert({
            where: {
              userId_roleId: {
                userId: assignment.userId,
                roleId: assignment.roleId,
              },
            },
            create: assignment,
            update: {},
          });
        }
      },
    );
    it("rolls back visit invalidation, linked appointment pins and correction on a late audit failure", async () => {
      const done = await completed();
      const a = await prisma.appointment.create({
        data: {
          clinicId: clinics[0],
          patientId: done.patient.id,
          doctorId: doctors[0],
          createdBy: users[0],
          startsAt: new Date(`${done.visit.startedAt.slice(0, 10)}T10:00:00Z`),
          endsAt: new Date(`${done.visit.startedAt.slice(0, 10)}T10:05:00Z`),
          status: "cancelled",
        },
      });
      const linked = (
        await request(app)
          .patch(`/api/clinic/visits/${done.id}/appointment-link`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            kind: "assign",
            visitId: done.visit.id,
            visitVersion: done.visit.editVersion,
            expectedLinkVersion: 0,
            appointmentId: a.id,
            expectedAppointmentVersion: 1,
          })
      ).body;
      const client = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        }),
        suffix = crypto.randomUUID().replaceAll("-", "");
      await client.connect();
      try {
        await client.query(
          `CREATE FUNCTION qa_correction_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.attendance_id='${done.id}'::uuid THEN RAISE EXCEPTION 'synthetic late correction failure'; END IF; RETURN NEW; END $$`,
        );
        await client.query(
          `CREATE TRIGGER qa_correction_${suffix} BEFORE INSERT ON attendance_corrections FOR EACH ROW EXECUTE FUNCTION qa_correction_${suffix}()`,
        );
        expect((await correct(linked, invalidation(linked))).status).toBe(500);
        expect((await get(`/${done.id}`)).body).toEqual(linked);
        await client.query(
          `DROP TRIGGER qa_correction_${suffix} ON attendance_corrections`,
        );
        const invalid = await correct(linked, invalidation(linked));
        expect(invalid.status).toBe(200);
        expect(invalid.body.invalidEntries).toHaveLength(1);
        // Appointment-owned historical pin is observable through its public scheduling constraint.
        await prisma.appointment.update({
          where: { id: a.id },
          data: { status: "booked" },
        });
        const tomorrow = new Date(Date.now() + 86400000)
          .toISOString()
          .slice(0, 10);
        const scheduled = await request(app)
          .patch(`/api/clinic/appointments/${a.id}`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            kind: "schedule",
            date: tomorrow,
            time: "10:00",
            durationMinutes: 5,
            doctorId: doctors[0],
            editVersion: 1,
          });
        expect(scheduled.status).toBe(200);
      } finally {
        await client.query(
          `DROP TRIGGER IF EXISTS qa_correction_${suffix} ON attendance_corrections`,
        );
        await client.query(`DROP FUNCTION IF EXISTS qa_correction_${suffix}()`);
        await client.end();
      }
    });
    it("releases every historical appointment pin after invalidating a detached false entry and retains no active reference after deletion", async () => {
      const row = await completed(),
        day = row.visit.startedAt.slice(0, 10),
        appointments = [];
      for (const time of ["11:00", "12:00"])
        appointments.push(
          await prisma.appointment.create({
            data: {
              clinicId: clinics[0],
              patientId: row.patient.id,
              doctorId: doctors[0],
              createdBy: users[0],
              startsAt: new Date(`${day}T${time}:00Z`),
              endsAt: new Date(
                new Date(`${day}T${time}:00Z`).getTime() + 300000,
              ),
              status: "cancelled",
            },
          }),
        );
      let linked = row;
      for (const appointment of appointments) {
        const r = await request(app)
          .patch(`/api/clinic/visits/${row.id}/appointment-link`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            kind: "assign",
            visitId: row.visit.id,
            visitVersion: linked.visit.editVersion,
            expectedLinkVersion: linked.visit.appointmentLink.editVersion,
            appointmentId: appointment.id,
            expectedAppointmentVersion: 1,
          });
        expect(r.status).toBe(200);
        linked = r.body;
      }
      const detached = await request(app)
        .patch(`/api/clinic/visits/${row.id}/appointment-link`)
        .set("Cookie", admin)
        .set("Origin", origin)
        .send({
          kind: "detach",
          visitId: row.visit.id,
          visitVersion: linked.visit.editVersion,
          expectedLinkVersion: linked.visit.appointmentLink.editVersion,
        });
      expect(detached.status).toBe(200);
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .slice(0, 10);
      const schedule = (id: string, time: string) =>
        request(app)
          .patch(`/api/clinic/appointments/${id}`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            kind: "schedule",
            date: tomorrow,
            time,
            durationMinutes: 5,
            doctorId: doctors[0],
            editVersion: 1,
          });
      for (const appointment of appointments)
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: "booked" },
        });
      expect((await schedule(appointments[0].id, "11:00")).body.error).toBe(
        "appointment_visit_day_locked",
      );
      expect((await schedule(appointments[1].id, "12:00")).body.error).toBe(
        "appointment_visit_day_locked",
      );
      const invalid = await correct(
        detached.body,
        invalidation(detached.body, "left_before_entry"),
      );
      expect(invalid.status).toBe(200);
      expect((await remove(invalid.body)).status).toBe(204);
      expect((await schedule(appointments[0].id, "11:00")).status).toBe(200);
      expect((await schedule(appointments[1].id, "12:00")).status).toBe(200);
    });
    it("rolls back a false attendance deletion if its appointment-owned invalidation audit fails", async () => {
      const done = await completed(),
        invalid = await correct(done, invalidation(done, "left_before_entry"));
      expect(invalid.status).toBe(200);
      const row = invalid.body,
        client = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        }),
        suffix = crypto.randomUUID().replaceAll("-", "");
      await client.connect();
      try {
        await client.query(
          `CREATE FUNCTION qa_delete_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.visit_id='${done.visit.id}'::uuid THEN RAISE EXCEPTION 'synthetic delete failure'; END IF; RETURN NEW; END $$`,
        );
        await client.query(
          `CREATE TRIGGER qa_delete_${suffix} BEFORE INSERT ON appointment_visit_changes FOR EACH ROW EXECUTE FUNCTION qa_delete_${suffix}()`,
        );
        expect((await remove(row)).status).toBe(500);
        expect((await get(`/${row.id}`)).body).toEqual(row);
      } finally {
        await client.query(
          `DROP TRIGGER IF EXISTS qa_delete_${suffix} ON appointment_visit_changes`,
        );
        await client.query(`DROP FUNCTION IF EXISTS qa_delete_${suffix}()`);
        await client.end();
      }
      const results = await Promise.all([remove(row), remove(row)]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 404]);
    });
    it("reopens today's genuine visit on a legacy older arrival without restoring that old attendance to waiting", async () => {
      await freeDoctor();
      const arrived = (await arrive(await fresh())).body;
      const entered = (await start(arrived)).body;
      // Legacy02 allowed entry after an old arrival. Preserve that historical fixture
      // directly;05 now closes old waiting before a new human entry.
      arrived.arrivedAt = new Date(Date.now() - 172800000).toISOString();
      await prisma.attendance.update({
        where: { id: arrived.id },
        data: { arrivedAt: new Date(arrived.arrivedAt) },
      });
      expect(entered.visit.startedAt.slice(0, 10)).not.toBe(
        arrived.arrivedAt.slice(0, 10),
      );
      const done = (
        await request(app)
          .post(`/api/clinic/visits/${arrived.id}/complete`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            editVersion: entered.editVersion,
            visitVersion: entered.visit.editVersion,
          })
      ).body;
      const reopened = await correct(done, {
        kind: "reopen_visit",
        visitId: done.visit.id,
        visitVersion: done.visit.editVersion,
      });
      expect(reopened.status).toBe(200);
      expect(reopened.body.visit.startedAt).toBe(entered.visit.startedAt);
      expect(reopened.body.arrivedAt).toBe(arrived.arrivedAt);
      expect(
        (await correct(reopened.body, invalidation(reopened.body))).status,
      ).toBe(409);
    });
    it("keeps GET and PATCH available while DELETE is dispatched explicitly and unsupported methods stay unsupported", async () => {
      const row = (await arrive(await fresh())).body;
      expect(
        (
          await request(app)
            .put(`/api/clinic/visits/${row.id}`)
            .set("Cookie", admin)
            .set("Origin", origin)
            .send({})
        ).status,
      ).toBe(404);
      expect((await get(`/${row.id}`)).body).toEqual(row);
      const left = await edit(row.id, {
        kind: "leave",
        editVersion: row.editVersion,
      });
      expect(left.status).toBe(200);
      expect((await get(`/${row.id}`)).body).toEqual(left.body);
      expect((await remove(left.body)).status).toBe(204);
      expect((await get(`/${row.id}`)).status).toBe(404);
    });
  },
);
