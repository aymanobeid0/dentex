import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import { app, prisma } from "../server/app";
import { createAppointmentsOperations } from "../server/modules/appointments/appointments.service";
import { createAppointmentsRepository } from "../server/modules/appointments/appointments.repository";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "visit appointment references through HTTP",
  () => {
    const prefix = `visits03-${crypto.randomUUID()}`;
    const clinics: string[] = [],
      users: string[] = [],
      patients: string[] = [];
    let auth: string;
    const origin = "http://localhost:5173";
    const call = (
      method: "get" | "post" | "patch",
      path: string,
      body?: object,
      cookie = auth,
    ) =>
      request(app)
        [method](`/api/clinic/${path}`)
        .set("Cookie", cookie)
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
      const used = new Set((await prisma.clinic.findMany()).map((r) => r.code));
      const codes = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      ).filter((c) => !used.has(c));
      for (let c = 0; c < 2; c++) {
        const clinic = await prisma.clinic.create({
          data: { name: prefix, code: codes[c] },
        });
        clinics.push(clinic.id);
        for (const key of ["admin", "dentist", "receptionist"]) {
          const role = await prisma.role.create({
            data: { clinicId: clinic.id, key },
          });
          const user = await prisma.user.create({
            data: {
              clinicId: clinic.id,
              name: key,
              username: `${prefix}-${key}`,
              passwordHash: "unused",
            },
          });
          users.push(user.id);
          await prisma.userRole.create({
            data: { clinicId: clinic.id, userId: user.id, roleId: role.id },
          });
        }
        for (let p = 0; p < 12; p++)
          patients.push(
            (
              await prisma.patient.create({
                data: {
                  clinicId: clinic.id,
                  name: `${prefix}-${p}`,
                  fileNumber: BigInt(p + 1),
                  phone: "+22220123456",
                  gender: "male",
                  isChild: true,
                },
              })
            ).id,
          );
      }
      auth = cookie(users[0]);
    });
    const cookie = (id: string, kind = "clinic", version = 1) =>
      `dentex_session=${jwt.sign({ kind, version }, process.env.JWT_SECRET!, { subject: id, expiresIn: "1h" })}`;
    afterAll(async () => {
      for (const clinicId of clinics) {
        // Only this suite's rows, including a first red before the new tables exist.
        for (const table of [
          "appointment_visit_changes",
          "appointment_visit_pins",
          "appointment_visit_links",
        ])
          await prisma
            .$executeRawUnsafe(
              `DELETE FROM ${table} WHERE clinic_id=$1::uuid`,
              clinicId,
            )
            .catch(() => {});
        await prisma.appointmentChange.deleteMany({ where: { clinicId } });
        await prisma.appointment.deleteMany({ where: { clinicId } });
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
    async function entered(p: number, complete = true) {
      const arrived = await call("post", "visits", {
        patientId: patients[p],
        doctorId: users[1],
      });
      expect(arrived.status).toBe(201);
      const started = await call("post", `visits/${arrived.body.id}/start`, {
        editVersion: 1,
      });
      expect(started.status).toBe(200);
      if (!complete) return started.body;
      const ended = await call("post", `visits/${arrived.body.id}/complete`, {
        editVersion: 2,
        visitVersion: 1,
      });
      expect(ended.status).toBe(200);
      return ended.body;
    }
    let sequence = 0;
    async function appointment(
      p: number,
      status = "booked",
      day = new Date().toISOString().slice(0, 10),
      c = 0,
    ) {
      const startsAt = new Date(
        new Date(`${day}T20:00:00Z`).getTime() + sequence++ * 360000,
      );
      return prisma.appointment.create({
        data: {
          clinicId: clinics[c],
          patientId: patients[p],
          doctorId: users[c * 3 + 1],
          createdBy: users[c * 3],
          startsAt,
          endsAt: new Date(startsAt.getTime() + 300000),
          status,
        },
      });
    }
    const assign = (
      row: any,
      appointmentId: string,
      expectedLinkVersion = 0,
      expectedAppointmentVersion = 1,
    ) => ({
      kind: "assign",
      visitId: row.visit.id,
      visitVersion: row.visit.editVersion,
      expectedLinkVersion,
      appointmentId,
      expectedAppointmentVersion,
    });
    it("offers same-patient visit-day references after actual entry and links a completed visit without synchronizing states", async () => {
      const row = await entered(0),
        a = await appointment(0, "cancelled");
      const options = await call("get", `visits/${row.id}/appointment-options`);
      expect(options.status).toBe(200);
      expect(options.body).toMatchObject({
        visitId: row.visit.id,
        visitDay: row.visit.startedAt.slice(0, 10),
        link: { visitId: row.visit.id, appointmentId: null, editVersion: 0 },
        items: [{ id: a.id, status: "cancelled" }],
      });
      expect(Object.keys(options.body.items[0]).sort()).toEqual(
        [
          "id",
          "patientId",
          "doctorId",
          "doctor",
          "startsAt",
          "status",
          "editVersion",
        ].sort(),
      );
      const linked = await call(
        "patch",
        `visits/${row.id}/appointment-link`,
        assign(row, a.id),
      );
      expect(linked.status).toBe(200);
      expect(
        Object.keys(
          linked.body.visit.appointmentLink.appointment.doctor,
        ).sort(),
      ).toEqual(["id", "name"]);
      expect(linked.body).toMatchObject({
        status: "completed",
        visit: {
          status: "completed",
          editVersion: 3,
          appointmentLink: { appointmentId: a.id, editVersion: 1 },
        },
      });
      expect((await call("get", `appointments/${a.id}`)).body.status).toBe(
        "cancelled",
      );
      expect(
        (await call("get", `visits/patient/${patients[0]}`)).body.items[0].visit
          .appointmentLink.appointmentId,
      ).toBe(a.id);
    });
    it("uses entry day rather than arrival day and refuses waiting, other patients, other days and foreign clinic references", async () => {
      const waiting = (
        await call("post", "visits", {
          patientId: patients[1],
          doctorId: users[1],
        })
      ).body;
      expect(
        (await call("get", `visits/${waiting.id}/appointment-options`)).status,
      ).toBe(409);
      const row = (
        await call("post", `visits/${waiting.id}/start`, { editVersion: 1 })
      ).body;
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 10);
      await prisma.attendance.update({
        where: { id: row.id },
        data: { arrivedAt: new Date(`${yesterday}T09:00:00Z`) },
      });
      const good = await appointment(1),
        old = await appointment(1, "absent", yesterday),
        other = await appointment(2, "absent"),
        foreign = await appointment(12, "absent", undefined, 1);
      const options = await call("get", `visits/${row.id}/appointment-options`);
      expect(options.body.items.map((item: any) => item.id)).toEqual([good.id]);
      for (const a of [old, other])
        expect(
          (
            await call(
              "patch",
              `visits/${row.id}/appointment-link`,
              assign(row, a.id),
            )
          ).status,
        ).toBe(409);
      expect(
        (
          await call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, foreign.id),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, good.id, 0, 2),
          )
        ).body.error,
      ).toBe("edit_conflict");
      expect(
        (
          await call("patch", `visits/${row.id}/appointment-link`, {
            ...assign(row, good.id),
            clinicId: clinics[1],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, good.id),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await call("post", `visits/${row.id}/complete`, {
            editVersion: 2,
            visitVersion: 2,
          })
        ).status,
      ).toBe(200);
    });
    const schedule = (
      id: string,
      date: string,
      editVersion = 1,
      time = "23:30",
    ) =>
      call("patch", `appointments/${id}`, {
        kind: "schedule",
        editVersion,
        doctorId: users[1],
        date,
        time,
        durationMinutes: 5,
      });
    const tomorrow = () =>
      new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    it("retains null-link revisions and historical pins after detach and relink without partially losing a rejected reference", async () => {
      let row = await entered(3),
        a = await appointment(3),
        b = await appointment(3);
      row = (
        await call(
          "patch",
          `visits/${row.id}/appointment-link`,
          assign(row, a.id),
        )
      ).body;
      row = (
        await call("patch", `visits/${row.id}/appointment-link`, {
          kind: "detach",
          visitId: row.visit.id,
          visitVersion: row.visit.editVersion,
          expectedLinkVersion: 1,
        })
      ).body;
      expect(row.visit.appointmentLink).toMatchObject({
        appointmentId: null,
        editVersion: 2,
      });
      expect(
        (
          await call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, b.id, 0),
          )
        ).body.error,
      ).toBe("edit_conflict");
      expect((await schedule(a.id, tomorrow())).body.error).toBe(
        "appointment_visit_day_locked",
      );
      row = (
        await call(
          "patch",
          `visits/${row.id}/appointment-link`,
          assign(row, b.id, 2),
        )
      ).body;
      const bad = await appointment(4, "absent");
      expect(
        (
          await call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, bad.id, 3),
          )
        ).status,
      ).toBe(409);
      expect(
        (await call("get", `visits/${row.id}`)).body.visit.appointmentLink
          .appointmentId,
      ).toBe(b.id);
      row = (
        await call(
          "patch",
          `visits/${row.id}/appointment-link`,
          assign(row, a.id, 3),
        )
      ).body;
      expect(row.visit.appointmentLink.editVersion).toBe(4);
      expect((await schedule(b.id, tomorrow())).status).toBe(409);
      const another = await entered(3);
      expect(
        (
          await call(
            "patch",
            `visits/${another.id}/appointment-link`,
            assign(another, b.id),
          )
        ).body.error,
      ).toBe("appointment_visit_reserved");
      expect(
        (await schedule(a.id, row.visit.startedAt.slice(0, 10))).status,
      ).toBe(200);
      const cancelled = await appointment(3, "cancelled");
      expect((await schedule(cancelled.id, tomorrow())).body.error).toBe(
        "appointment_not_booked",
      );
    });
    it("serializes concurrent links and schedule/link requests into one winner", async () => {
      const a = await appointment(5),
        first = await entered(5),
        second = await entered(5);
      const linked = await Promise.all([
        call(
          "patch",
          `visits/${first.id}/appointment-link`,
          assign(first, a.id),
        ),
        call(
          "patch",
          `visits/${second.id}/appointment-link`,
          assign(second, a.id),
        ),
      ]);
      expect(linked.map((r) => r.status).sort()).toEqual([200, 409]);
      const b = await appointment(6),
        row = await entered(6);
      const raced = await Promise.all([
        call("patch", `visits/${row.id}/appointment-link`, assign(row, b.id)),
        schedule(b.id, tomorrow()),
      ]);
      expect(raced.map((r) => r.status).sort()).toEqual([200, 409]);
      const stored = (await call("get", `appointments/${b.id}`)).body;
      const visit = (await call("get", `visits/${row.id}`)).body;
      expect(stored.startsAt.slice(0, 10)).toBe(
        raced[0].status === 200 ? row.visit.startedAt.slice(0, 10) : tomorrow(),
      );
      expect(visit.visit.appointmentLink.appointmentId).toBe(
        raced[0].status === 200 ? b.id : null,
      );
    });
    it("authorizes all three fresh administrative roles without appointment grants and isolates records and invalid sessions", async () => {
      let row = await entered(7);
      const a = await appointment(7, "attended");
      for (const id of users.slice(0, 3)) {
        const token = cookie(id);
        expect(
          (
            await call(
              "get",
              `visits/${row.id}/appointment-options`,
              undefined,
              token,
            )
          ).status,
        ).toBe(200);
        const response = await call(
          "patch",
          `visits/${row.id}/appointment-link`,
          assign(row, a.id, row.visit.appointmentLink.editVersion),
          token,
        );
        expect(response.status).toBe(200);
        row = response.body;
      }
      expect(
        (
          await call(
            "get",
            `visits/${row.id}/appointment-options`,
            undefined,
            cookie(users[3]),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, a.id, 3),
            cookie(users[3]),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            "get",
            `visits/${row.id}/appointment-options`,
            undefined,
            cookie(users[0], "clinic", 0),
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            "get",
            `visits/${row.id}/appointment-options`,
            undefined,
            cookie(users[0], "platform"),
          )
        ).status,
      ).toBe(401);
    });
    it.each([0, 1, 2])(
      "rechecks administrative actor %s after waiting for the clinic lock",
      async (roleIndex) => {
        const row = await entered(8),
          a = await appointment(8, "absent"),
          client = new Client({
            connectionString: process.env.TEST_DATABASE_URL,
          });
        await client.connect();
        const assignment = await prisma.userRole.findFirstOrThrow({
          where: { userId: users[roleIndex] },
        });
        try {
          await client.query("BEGIN");
          await client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
            clinics[0],
          ]);
          const pending = call(
            "patch",
            `visits/${row.id}/appointment-link`,
            assign(row, a.id),
            cookie(users[roleIndex]),
          ).then((r) => r);
          const deadline = Date.now() + 4000;
          let waiting = false;
          while (Date.now() < deadline) {
            const result = await client.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
            );
            if (result.rowCount) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(waiting).toBe(true);
          await client.query("DELETE FROM user_roles WHERE user_id=$1", [
            users[roleIndex],
          ]);
          await client.query("COMMIT");
          expect((await pending).status).toBe(403);
          expect(
            (
              await call(
                "get",
                `visits/${row.id}`,
                undefined,
                cookie(users[(roleIndex + 1) % 3]),
              )
            ).body.visit.appointmentLink.editVersion,
          ).toBe(0);
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
    it("rolls back both module writes when appointment auditing fails after the pin and link updates", async () => {
      const row = await entered(9),
        a = await appointment(9, "absent"),
        client = new Client({
          connectionString: process.env.TEST_DATABASE_URL,
        });
      await client.connect();
      const suffix = crypto.randomUUID().replaceAll("-", "");
      try {
        await client.query(
          `CREATE FUNCTION qa_link_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.visit_id='${row.visit.id}'::uuid THEN RAISE EXCEPTION 'synthetic late link failure'; END IF; RETURN NEW; END $$`,
        );
        await client.query(
          `CREATE TRIGGER qa_link_${suffix} BEFORE INSERT ON appointment_visit_changes FOR EACH ROW EXECUTE FUNCTION qa_link_${suffix}()`,
        );
        expect(
          (
            await call(
              "patch",
              `visits/${row.id}/appointment-link`,
              assign(row, a.id),
            )
          ).status,
        ).toBe(500);
        const stored = (await call("get", `visits/${row.id}`)).body;
        expect(stored.visit.editVersion).toBe(row.visit.editVersion);
        expect(stored.visit.appointmentLink.editVersion).toBe(0);
        // No stranded historical pin may prohibit a different-day schedule after rollback.
        await client.query(
          `DROP TRIGGER qa_link_${suffix} ON appointment_visit_changes`,
        );
        await prisma.appointment.update({
          where: { id: a.id },
          data: { status: "booked" },
        });
        expect((await schedule(a.id, tomorrow(), 1, "23:45")).status).toBe(200);
      } finally {
        await client.query(
          `DROP TRIGGER IF EXISTS qa_link_${suffix} ON appointment_visit_changes`,
        );
        await client.query(`DROP FUNCTION IF EXISTS qa_link_${suffix}()`);
        await client.end();
      }
    });
    it("the declared transaction-bound invalid-entry mode releases only that opaque entry's pins and preserves its null revision", async () => {
      const a = await appointment(10, "absent"),
        b = await appointment(10, "cancelled"),
        visitId = crypto.randomUUID(),
        otherId = crypto.randomUUID();
      const operate = async (
        operation: (
          ops: ReturnType<typeof createAppointmentsOperations>,
        ) => Promise<unknown>,
      ) =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM clinics WHERE id=${clinics[0]}::uuid FOR UPDATE`;
          return operation(
            createAppointmentsOperations(createAppointmentsRepository(tx)),
          );
        });
      const facts = {
        patientId: patients[10],
        visitDay: a.startsAt.toISOString().slice(0, 10),
        actorId: users[0],
      };
      await operate((ops) =>
        ops.setVisitLink(clinics[0], {
          ...facts,
          kind: "assign",
          visitId,
          appointmentId: a.id,
          expectedAppointmentVersion: 1,
          expectedLinkVersion: 0,
        }),
      );
      await operate((ops) =>
        ops.setVisitLink(clinics[0], {
          ...facts,
          kind: "assign",
          visitId: otherId,
          appointmentId: b.id,
          expectedAppointmentVersion: 1,
          expectedLinkVersion: 0,
        }),
      );
      const invalidated = await operate((ops) =>
        ops.setVisitLink(clinics[0], {
          ...facts,
          kind: "invalidateEntry",
          visitId,
          expectedLinkVersion: 1,
        }),
      );
      expect(invalidated).toMatchObject({
        visitId,
        appointmentId: null,
        editVersion: 2,
      });
      await expect(
        operate((ops) =>
          ops.setVisitLink(clinics[0], {
            ...facts,
            kind: "detach",
            visitId,
            expectedLinkVersion: 1,
          }),
        ),
      ).rejects.toMatchObject({ code: "edit_conflict" });
      expect(
        await operate((ops) => ops.visitLinks(clinics[0], [otherId])),
      ).toMatchObject([{ appointmentId: b.id, editVersion: 1 }]);
      await prisma.appointment.updateMany({
        where: { id: { in: [a.id, b.id] } },
        data: { status: "booked" },
      });
      expect((await schedule(a.id, tomorrow(), 1, "23:40")).status).toBe(200);
      expect((await schedule(b.id, tomorrow())).body.error).toBe(
        "appointment_visit_day_locked",
      );
      // This exercises only the approved opaque operation seam. No correction04 HTTP/UI is introduced.
    });
  },
);
