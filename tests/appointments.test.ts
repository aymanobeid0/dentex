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
    it("searches active patients with write alone and returns only the approved projection", async () => {
      const response = await request(app)
        .get("/api/clinic/appointments/patients?q=٢٠١٢٣٤٥٦&page=1")
        .set("Cookie", writer);
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(3);
      expect(Object.keys(response.body.items[0]).sort()).toEqual(
        ["id", "name", "phone", "fileNumber", "archived"].sort(),
      );
      expect(
        response.body.items.every((row: { id: string }) =>
          patients.slice(0, 3).includes(row.id),
        ),
      ).toBe(true);
      expect(
        (
          await request(app)
            .get("/api/clinic/appointments/patients")
            .set("Cookie", reader)
        ).status,
      ).toBe(403);
      await prisma.patient.update({
        where: { id: patients[0] },
        data: { archived: true },
      });
      try {
        const result = await request(app)
          .get("/api/clinic/appointments/patients?q=1")
          .set("Cookie", writer);
        expect(
          result.body.items.some(
            (row: { id: string }) => row.id === patients[0],
          ),
        ).toBe(false);
      } finally {
        await prisma.patient.update({
          where: { id: patients[0] },
          data: { archived: false },
        });
      }
    });
    it("reads lists and creation history with read alone while keeping phone and notes out of rows", async () => {
      const body = input({ administrativeNote: "Private booking note" });
      const booked = await book(body);
      expect(booked.status).toBe(201);
      const list = await request(app)
        .get(`/api/clinic/appointments?date=${body.date}`)
        .set("Cookie", reader);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0].patient).toEqual({
        id: patients[0],
        name: "Patient 0/0",
        fileNumber: "1",
        archived: false,
      });
      expect(JSON.stringify(list.body)).not.toContain("phone");
      expect(JSON.stringify(list.body)).not.toContain("Private booking note");
      const detail = await request(app)
        .get(`/api/clinic/appointments/${booked.body.id}`)
        .set("Cookie", reader);
      expect(detail.status).toBe(200);
      expect(detail.body.patient.phone).toBe("+22220123456");
      expect(detail.body.administrativeNote).toBe("Private booking note");
      expect(detail.body.createdBy).toEqual({
        id: users[0],
        name: "Operator 0",
      });
      expect(detail.body.changes).toHaveLength(1);
      expect(detail.body.changes[0].after.id).toBe(booked.body.id);
      expect(Object.keys(detail.body.changes[0].actor).sort()).toEqual([
        "id",
        "name",
      ]);
      expect(
        (
          await request(app)
            .get(`/api/clinic/appointments/${booked.body.id}`)
            .set("Cookie", writer)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`/api/clinic/appointments/${booked.body.id}`)
            .set("Cookie", cookie(doctors[2]))
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`/api/clinic/appointments/${booked.body.id}`)
            .set("Cookie", platform)
        ).status,
      ).toBe(403);
      const otherRole = await prisma.role.findFirstOrThrow({
        where: { clinicId: clinics[1], key: "dentist" },
      });
      await prisma.rolePermission.create({
        data: { roleId: otherRole.id, permissionKey: "appointments.read" },
      });
      expect(
        (
          await request(app)
            .get(`/api/clinic/appointments/${booked.body.id}`)
            .set("Cookie", cookie(doctors[2]))
        ).status,
      ).toBe(404);
    });
    it("requires both read grants for the patient section and keeps archived/ineligible bookings visible", async () => {
      const body = input(),
        booked = await book(body);
      expect(booked.status).toBe(201);
      const path = `/api/clinic/appointments/patient/${patients[0]}`;
      expect((await request(app).get(path).set("Cookie", reader)).status).toBe(
        403,
      );
      await prisma.permission.upsert({
        where: { key: "patients.read" },
        create: { key: "patients.read" },
        update: {},
      });
      await prisma.rolePermission.create({
        data: { roleId: dentistRole, permissionKey: "patients.read" },
      });
      await prisma.patient.update({
        where: { id: patients[0] },
        data: { archived: true },
      });
      await prisma.user.update({
        where: { id: doctors[0] },
        data: { active: false },
      });
      try {
        const response = await request(app).get(path).set("Cookie", reader);
        expect(response.status).toBe(200);
        expect(
          response.body.items.every(
            (row: { patient: { id: string; archived: boolean } }) =>
              row.patient.id === patients[0] && row.patient.archived,
          ),
        ).toBe(true);
        const row = response.body.items.find(
          (row: { id: string }) => row.id === booked.body.id,
        );
        expect(row.doctor.eligible).toBe(false);
        expect(
          (
            await request(app)
              .get(`/api/clinic/appointments/patient/${patients[3]}`)
              .set("Cookie", admin)
          ).status,
        ).toBe(404);
        expect(
          (
            await request(app)
              .get(`/api/clinic/appointments/${booked.body.id}`)
              .set("Cookie", reader)
          ).body.doctor.eligible,
        ).toBe(false);
      } finally {
        await prisma.rolePermission.delete({
          where: {
            roleId_permissionKey: {
              roleId: dentistRole,
              permissionKey: "patients.read",
            },
          },
        });
        await prisma.patient.update({
          where: { id: patients[0] },
          data: { archived: false },
        });
        await prisma.user.update({
          where: { id: doctors[0] },
          data: { active: true },
        });
      }
    });
    it("filters the entire day before pagination with deterministic ordering and no lost records", async () => {
      const selectedDate = date();
      const startsAt = new Date(`${selectedDate}T09:00:00.000Z`),
        endsAt = new Date(`${selectedDate}T09:30:00.000Z`);
      const target = await prisma.patient.create({
        data: {
          clinicId: clinics[0],
          name: "Unique Search Target",
          fileNumber: 999n,
          phone: "+22262119999",
          gender: "female",
        },
      });
      for (let i = 0; i < 55; i++)
        await prisma.appointment.create({
          data: {
            clinicId: clinics[0],
            patientId: i === 54 ? target.id : patients[0],
            doctorId: doctors[i % 2],
            createdBy: users[0],
            startsAt,
            endsAt,
            status: i === 54 ? "absent" : "cancelled",
          },
        });
      const read = (suffix = "") =>
        request(app)
          .get(`/api/clinic/appointments?date=${selectedDate}${suffix}`)
          .set("Cookie", reader);
      const first = await read(),
        second = await read("&page=2");
      expect(first.body.items).toHaveLength(50);
      expect(first.body.hasNext).toBe(true);
      expect(second.body.items).toHaveLength(5);
      expect(second.body.hasNext).toBe(false);
      expect(
        new Set(
          [...first.body.items, ...second.body.items].map((row) => row.id),
        ).size,
      ).toBe(55);
      for (const q of ["Unique Search", "٦٢١١٩٩٩٩", "٩٩٩"]) {
        const result = await read(`&q=${encodeURIComponent(q)}`);
        expect(result.body.total).toBe(1);
        expect(result.body.items[0].patient.id).toBe(target.id);
      }
      expect((await read("&status=absent")).body.total).toBe(1);
      expect((await read(`&doctorId=${doctors[1]}`)).body.total).toBe(27);
      expect((await read("&q=%25")).body.total).toBe(0);
      for (const suffix of [
        "&page=0",
        "&status=bad",
        "&doctorId=bad",
        "&other=1",
      ])
        expect((await read(suffix)).status).toBe(400);
      expect(
        (
          await request(app)
            .get("/api/clinic/appointments?date=2090-02-30")
            .set("Cookie", reader)
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .get("/api/clinic/appointments")
            .set("Cookie", neither)
        ).status,
      ).toBe(403);
    });
    it("requires both permissions for editing and keeps the patient immutable", async () => {
      const created = await book(input());
      const path = `/api/clinic/appointments/${created.body.id}`;
      for (const auth of [writer, reader, neither, platform])
        expect(
          (
            await request(app)
              .patch(path)
              .set("Cookie", auth)
              .set("Origin", origin)
              .send({
                kind: "note",
                editVersion: 1,
                administrativeNote: "Denied",
              })
          ).status,
        ).toBe(403);
      for (const extra of [
        { patientId: patients[1] },
        { clinicId: clinics[1] },
        {
          kind: "status",
          status: "cancelled",
          cancellationReason: "reason",
          doctorId: doctors[1],
        },
      ])
        expect(
          (
            await request(app)
              .patch(path)
              .set("Cookie", admin)
              .set("Origin", origin)
              .send({
                kind: "note",
                editVersion: 1,
                administrativeNote: "",
                ...extra,
              })
          ).status,
        ).toBe(400);
      expect(
        (
          await prisma.appointment.findUniqueOrThrow({
            where: { id: created.body.id },
          })
        ).editVersion,
      ).toBe(1);
    });
    const states = ["booked", "attended", "absent", "cancelled"];
    it.each(states.flatMap((from) => states.map((to) => [from, to])))(
      "audits manual status correction %s to %s",
      async (from, to) => {
        const created = await book(input());
        const path = `/api/clinic/appointments/${created.body.id}`;
        const patch = (status: string, editVersion: number) =>
          request(app)
            .patch(path)
            .set("Cookie", admin)
            .set("Origin", origin)
            .send({
              kind: "status",
              editVersion,
              status,
              ...(status === "cancelled"
                ? { cancellationReason: "Patient called" }
                : {}),
            });
        expect((await patch(from, 1)).status).toBe(200);
        const result = await patch(to, 2);
        expect(result.status).toBe(200);
        expect(result.body.status).toBe(to);
        expect(result.body.editVersion).toBe(3);
        const changes = await prisma.appointmentChange.findMany({
          where: { appointmentId: created.body.id },
          orderBy: { createdAt: "asc" },
        });
        expect(changes).toHaveLength(3);
        expect(changes[2].before).toMatchObject({
          status: from,
          editVersion: 2,
        });
        expect(changes[2].after).toMatchObject({
          status: to,
          editVersion: 3,
        });
        if (to === "cancelled")
          expect(changes[2].after).toMatchObject({
            cancellationReason: "Patient called",
          });
      },
    );
    it("corrects a past appointment status without changing its original schedule", async () => {
      const created = await book(input());
      await prisma.appointment.update({
        where: { id: created.body.id },
        data: {
          startsAt: new Date("2001-01-01T10:00:00Z"),
          endsAt: new Date("2001-01-01T10:30:00Z"),
        },
      });
      const result = await request(app)
        .patch(`/api/clinic/appointments/${created.body.id}`)
        .set("Cookie", admin)
        .set("Origin", origin)
        .send({ kind: "status", editVersion: 1, status: "attended" });
      expect(result.status).toBe(200);
      expect(result.body.startsAt).toBe("2001-01-01T10:00:00.000Z");
    });
    it("releases time for early absence and refuses restoration after that time is rebooked", async () => {
      const body = input(),
        original = await book(body);
      const patch = (values: object) =>
        request(app)
          .patch(`/api/clinic/appointments/${original.body.id}`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send(values);
      expect(
        (await patch({ kind: "status", editVersion: 1, status: "absent" }))
          .status,
      ).toBe(200);
      expect((await book({ ...body, patientId: patients[1] })).status).toBe(
        201,
      );
      for (const status of ["booked", "attended"])
        expect(
          (await patch({ kind: "status", editVersion: 2, status })).body.error,
        ).toBe("appointment_overlap");
      expect(
        (
          await patch({
            kind: "schedule",
            editVersion: 2,
            doctorId: doctors[1],
            date: date(),
            time: "11:00",
            durationMinutes: 30,
          })
        ).body.error,
      ).toBe("appointment_not_booked");
      expect(
        (
          await patch({
            kind: "note",
            editVersion: 2,
            administrativeNote: "Document absence",
          })
        ).status,
      ).toBe(200);
      expect(
        await prisma.appointmentChange.count({
          where: { appointmentId: original.body.id },
        }),
      ).toBe(3);
    });
    it("preserves inactive doctor bookings, restricts archived patients to cancellation and audits the reason", async () => {
      const created = await book(input()),
        path = `/api/clinic/appointments/${created.body.id}`;
      const patch = (values: object) =>
        request(app)
          .patch(path)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send(values);
      await prisma.user.update({
        where: { id: doctors[0] },
        data: { active: false },
      });
      try {
        expect(
          (await patch({ kind: "status", editVersion: 1, status: "attended" }))
            .status,
        ).toBe(200);
        expect(
          (
            await patch({
              kind: "note",
              editVersion: 2,
              administrativeNote: "Historical doctor",
            })
          ).status,
        ).toBe(200);
        expect(
          (await patch({ kind: "status", editVersion: 3, status: "booked" }))
            .status,
        ).toBe(200);
        expect(
          (
            await patch({
              kind: "schedule",
              editVersion: 4,
              doctorId: doctors[0],
              date: date(),
              time: "11:00",
              durationMinutes: 30,
            })
          ).body.error,
        ).toBe("doctor_ineligible");
        await prisma.patient.update({
          where: { id: patients[0] },
          data: { archived: true },
        });
        for (const values of [
          { kind: "status", status: "absent" },
          { kind: "note", administrativeNote: "Denied" },
          {
            kind: "schedule",
            doctorId: doctors[1],
            date: date(),
            time: "11:00",
            durationMinutes: 30,
          },
        ])
          expect((await patch({ editVersion: 4, ...values })).body.error).toBe(
            "patient_archived",
          );
        expect(
          (
            await patch({
              kind: "status",
              editVersion: 4,
              status: "cancelled",
              cancellationReason: "Archived file",
            })
          ).status,
        ).toBe(200);
        const detail = await request(app).get(path).set("Cookie", reader);
        expect(detail.body.changes.at(-1).after.cancellationReason).toBe(
          "Archived file",
        );
      } finally {
        await prisma.user.update({
          where: { id: doctors[0] },
          data: { active: true },
        });
        await prisma.patient.update({
          where: { id: patients[0] },
          data: { archived: false },
        });
      }
    });
    it("reschedules booked appointments with doctor history, minute precision and midnight boundaries", async () => {
      const created = await book(input()),
        path = `/api/clinic/appointments/${created.body.id}`;
      const patch = (values: object) =>
        request(app)
          .patch(path)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send(values);
      const selectedDate = date();
      const valid = {
        kind: "schedule",
        editVersion: 1,
        doctorId: doctors[1],
        date: selectedDate,
        time: "23:55",
        durationMinutes: 5,
      };
      for (const change of [
        { time: "23:56" },
        { date: "2000-01-01" },
        { doctorId: doctors[2] },
        { durationMinutes: 6 },
      ])
        expect((await patch({ ...valid, ...change })).status).toBe(
          change.doctorId ? 404 : change.date ? 409 : 400,
        );
      const result = await patch(valid);
      expect(result.status).toBe(200);
      expect(result.body.startsAt).toBe(`${selectedDate}T23:55:00.000Z`);
      expect(result.body.patientId).toBe(patients[0]);
      const detail = await request(app).get(path).set("Cookie", reader);
      expect(detail.body.changes.at(-1).before.doctor.name).toBe("Doctor 0/0");
      expect(detail.body.changes.at(-1).after.doctor.name).toBe("Doctor 0/1");
    });
    it("serializes concurrent edits and schedule collisions without partial history", async () => {
      const created = await book(input());
      const edit = (id: string, body: object) =>
        request(app)
          .patch(`/api/clinic/appointments/${id}`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send(body);
      const notes = await Promise.all(
        ["one", "two"].map((administrativeNote) =>
          edit(created.body.id, {
            kind: "note",
            editVersion: 1,
            administrativeNote,
          }),
        ),
      );
      expect(notes.map((result) => result.status).sort()).toEqual([200, 409]);
      expect(
        await prisma.appointmentChange.count({
          where: { appointmentId: created.body.id },
        }),
      ).toBe(2);
      const first = await book(input()),
        second = await book(
          input({ patientId: patients[1], doctorId: doctors[1] }),
        ),
        target = date();
      const schedule = {
        kind: "schedule",
        editVersion: 1,
        date: target,
        time: "10:00",
        durationMinutes: 30,
        doctorId: doctors[0],
      };
      const rescheduled = await Promise.all([
        edit(first.body.id, schedule),
        edit(second.body.id, schedule),
      ]);
      expect(rescheduled.map((result) => result.status).sort()).toEqual([
        200, 409,
      ]);
      expect(
        await prisma.appointmentChange.count({
          where: { appointmentId: { in: [first.body.id, second.body.id] } },
        }),
      ).toBe(3);
    });
    it("rolls an edit back if its history event cannot be persisted", async () => {
      const created = await book(input());
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION appointments04_fail_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.appointment_id='${created.body.id}'::uuid AND NEW.action <> 'created' THEN RAISE EXCEPTION 'synthetic history failure'; END IF; RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER appointments04_history_guard BEFORE INSERT ON appointment_changes FOR EACH ROW EXECUTE FUNCTION appointments04_fail_history()",
      );
      try {
        const result = await request(app)
          .patch(`/api/clinic/appointments/${created.body.id}`)
          .set("Cookie", admin)
          .set("Origin", origin)
          .send({
            kind: "note",
            editVersion: 1,
            administrativeNote: "Must roll back",
          });
        expect(result.status).toBe(500);
        expect(result.body).toEqual({ error: "server_error" });
        const stored = await prisma.appointment.findUniqueOrThrow({
          where: { id: created.body.id },
        });
        expect(stored.editVersion).toBe(1);
        expect(stored.administrativeNote).toBeNull();
        expect(
          await prisma.appointmentChange.count({
            where: { appointmentId: created.body.id },
          }),
        ).toBe(1);
      } finally {
        await prisma.$executeRawUnsafe(
          "DROP TRIGGER appointments04_history_guard ON appointment_changes",
        );
        await prisma.$executeRawUnsafe(
          "DROP FUNCTION appointments04_fail_history()",
        );
      }
    });
    it.each(["grant", "doctor", "patient"])(
      "rechecks %s after an edit waits for the clinic lock",
      async (changed) => {
        const created = await book(input());
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionKey: {
              roleId: writerRole,
              permissionKey: "appointments.read",
            },
          },
          create: { roleId: writerRole, permissionKey: "appointments.read" },
          update: {},
        });
        const lock = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
        await lock.connect();
        try {
          await lock.query("BEGIN");
          await lock.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
            clinics[0],
          ]);
          const input =
            changed === "doctor"
              ? {
                  kind: "schedule",
                  editVersion: 1,
                  doctorId: doctors[0],
                  date: date(),
                  time: "11:00",
                  durationMinutes: 30,
                }
              : {
                  kind: "note",
                  editVersion: 1,
                  administrativeNote: "Concurrent eligibility",
                };
          let settled = false;
          const pending = request(app)
            .patch(`/api/clinic/appointments/${created.body.id}`)
            .set("Cookie", writer)
            .set("Origin", origin)
            .send(input)
            .then((response) => {
              settled = true;
              return response;
            });
          let waiting = false;
          for (let n = 0; n < 100; n++) {
            const result = await lock.query(
              "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid()=ANY(pg_blocking_pids(pid))) AS waiting",
            );
            if (result.rows[0].waiting) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(waiting).toBe(true);
          expect(settled).toBe(false);
          if (changed === "grant")
            await lock.query(
              "DELETE FROM role_permissions WHERE role_id=$1 AND permission_key=$2",
              [writerRole, "appointments.read"],
            );
          else if (changed === "doctor")
            await lock.query("UPDATE users SET active=false WHERE id=$1", [
              doctors[0],
            ]);
          else
            await lock.query("UPDATE patients SET archived=true WHERE id=$1", [
              patients[0],
            ]);
          await lock.query("COMMIT");
          const response = await pending;
          expect(response.status).toBe(changed === "grant" ? 403 : 409);
          expect(response.body.error).toBe(
            changed === "grant"
              ? "forbidden"
              : changed === "doctor"
                ? "doctor_ineligible"
                : "patient_archived",
          );
          expect(
            (
              await prisma.appointment.findUniqueOrThrow({
                where: { id: created.body.id },
              })
            ).editVersion,
          ).toBe(1);
          expect(
            await prisma.appointmentChange.count({
              where: { appointmentId: created.body.id },
            }),
          ).toBe(1);
        } finally {
          await lock.query("ROLLBACK");
          await lock.end();
          await prisma.rolePermission.deleteMany({
            where: { roleId: writerRole, permissionKey: "appointments.read" },
          });
          await prisma.user.update({
            where: { id: doctors[0] },
            data: { active: true },
          });
          await prisma.patient.update({
            where: { id: patients[0] },
            data: { archived: false },
          });
        }
      },
    );
    it("reads Monday-to-Sunday weeks across years and keeps midnight bookings on their starting day", async () => {
      const starts = [
        "2026-12-27T23:55:00Z",
        "2026-12-28T00:00:00Z",
        "2026-12-31T23:55:00Z",
        "2027-01-03T23:55:00Z",
        "2027-01-04T00:00:00Z",
      ];
      const ids: string[] = [];
      for (const value of starts) {
        const row = await prisma.appointment.create({
          data: {
            clinicId: clinics[0],
            patientId: patients[0],
            doctorId: doctors[0],
            createdBy: users[0],
            startsAt: new Date(value),
            endsAt: new Date(Date.parse(value) + 300000),
            status: "cancelled",
          },
        });
        ids.push(row.id);
      }
      const response = await request(app)
        .get("/api/clinic/appointments?date=2027-01-01&view=week")
        .set("Cookie", reader);
      expect(response.status).toBe(200);
      expect(response.body.items.map((row: { id: string }) => row.id)).toEqual(
        ids.slice(1, 4),
      );
      expect(response.body.total).toBe(3);
      expect(response.body.hasNext).toBe(false);
      for (const suffix of [
        "view=bad",
        "view=week&page=2",
        "view=month&page=2",
      ])
        expect(
          (
            await request(app)
              .get(`/api/clinic/appointments?date=2027-01-01&${suffix}`)
              .set("Cookie", reader)
          ).status,
        ).toBe(400);
    });
    it("returns a complete leap-month calendar beyond the day page size with full-period filters", async () => {
      const target = await prisma.patient.create({
        data: {
          clinicId: clinics[0],
          name: "Calendar unique target",
          fileNumber: 1001n,
          phone: "+22220123456",
          gender: "male",
          isChild: true,
        },
      });
      for (const value of [
        "2088-01-31T23:55:00Z",
        "2088-02-01T00:00:00Z",
        "2088-02-29T23:55:00Z",
        "2088-03-01T00:00:00Z",
      ])
        await prisma.appointment.create({
          data: {
            clinicId: clinics[0],
            patientId: patients[0],
            doctorId: doctors[0],
            createdBy: users[0],
            startsAt: new Date(value),
            endsAt: new Date(Date.parse(value) + 300000),
            status: "cancelled",
          },
        });
      for (let n = 0; n < 55; n++)
        await prisma.appointment.create({
          data: {
            clinicId: clinics[0],
            patientId: n === 54 ? target.id : patients[0],
            doctorId: doctors[n % 2],
            createdBy: users[0],
            startsAt: new Date("2088-02-20T10:00:00Z"),
            endsAt: new Date("2088-02-20T10:30:00Z"),
            status: n === 54 ? "absent" : "cancelled",
          },
        });
      const read = (suffix = "", auth = reader) =>
        request(app)
          .get(`/api/clinic/appointments?date=2088-02-15&view=month${suffix}`)
          .set("Cookie", auth);
      const response = await read();
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(57);
      expect(response.body.total).toBe(57);
      expect(response.body.hasNext).toBe(false);
      expect(response.body.page).toBe(1);
      expect(response.body.items[0].startsAt).toBe("2088-02-01T00:00:00.000Z");
      expect(response.body.items.at(-1).startsAt).toBe(
        "2088-02-29T23:55:00.000Z",
      );
      expect((await read("&q=1001")).body.items[0].patient.id).toBe(target.id);
      expect((await read("&status=absent")).body.total).toBe(1);
      expect(
        (await read(`&doctorId=${doctors[1]}`)).body.items.every(
          (row: { doctor: { id: string } }) => row.doctor.id === doctors[1],
        ),
      ).toBe(true);
      for (const auth of [writer, neither, platform])
        expect((await read("", auth)).status).toBe(403);
      expect((await read("", cookie(doctors[2]))).body.items).toHaveLength(0);
      const dayResponse = await request(app)
        .get("/api/clinic/appointments?date=2088-02-20")
        .set("Cookie", reader);
      expect(dayResponse.body.items).toHaveLength(50);
      expect(dayResponse.body.hasNext).toBe(true);
      expect(dayResponse.body.total).toBe(55);
      expect(JSON.stringify(response.body)).not.toContain("phone");
      expect(JSON.stringify(response.body)).not.toContain("administrativeNote");
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
      ).toBe(403);
    });
    it.each(["reader", "neither", "platform", "anonymous"])(
      "rejects %s on create and doctor lookup",
      async (who) => {
        const auth = { reader, neither, platform, anonymous: "" }[
          who as "reader"
        ];
        expect((await book(input(), auth)).status).toBe(
          who === "anonymous" ? 401 : 403,
        );
        const result = await request(app)
          .get("/api/clinic/appointments/doctors")
          .set("Cookie", auth);
        expect(result.status).toBe(
          who === "reader" ? 200 : who === "anonymous" ? 401 : 403,
        );
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
        // Either exclusion rejection or a deadlock victim must leave one row.
        // The HTTP case below separately verifies 23P01 -> private 409.
        expect(["23P01", "40P01"]).toContain(
          rejected?.reason.meta.driverAdapterError.cause.originalCode,
        );
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
