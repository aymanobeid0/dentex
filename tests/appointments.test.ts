import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import { app, prisma } from "../server/app";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "appointment booking on an isolated database",
  () => {
    const clinics: string[] = [],
      users: string[] = [],
      patients: string[] = [],
      doctors: string[] = [];
    const origin = "http://localhost:5173",
      prefix = `appointments-${crypto.randomUUID()}`;
    let admin: string,
      writer: string,
      reader: string,
      neither: string,
      platform: string,
      writerRole: string,
      dentistRole: string;
    let day = 1;
    const date = () =>
      new Date(Date.UTC(2090, 0, day++)).toISOString().slice(0, 10);
    const cookie = (id: string, kind = "clinic") =>
      `dentex_session=${jwt.sign({ kind, version: 1 }, process.env.JWT_SECRET!, { subject: id, expiresIn: "24h" })}`;
    const book = (body: object, auth = admin) =>
      request(app)
        .post("/api/clinic/appointments")
        .set("Origin", origin)
        .set("Cookie", auth)
        .send(body);
    const input = (values: object = {}) => ({
      patientId: patients[0],
      doctorId: doctors[0],
      date: date(),
      time: "10:07",
      durationMinutes: 30,
      ...values,
    });
    beforeAll(async () => {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (
        url.pathname !== "/dentex_test" ||
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
      )
        throw Error("Isolated dentex_test required");
      process.env.JWT_SECRET =
        "appointments-test-secret-at-least-32-characters";
      process.env.APP_ORIGIN = origin;
      const used = new Set(
        (await prisma.clinic.findMany()).map((row) => row.code),
      );
      const codes = Array.from({ length: 10000 }, (_, index) =>
        String(index).padStart(4, "0"),
      ).filter((code) => !used.has(code));
      for (let index = 0; index < 2; index++) {
        const clinic = await prisma.clinic.create({
          data: { name: prefix, code: codes[index] },
        });
        clinics.push(clinic.id);
        for (let n = 0; n < 3; n++) {
          const patient = await prisma.patient.create({
            data: {
              clinicId: clinic.id,
              fileNumber: BigInt(n + 1),
              name: `Patient ${index}/${n}`,
              phone: "+22220123456",
              isChild: true,
              gender: "male",
            },
          });
          patients.push(patient.id);
        }
        const role = await prisma.role.create({
          data: { clinicId: clinic.id, key: "dentist" },
        });
        if (!index) dentistRole = role.id;
        for (let n = 0; n < 2; n++) {
          const doctor = await prisma.user.create({
            data: {
              clinicId: clinic.id,
              name: `Doctor ${index}/${n}`,
              username: `${prefix}-${n}`,
              passwordHash: "unused-qa-hash",
            },
          });
          doctors.push(doctor.id);
          await prisma.userRole.create({
            data: { clinicId: clinic.id, userId: doctor.id, roleId: role.id },
          });
        }
      }
      for (const key of ["appointments.read", "appointments.write"])
        await prisma.permission.upsert({
          where: { key },
          create: { key },
          update: {},
        });
      for (const [index, permissions] of [
        [],
        ["appointments.write"],
        ["appointments.read"],
        [],
      ].entries()) {
        const user = await prisma.user.create({
          data: {
            clinicId: clinics[0],
            name: `Operator ${index}`,
            username: `${prefix}-operator-${index}`,
            passwordHash: "unused-qa-hash",
          },
        });
        users.push(user.id);
        if (index < 3) {
          const role =
            index === 2
              ? { id: dentistRole }
              : await prisma.role.create({
                  data: {
                    clinicId: clinics[0],
                    key: index === 0 ? "admin" : "receptionist",
                  },
                });
          for (const permissionKey of permissions)
            await prisma.rolePermission.create({
              data: { roleId: role.id, permissionKey },
            });
          if (index === 1) writerRole = role.id;
          await prisma.userRole.create({
            data: { clinicId: clinics[0], userId: user.id, roleId: role.id },
          });
        }
      }
      [admin, writer, reader, neither] = users.map((id) => cookie(id));
      // A director who also holds dentist is an eligible doctor.
      await prisma.userRole.create({
        data: { clinicId: clinics[0], userId: users[0], roleId: dentistRole },
      });
      const root = await prisma.platformAdmin.create({
        data: {
          username: prefix,
          email: `${prefix}@example.test`,
          passwordHash: "unused-qa-hash",
        },
      });
      platform = cookie(root.id, "platform");
    });
    afterAll(async () => {
      for (const clinicId of clinics) {
        await prisma.appointmentChange.deleteMany({ where: { clinicId } });
        await prisma.appointment.deleteMany({ where: { clinicId } });
        await prisma.userRole.deleteMany({ where: { clinicId } });
        await prisma.rolePermission.deleteMany({
          where: { role: { clinicId } },
        });
        await prisma.role.deleteMany({ where: { clinicId } });
        await prisma.user.deleteMany({ where: { clinicId } });
        await prisma.patient.deleteMany({ where: { clinicId } });
        await prisma.clinic.deleteMany({ where: { id: clinicId } });
      }
      await prisma.platformAdmin.deleteMany({ where: { username: prefix } });
      await prisma.$disconnect();
    });
    it("offers only eligible doctors with minimal fields, including a director/dentist", async () => {
      const response = await request(app)
        .get("/api/clinic/appointments/doctors")
        .set("Cookie", writer);
      expect(response.status).toBe(200);
      expect(
        new Set(response.body.items.map((row: { id: string }) => row.id)),
      ).toEqual(new Set([...doctors.slice(0, 2), users[0], users[2]]));
      expect(
        response.body.items.every(
          (row: object) => Object.keys(row).sort().join() === "id,name",
        ),
      ).toBe(true);
    });
    it("creates with write alone and stores one creation event without exposing a schedule", async () => {
      const body = input({ administrativeNote: "  Administrative only  " });
      const result = await book(body, writer);
      expect(result.status).toBe(201);
      expect(Object.keys(result.body).sort()).toEqual(
        [
          "id",
          "patientId",
          "doctorId",
          "startsAt",
          "endsAt",
          "status",
          "editVersion",
        ].sort(),
      );
      const stored = await prisma.appointment.findUniqueOrThrow({
        where: { id: result.body.id },
        include: { changes: true },
      });
      expect(stored.administrativeNote).toBe("Administrative only");
      expect(stored.createdBy).toBe(users[1]);
      expect(stored.changes).toHaveLength(1);
      expect(stored.changes[0].before).toBeNull();
      expect(stored.changes[0].actorId).toBe(users[1]);
      expect(result.body.startsAt).toBe(`${body.date}T10:07:00.000Z`);
      expect(
        (
          await request(app)
            .get("/api/clinic/appointments")
            .set("Cookie", writer)
        ).status,
      ).toBe(404);
    });
    it.each(["reader", "neither", "platform", "anonymous"])(
      "rejects %s on create and doctor lookup",
      async (who) => {
        const auth = { reader, neither, platform, anonymous: "" }[
          who as "reader"
        ];
        for (const result of [
          await book(input(), auth),
          await request(app)
            .get("/api/clinic/appointments/doctors")
            .set("Cookie", auth),
        ])
          expect(result.status).toBe(who === "anonymous" ? 401 : 403);
      },
    );
    it("isolates references and rejects invalid origin", async () => {
      expect((await book(input({ patientId: patients[3] }))).body).toEqual({
        error: "appointment_reference_not_found",
      });
      expect((await book(input({ doctorId: doctors[2] }))).body).toEqual({
        error: "appointment_reference_not_found",
      });
      expect(
        (
          await request(app)
            .post("/api/clinic/appointments")
            .set("Origin", "https://untrusted.test")
            .set("Cookie", admin)
            .send(input())
        ).status,
      ).toBe(403);
    });
    it("rejects archived patients and ineligible doctors without a partial history", async () => {
      await prisma.patient.update({
        where: { id: patients[2] },
        data: { archived: true },
      });
      expect((await book(input({ patientId: patients[2] }))).body.error).toBe(
        "patient_archived",
      );
      expect((await book(input({ doctorId: users[1] }))).body.error).toBe(
        "doctor_ineligible",
      );
      await prisma.user.update({
        where: { id: doctors[1] },
        data: { active: false },
      });
      expect((await book(input({ doctorId: doctors[1] }))).body.error).toBe(
        "doctor_ineligible",
      );
      expect(
        (
          await request(app)
            .get("/api/clinic/appointments/doctors")
            .set("Cookie", writer)
        ).body.items.some((row: { id: string }) => row.id === doctors[1]),
      ).toBe(false);
      await prisma.user.update({
        where: { id: doctors[1] },
        data: { active: true },
      });
    });
    it.each([5, 30, 240])(
      "accepts duration %i and permits any full minute",
      async (durationMinutes) => {
        expect((await book(input({ durationMinutes }))).status).toBe(201);
      },
    );
    it("accepts midnight as end and rejects a crossing or past booking", async () => {
      const body = input({ time: "23:55", durationMinutes: 5 });
      const result = await book(body);
      expect(result.status).toBe(201);
      expect(result.body.endsAt.endsWith("T00:00:00.000Z")).toBe(true);
      expect(
        (await book(input({ time: "23:56", durationMinutes: 5 }))).status,
      ).toBe(400);
      expect((await book(input({ date: "2000-01-01" }))).body.error).toBe(
        "appointment_in_past",
      );
    });
    it.each([
      { durationMinutes: 0 },
      { durationMinutes: 241 },
      { durationMinutes: 7 },
      { time: "10:00:30" },
      { date: "2090-02-30" },
      { status: "cancelled" },
      { clinicId: "override" },
    ])("rejects malformed booking %j", async (change) => {
      expect(
        (await book(input({ date: "2091-05-01", ...change }))).status,
      ).toBe(400);
    });
    it("allows adjacency but blocks partial, contained, encompassing and patient overlaps", async () => {
      const body = input({ time: "10:00" });
      expect((await book(body)).status).toBe(201);
      expect((await book({ ...body, time: "10:30" })).status).toBe(201);
      for (const change of [
        { time: "09:55" },
        { time: "10:05", durationMinutes: 5 },
        { time: "09:45", durationMinutes: 60 },
        { doctorId: doctors[1] },
      ]) {
        const result = await book({ ...body, ...change });
        expect(result.status).toBe(409);
        expect(result.body).toEqual({ error: "appointment_overlap" });
      }
      // Shared family phone does not identify a patient.
      expect(
        (await book({ ...body, doctorId: doctors[1], patientId: patients[1] }))
          .status,
      ).toBe(201);
    });
    it.each(["doctor", "patient"])(
      "serializes simultaneous conflicting %s requests",
      async (resource) => {
        const body = input();
        const results = await Promise.all([
          book(body),
          book({
            ...body,
            ...(resource === "doctor"
              ? { patientId: patients[1] }
              : { doctorId: doctors[1] }),
          }),
        ]);
        expect(results.map((result) => result.status).sort()).toEqual([
          201, 409,
        ]);
        const stored = await prisma.appointment.findMany({
          where: {
            clinicId: clinics[0],
            startsAt: new Date(`${body.date}T${body.time}:00Z`),
          },
          include: { changes: true },
        });
        expect(stored).toHaveLength(1);
        expect(stored[0].changes).toHaveLength(1);
      },
    );
    it.each(["doctor", "patient"])(
      "storage rejects concurrent %s overlaps independently of the application lock",
      async (resource) => {
        const body = input(),
          startsAt = new Date(`${body.date}T10:00:00Z`),
          endsAt = new Date(`${body.date}T10:30:00Z`);
        const insert = (patientId: string, doctorId: string) =>
          prisma.$executeRaw`INSERT INTO appointments (clinic_id,patient_id,doctor_id,created_by,starts_at,ends_at) VALUES (${clinics[0]}::uuid,${patientId}::uuid,${doctorId}::uuid,${users[0]}::uuid,${startsAt},${endsAt})`;
        const results = await Promise.allSettled([
          insert(patients[0], doctors[0]),
          insert(
            resource === "doctor" ? patients[1] : patients[0],
            resource === "doctor" ? doctors[0] : doctors[1],
          ),
        ]);
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          results.filter((result) => result.status === "rejected"),
        ).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(
          rejected?.reason.meta.driverAdapterError.cause.originalCode,
        ).toBe("23P01");
      },
    );
    it.each(["attended", "absent", "cancelled"])(
      "only booked and attended reserve time: %s",
      async (status) => {
        const body = input();
        const original = await book(body);
        expect(original.status).toBe(201);
        await prisma.appointment.update({
          where: { id: original.body.id },
          data: { status },
        });
        expect((await book(body)).status).toBe(
          status === "attended" ? 409 : 201,
        );
      },
    );
    it("returns a private 409 and rolls back when storage detects overlap after the precheck", async () => {
      const body = input({ administrativeNote: "qa_force_storage_overlap" });
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION qa_force_appointment_overlap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.administrative_note = 'qa_force_storage_overlap' THEN INSERT INTO appointments (clinic_id,patient_id,doctor_id,created_by,starts_at,ends_at) VALUES (NEW.clinic_id,NEW.patient_id,NEW.doctor_id,NEW.created_by,NEW.starts_at,NEW.ends_at); END IF; RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER qa_force_overlap BEFORE INSERT ON appointments FOR EACH ROW EXECUTE FUNCTION qa_force_appointment_overlap()",
      );
      try {
        const result = await book(body);
        expect(result.status).toBe(409);
        expect(result.body).toEqual({ error: "appointment_overlap" });
        expect(
          await prisma.appointment.count({
            where: {
              clinicId: clinics[0],
              startsAt: new Date(`${body.date}T${body.time}:00Z`),
            },
          }),
        ).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe(
          "DROP TRIGGER qa_force_overlap ON appointments",
        );
        await prisma.$executeRawUnsafe(
          "DROP FUNCTION qa_force_appointment_overlap()",
        );
      }
    });
    it("rolls back a booking if its creation history cannot be stored", async () => {
      const body = input({ administrativeNote: "force-history-rollback-qa" });
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION qa_reject_appointment_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."after"->>'administrativeNote' = 'force-history-rollback-qa' THEN RAISE EXCEPTION 'QA history failure'; END IF; RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER qa_reject_history BEFORE INSERT ON appointment_changes FOR EACH ROW EXECUTE FUNCTION qa_reject_appointment_history()",
      );
      try {
        expect((await book(body)).status).toBe(500);
        expect(
          await prisma.appointment.count({
            where: {
              clinicId: clinics[0],
              administrativeNote: "force-history-rollback-qa",
            },
          }),
        ).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe(
          "DROP TRIGGER qa_reject_history ON appointment_changes",
        );
        await prisma.$executeRawUnsafe(
          "DROP FUNCTION qa_reject_appointment_history()",
        );
      }
    });
    it.each(["grant", "doctor", "patient"])(
      "rechecks changed %s after the existing clinic lock, not only at HTTP entry",
      async (changed) => {
        const lock = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
        await lock.connect();
        try {
          await lock.query("BEGIN");
          await lock.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
            clinics[0],
          ]);
          const response = book(input(), writer).then((value) => value);
          // Hold the mutation lock until the actual service transaction is waiting.
          let waiting = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const result = await lock.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
            );
            if (result.rowCount) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(waiting).toBe(true);
          if (changed === "grant")
            await lock.query(
              "DELETE FROM role_permissions WHERE role_id=$1 AND permission_key=$2",
              [writerRole, "appointments.write"],
            );
          else if (changed === "doctor")
            await lock.query(
              "DELETE FROM user_roles WHERE user_id=$1 AND role_id=$2",
              [doctors[0], dentistRole],
            );
          else
            await lock.query("UPDATE patients SET archived=true WHERE id=$1", [
              patients[0],
            ]);
          await lock.query("COMMIT");
          const result = await response;
          expect(result.status).toBe(changed === "grant" ? 403 : 409);
          expect(result.body.error).toBe(
            changed === "grant"
              ? "forbidden"
              : changed === "doctor"
                ? "doctor_ineligible"
                : "patient_archived",
          );
        } finally {
          await lock.query("ROLLBACK");
          await lock.end();
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionKey: {
                roleId: writerRole,
                permissionKey: "appointments.write",
              },
            },
            create: { roleId: writerRole, permissionKey: "appointments.write" },
            update: {},
          });
          await prisma.userRole.upsert({
            where: {
              userId_roleId: { userId: doctors[0], roleId: dentistRole },
            },
            create: {
              clinicId: clinics[0],
              userId: doctors[0],
              roleId: dentistRole,
            },
            update: {},
          });
          await prisma.patient.update({
            where: { id: patients[0] },
            data: { archived: false },
          });
        }
      },
    );
  },
);
