import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Client } from "pg";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, prisma } from "../server/app";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "attendance through HTTP on isolated storage",
  () => {
    const prefix = `visits-${crypto.randomUUID()}`;
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
    it("records arrival independently and returns the confirmed waiting snapshot through read and queue", async () => {
      const response = await arrive();
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        patient: {
          id: patients[0],
          name: "Arrival patient 0/0",
          fileNumber: "1",
          archived: false,
        },
        doctor: { id: doctors[0], eligible: true },
        status: "waiting",
        recordedEndAt: null,
        editVersion: 1,
      });
      expect(Object.keys(response.body).sort()).toEqual(
        [
          "id",
          "patient",
          "doctor",
          "status",
          "arrivedAt",
          "recordedEndAt",
          "editVersion",
        ].sort(),
      );
      expect((await get(`/${response.body.id}`)).body).toEqual(response.body);
      expect((await get()).body.items).toEqual([response.body]);
    });
    it("transfers a waiting patient without changing arrival order, and leaving releases attendance for a new arrival", async () => {
      const first = (await arrive(patients[1])).body,
        second = (await arrive(patients[2])).body;
      const moved = await edit(second.id, {
        kind: "transfer",
        doctorId: doctors[1],
        editVersion: 1,
      });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({
        id: second.id,
        doctor: { id: doctors[1] },
        arrivedAt: second.arrivedAt,
        editVersion: 2,
        status: "waiting",
      });
      expect(
        (await get()).body.items.map((row: { id: string }) => row.id),
      ).toEqual(expect.arrayContaining([first.id, second.id]));
      const left = await edit(second.id, { kind: "leave", editVersion: 2 });
      expect(left.status).toBe(200);
      expect(left.body).toMatchObject({
        status: "left_before_entry",
        editVersion: 3,
        arrivedAt: second.arrivedAt,
      });
      expect(Date.parse(left.body.recordedEndAt)).toBeGreaterThanOrEqual(
        Date.parse(second.arrivedAt),
      );
      expect(
        (await get()).body.items.some(
          (row: { id: string }) => row.id === second.id,
        ),
      ).toBe(false);
      expect((await get(`/${second.id}`)).body).toEqual(left.body);
      expect((await arrive(patients[2])).status).toBe(201);
    });
    it("offers only eligible doctors and active patients via limited clinic-scoped selectors without unrelated grants", async () => {
      const options = await get("/doctors", receptionist);
      expect(options.status).toBe(200);
      expect(
        options.body.items.map((x: { id: string }) => x.id).sort(),
      ).toEqual(doctors.slice(0, 2).sort());
      const result = await get("/patients?q=٢٠١٢٣٤٥٦&page=1", dentist);
      expect(result.status).toBe(200);
      expect(result.body.items).toHaveLength(7);
      expect(Object.keys(result.body.items[0]).sort()).toEqual(
        ["id", "name", "fileNumber", "archived"].sort(),
      );
      expect((await get("/patients?q=")).status).toBe(400);
      expect(
        (await get("/patients?q=Arrival&clinicId=" + clinics[1])).status,
      ).toBe(400);
    });
    it("allows only one concurrent arrival per patient across different doctors", async () => {
      const responses = await Promise.all([
        arrive(patients[3], doctors[0], receptionist),
        arrive(patients[3], doctors[1], dentist),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(responses.find((r) => r.status === 409)!.body).toEqual({
        error: "attendance_active",
      });
      expect(
        (await get()).body.items.filter(
          (row: { patient: { id: string } }) => row.patient.id === patients[3],
        ),
      ).toHaveLength(1);
    });
    it("rejects stale and ended mutations without replacing the confirmed record", async () => {
      const row = (await arrive(patients[4])).body;
      const results = await Promise.all([
        edit(row.id, {
          kind: "transfer",
          doctorId: doctors[1],
          editVersion: 1,
        }),
        edit(row.id, { kind: "leave", editVersion: 1 }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body).toEqual({
        error: "edit_conflict",
      });
      let current = (await get(`/${row.id}`)).body;
      expect(current.editVersion).toBe(2);
      if (current.status === "waiting")
        current = (await edit(row.id, { kind: "leave", editVersion: 2 })).body;
      expect(
        (
          await edit(row.id, {
            kind: "transfer",
            doctorId: doctors[0],
            editVersion: current.editVersion,
          })
        ).body,
      ).toEqual({ error: "attendance_not_waiting" });
      expect((await get(`/${row.id}`)).body).toEqual(current);
    });
    it("isolates clinics and rejects foreign references, platform accounts, missing roles, expired sessions, and untrusted origins", async () => {
      const local = (await get()).body.items[0];
      expect((await get(`/${local.id}`, cookie(users[5]))).status).toBe(404);
      expect((await arrive(patients[7], doctors[0])).body).toEqual({
        error: "not_found",
      });
      expect((await arrive(patients[5], doctors[2])).body).toEqual({
        error: "not_found",
      });
      for (const auth of [platform, neither]) {
        expect((await get("", auth)).status).toBe(403);
        expect((await arrive(patients[5], doctors[0], auth)).status).toBe(403);
      }
      expect((await request(app).get("/api/clinic/visits")).status).toBe(401);
      expect((await get("", cookie(users[0], "clinic", 0))).status).toBe(401);
      const expired = `dentex_session=${jwt.sign({ kind: "clinic", version: 1 }, process.env.JWT_SECRET!, { subject: users[0], expiresIn: -1 })}`;
      expect((await get("", expired)).status).toBe(401);
      expect(
        (
          await request(app)
            .post("/api/clinic/visits")
            .set("Origin", "http://untrusted.test")
            .set("Cookie", admin)
            .send({ patientId: patients[5], doctorId: doctors[0] })
        ).body,
      ).toEqual({ error: "untrusted_origin" });
      expect(
        (
          await arrive(patients[5], doctors[0], admin, {
            arrivedAt: "2020-01-01",
          })
        ).status,
      ).toBe(400);
      expect(
        (await get()).body.items.some(
          (r: { patient: { id: string } }) => r.patient.id === patients[5],
        ),
      ).toBe(false);
    });
    it("keeps old-day waiting and tied arrival priority visible and unchanged after transfer", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-12T23:59:00.000Z"));
      try {
        const first = (await arrive(patients[5])).body,
          second = (await arrive(patients[6])).body;
        vi.setSystemTime(new Date("2026-11-13T00:01:00.000Z"));
        expect((await arrive(patients[5])).body).toEqual({
          error: "attendance_active",
        });
        const moved = await edit(second.id, {
          kind: "transfer",
          doctorId: doctors[1],
          editVersion: 1,
        });
        expect(moved.status).toBe(200);
        expect(moved.body.arrivedAt).toBe("2026-11-12T23:59:00.000Z");
        const rows = (await get()).body.items as Array<{ id: string }>;
        expect(rows.findIndex((r) => r.id === first.id)).toBeLessThan(
          rows.findIndex((r) => r.id === second.id),
        );
      } finally {
        vi.useRealTimers();
      }
    });
    it("preserves archived patients and ineligible doctors in queues, permits safe transfer/departure, and excludes them from new arrival choices", async () => {
      const current = (await get()).body.items.find(
        (r: { patient: { id: string } }) => r.patient.id === patients[0],
      );
      await prisma.patient.update({
        where: { id: patients[0] },
        data: { archived: true },
      });
      await prisma.user.update({
        where: { id: doctors[0] },
        data: { active: false },
      });
      try {
        const queue = await get("", receptionist);
        expect(
          queue.body.items.find((r: { id: string }) => r.id === current.id),
        ).toMatchObject({
          patient: { archived: true },
          doctor: { eligible: false },
        });
        expect(queue.body.doctors).toContainEqual(
          expect.objectContaining({ id: doctors[0], eligible: false }),
        );
        expect(
          (await get("/doctors")).body.items.some(
            (r: { id: string }) => r.id === doctors[0],
          ),
        ).toBe(false);
        expect(
          (await get("/patients?q=Arrival")).body.items.some(
            (r: { id: string }) => r.id === patients[0],
          ),
        ).toBe(false);
        expect((await arrive(patients[0], doctors[1])).body).toEqual({
          error: "patient_archived",
        });
        expect((await arrive(patients[4], doctors[0])).body).toEqual({
          error: "doctor_ineligible",
        });
        const moved = await edit(current.id, {
          kind: "transfer",
          doctorId: doctors[1],
          editVersion: current.editVersion,
        });
        expect(moved.status).toBe(200);
        expect(
          (
            await edit(current.id, {
              kind: "leave",
              editVersion: moved.body.editVersion,
            })
          ).status,
        ).toBe(200);
      } finally {
        await prisma.patient.update({
          where: { id: patients[0] },
          data: { archived: false },
        });
        await prisma.user.update({
          where: { id: doctors[0] },
          data: { active: true },
        });
      }
      await prisma.userRole.deleteMany({ where: { userId: doctors[0] } });
      try {
        expect((await arrive(patients[0], doctors[0])).body).toEqual({
          error: "doctor_ineligible",
        });
      } finally {
        await prisma.userRole.create({
          data: { clinicId: clinics[0], userId: doctors[0], roleId: roles[1] },
        });
      }
    });
    it.each(["actor role", "patient archive", "doctor role"] as const)(
      "rechecks %s after obtaining the clinic lock before writing",
      async (change) => {
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
          // HTTP authorization reads its prior snapshot; the mutation must wait for this lock.
          operation = arrive(patients[0], doctors[0], receptionist).then(
            (r) => r,
          );
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
              [patients[0]],
            );
          if (change === "doctor role")
            await connection.query(
              "DELETE FROM user_roles WHERE user_id=$1::uuid",
              [doctors[0]],
            );
          await connection.query("COMMIT");
          const response = await operation;
          expect(response.status).toBe(change === "actor role" ? 403 : 409);
          expect(response.body).toEqual({
            error:
              change === "actor role"
                ? "forbidden"
                : change === "patient archive"
                  ? "patient_archived"
                  : "doctor_ineligible",
          });
          expect(
            (await get()).body.items.some(
              (r: { patient: { id: string } }) => r.patient.id === patients[0],
            ),
          ).toBe(false);
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
              where: { id: patients[0] },
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
  },
);
