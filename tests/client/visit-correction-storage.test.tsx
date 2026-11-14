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
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../../server/app";
import { PatientVisits } from "../../client/features/visits";
import { translations } from "../../client/shared/i18n";
import { renderPatient } from "./render-patient";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "correction UI through actual HTTP and isolated PostgreSQL",
  () => {
    let clinicId: string, actorId: string, doctorId: string, cookie: string;
    const prefix = `visit04-ui-${randomUUID()}`,
      origin = "http://localhost:5173";
    const http = (
      method: "get" | "post" | "patch" | "delete",
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
      process.env.JWT_SECRET = "synthetic-visits-tests-secret-32-characters";
      process.env.APP_ORIGIN = origin;
      const used = new Set(
        (await prisma.clinic.findMany()).map((row) => row.code),
      );
      const code = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      ).find((value) => !used.has(value))!;
      clinicId = (await prisma.clinic.create({ data: { name: prefix, code } }))
        .id;
      for (const key of ["admin", "dentist"]) {
        const role = await prisma.role.create({ data: { clinicId, key } });
        const user = await prisma.user.create({
          data: {
            clinicId,
            name: `UI ${key}`,
            username: `${prefix}-${key}`,
            passwordHash: "unused-synthetic-hash",
          },
        });
        await prisma.userRole.create({
          data: { clinicId, roleId: role.id, userId: user.id },
        });
        if (key === "admin") actorId = user.id;
        else doctorId = user.id;
      }
      cookie = `dentex_session=${jwt.sign({ kind: "clinic", version: 1 }, process.env.JWT_SECRET!, { subject: actorId, expiresIn: "1h" })}`;
    });
    afterEach(() => {
      cleanup();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      if (clinicId) {
        await prisma.appointmentVisitChange.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitPin.deleteMany({ where: { clinicId } });
        await prisma.appointmentVisitLink.deleteMany({ where: { clinicId } });
        await prisma.appointmentChange.deleteMany({ where: { clinicId } });
        await prisma.appointment.deleteMany({ where: { clinicId } });
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
    it.each(["ar", "fr"] as const)(
      "corrects and deletes only the false attendance across UI, HTTP and storage in %s",
      async (lang) => {
        const t = translations[lang].visits;
        const p = await prisma.patient.create({
          data: {
            clinicId,
            name: `${prefix}-${lang}`,
            fileNumber: lang === "ar" ? 1n : 2n,
            phone: "+22220123456",
            gender: "male",
            isChild: true,
          },
        });
        const arrived = await http("post", "/api/clinic/visits", {
          patientId: p.id,
          doctorId,
        });
        expect(arrived.status).toBe(201);
        const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
          const response = await http(
            (options?.method ?? "GET").toLowerCase() as
              "get" | "post" | "patch" | "delete",
            url,
            options?.body ? JSON.parse(String(options.body)) : undefined,
          );
          return new Response(
            response.status === 204 ? null : JSON.stringify(response.body),
            { status: response.status },
          );
        });
        vi.stubGlobal("fetch", fetcher);
        renderPatient(
          <PatientVisits
            patient={{
              id: p.id,
              name: p.name,
              fileNumber: p.fileNumber.toString(),
              archived: false,
            }}
            lang={lang}
            canRead
            onExpired={() => {
              throw Error("unexpected expired session");
            }}
          />,
        );
        const user = userEvent.setup();
        await user.click(
          await screen.findByRole("button", { name: t.correctStatus }),
        );
        const dialog = await screen.findByRole("dialog");
        await user.type(
          within(dialog).getByRole("textbox", { name: t.correctionReason }),
          `Correction ${lang}`,
        );
        await waitFor(() =>
          expect(
            (
              within(dialog).getByRole("button", {
                name: t.saveCorrection,
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(false),
        );
        await user.click(
          within(dialog).getByRole("button", { name: t.saveCorrection }),
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(await screen.findByText("UI admin")).toBeTruthy();
        const stored = await http(
          "get",
          `/api/clinic/visits/${arrived.body.id}`,
        );
        expect(stored.body).toMatchObject({
          status: "left_before_entry",
          corrections: [
            {
              reason: `Correction ${lang}`,
              actor: { id: actorId, name: "UI admin" },
              before: { status: "waiting" },
              after: { status: "left_before_entry" },
            },
          ],
        });
        await user.click(
          screen.getByRole("button", { name: t.deleteFalseAttendance }),
        );
        const confirm = await screen.findByRole("alertdialog");
        await waitFor(() =>
          expect(
            (
              within(confirm).getByRole("button", {
                name: t.confirmFalseDelete,
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(false),
        );
        await user.click(
          within(confirm).getByRole("button", { name: t.confirmFalseDelete }),
        );
        await waitFor(() =>
          expect(screen.queryByRole("alertdialog")).toBeNull(),
        );
        expect(
          (await http("get", `/api/clinic/visits/${arrived.body.id}`)).status,
        ).toBe(404);
        expect(
          (await http("get", `/api/clinic/visits/patient/${p.id}?page=1`)).body
            .items,
        ).toEqual([]);
        expect(
          fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
        ).toHaveLength(1);
        expect(
          fetcher.mock.calls.filter(([, o]) => o?.method === "DELETE"),
        ).toHaveLength(1);
      },
    );
  },
);
