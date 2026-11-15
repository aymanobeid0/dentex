// @vitest-environment jsdom
import "./ui-browser-apis";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../../server/app";
import { PatientTreatmentPlans } from "../../client/features/visits/PatientTreatmentPlans";
import { VisitTreatments } from "../../client/features/visits/VisitTreatments";
import { renderPatient } from "./render-patient";
import { treatmentCopy } from "../../client/features/visits/treatments.copy";
import { procedureCopy } from "../../client/features/visits/procedures.copy";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "treatment UI through HTTP and real isolated PostgreSQL",
  () => {
    let clinicId: string, doctorId: string, cookie: string;
    const prefix = `treatment-ui-${randomUUID()}`,
      origin = "http://localhost:5173";
    const http = (
      method: "get" | "post" | "patch",
      path: string,
      body?: object,
    ) =>
      request(app)
        [method](path)
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
      process.env.JWT_SECRET = "synthetic-treatment-ui-secret-32-characters";
      process.env.APP_ORIGIN = origin;
      const used = new Set((await prisma.clinic.findMany()).map((x) => x.code)),
        code = Array.from({ length: 10000 }, (_, i) =>
          String(i).padStart(4, "0"),
        ).find((x) => !used.has(x))!;
      clinicId = (await prisma.clinic.create({ data: { name: prefix, code } }))
        .id;
      const role = await prisma.role.create({
        data: { clinicId, key: "dentist" },
      });
      doctorId = (
        await prisma.user.create({
          data: {
            clinicId,
            name: "Synthetic Dentist",
            username: prefix,
            passwordHash: "unused",
          },
        })
      ).id;
      await prisma.userRole.create({
        data: { clinicId, userId: doctorId, roleId: role.id },
      });
      cookie = `dentex_session=${jwt.sign({ kind: "clinic", version: 1 }, process.env.JWT_SECRET!, { subject: doctorId, expiresIn: "1h" })}`;
    });
    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      if (clinicId) {
        await prisma.treatmentProcedure.deleteMany({ where: { clinicId } });
        await prisma.treatmentChange.deleteMany({ where: { clinicId } });
        await prisma.treatmentItem.deleteMany({ where: { clinicId } });
        await prisma.treatmentPlan.deleteMany({ where: { clinicId } });
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
    const bridge = (lost = false) => {
      let lostOnce = false;
      return vi.fn(async (url: string, options?: RequestInit) => {
        const method = (options?.method ?? "GET").toLowerCase() as
          "get" | "post" | "patch";
        const response = await http(
          method,
          url,
          options?.body ? JSON.parse(options.body as string) : undefined,
        );
        if (
          lost &&
          !lostOnce &&
          method === "post" &&
          url.endsWith("/procedures")
        ) {
          lostOnce = true;
          throw new TypeError("Synthetic committed response lost");
        }
        return new Response(
          response.status === 204 ? null : JSON.stringify(response.body),
          { status: response.status },
        );
      });
    };
    it.each(["ar", "fr"] as const)(
      "creates a plan, records its procedure, and voids it with retained history in %s",
      async (lang) => {
        const t = treatmentCopy[lang],
          p = procedureCopy[lang],
          user = userEvent.setup();
        const patient = await prisma.patient.create({
          data: {
            clinicId,
            name: `Patient ${lang}`,
            fileNumber: lang === "ar" ? 1n : 2n,
            phone: "+22220123456",
            gender: "male",
            isChild: true,
          },
        });
        const arrived = (
          await http("post", "/api/clinic/visits", {
            patientId: patient.id,
            doctorId,
          })
        ).body;
        const started = await http(
          "post",
          `/api/clinic/visits/${arrived.id}/start`,
          { editVersion: 1 },
        );
        expect(started.status).toBe(200);
        vi.stubGlobal("fetch", bridge());
        const view = renderPatient(
          <PatientTreatmentPlans
            patient={{
              id: patient.id,
              name: patient.name,
              fileNumber: patient.fileNumber.toString(),
              archived: false,
            }}
            lang={lang}
            canTreat
            onExpired={() => {}}
          />,
        );
        await user.click(
          await screen.findByRole("button", { name: t.newPlan }),
        );
        await user.type(
          screen.getByRole("textbox", { name: t.planName }),
          "Restoration",
        );
        await user.click(screen.getByRole("button", { name: t.save }));
        await user.click(
          await screen.findByRole("button", { name: t.addItem }),
        );
        await user.type(
          screen.getByRole("textbox", { name: t.description }),
          "Composite",
        );
        await user.type(
          screen.getByRole("textbox", { name: t.location }),
          "36",
        );
        await user.click(screen.getByRole("button", { name: t.save }));
        await screen.findByText("Composite");
        view.unmount();
        renderPatient(
          <VisitTreatments
            attendanceId={arrived.id}
            lang={lang}
            onExpired={() => {}}
          />,
        );
        await user.click(screen.getByRole("button", { name: p.title }));
        await user.click(await screen.findByRole("button", { name: p.record }));
        screen.getByRole("combobox", { name: p.choice }).focus();
        await user.keyboard("{ArrowDown}{End}{Enter}");
        expect(
          screen.getByRole("combobox", { name: p.choice }).textContent,
        ).toContain("Restoration · Composite · 36");
        await user.type(
          screen.getByRole("textbox", { name: t.notes }),
          "Actual care",
        );
        await user.click(screen.getByRole("button", { name: t.save }));
        await screen.findByRole("button", { name: p.void });
        const plans = (
          await http(
            "get",
            `/api/clinic/visits/patient/${patient.id}/treatment-plans`,
          )
        ).body.items;
        expect(plans[0]).toMatchObject({
          progress: { completed: 1, pending: 0, cancelled: 0 },
          items: [
            { procedure: { description: "Composite", notes: "Actual care" } },
          ],
        });
        await user.click(screen.getByRole("button", { name: p.void }));
        await user.type(
          screen.getByRole("textbox", { name: p.reason }),
          "Wrong record",
        );
        await user.click(screen.getByRole("button", { name: t.save }));
        await screen.findByText(p.voided);
        const result = (
          await http("get", `/api/clinic/visits/${arrived.id}/procedures`)
        ).body;
        expect(result.items).toMatchObject([
          {
            description: "Composite",
            voidReason: "Wrong record",
            voidActorId: doctorId,
          },
        ]);
        expect(result.plans[0].progress.pending).toBe(1);
        const current = (await http("get", `/api/clinic/visits/${arrived.id}`))
          .body;
        expect(
          (
            await http("post", `/api/clinic/visits/${arrived.id}/complete`, {
              editVersion: current.editVersion,
              visitVersion: current.visit.editVersion,
            })
          ).status,
        ).toBe(200);
      },
      15000,
    );
    it("does not resend a committed procedure when its response is lost", async () => {
      const patient = await prisma.patient.create({
        data: {
          clinicId,
          name: "Lost reply",
          fileNumber: 3n,
          phone: "+22220123456",
          gender: "male",
          isChild: true,
        },
      });
      const arrived = (
        await http("post", "/api/clinic/visits", {
          patientId: patient.id,
          doctorId,
        })
      ).body;
      await http("post", `/api/clinic/visits/${arrived.id}/start`, {
        editVersion: 1,
      });
      const fetcher = bridge(true);
      vi.stubGlobal("fetch", fetcher);
      const user = userEvent.setup(),
        t = treatmentCopy.fr,
        p = procedureCopy.fr;
      renderPatient(
        <VisitTreatments
          attendanceId={arrived.id}
          lang="fr"
          onExpired={() => {}}
        />,
      );
      await user.click(screen.getByRole("button", { name: p.title }));
      await user.click(await screen.findByRole("button", { name: p.record }));
      await user.type(
        screen.getByRole("textbox", { name: p.performed }),
        "Scaling",
      );
      await user.click(screen.getByRole("button", { name: t.save }));
      expect(await screen.findByText(t.uncertain)).toBeTruthy();
      await user.click(screen.getByRole("button", { name: t.refresh }));
      await waitFor(() =>
        expect(
          fetcher.mock.calls.filter(
            ([url, options]) =>
              options?.method === "POST" && url.endsWith("/procedures"),
          ),
        ).toHaveLength(1),
      );
      expect(
        (await http("get", `/api/clinic/visits/${arrived.id}/procedures`)).body
          .items,
      ).toMatchObject([{ description: "Scaling" }]);
    });
  },
);
