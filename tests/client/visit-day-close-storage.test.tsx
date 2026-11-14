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
  "day-close UI through real HTTP and isolated storage",
  () => {
    const prefix = `visits05-ui-${randomUUID()}`,
      origin = "http://localhost:5173";
    let clinicId: string, actorId: string, doctorId: string;
    const http = (
      method: "get" | "post" | "patch",
      path: string,
      body?: object,
    ) =>
      request(app)
        [method](path)
        .set(
          "Cookie",
          `dentex_session=${jwt.sign({ kind: "clinic", version: 1 }, process.env.JWT_SECRET!, { subject: actorId, expiresIn: "1h" })}`,
        )
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
      process.env.JWT_SECRET = "synthetic-visits05-ui-secret-at-least-32";
      process.env.APP_ORIGIN = origin;
      const used = new Set((await prisma.clinic.findMany()).map((x) => x.code));
      const code = Array.from({ length: 10000 }, (_, i) =>
        String(i).padStart(4, "0"),
      ).find((x) => !used.has(x))!;
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
          data: { clinicId, userId: user.id, roleId: role.id },
        });
        if (key === "admin") actorId = user.id;
        else doctorId = user.id;
      }
    });
    afterEach(() => {
      cleanup();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      if (clinicId) {
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
      "loads automatic closure and explicitly confirms its outcome while retaining original times in %s",
      async (lang) => {
        const t = translations[lang].visits;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-11-13T23:50:00.000Z"));
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
        const entered = await http(
          "post",
          `/api/clinic/visits/${arrived.body.id}/start`,
          { editVersion: 1 },
        );
        expect(entered.status).toBe(200);
        vi.setSystemTime(new Date("2026-11-16T08:15:00.000Z"));
        const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
          const r = await http(
            (options?.method ?? "GET").toLowerCase() as
              "get" | "post" | "patch",
            url,
            options?.body ? JSON.parse(String(options.body)) : undefined,
          );
          return new Response(JSON.stringify(r.body), { status: r.status });
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
        expect(
          await screen.findByText(t.attendanceStatuses.auto_closed),
        ).toBeTruthy();
        expect(screen.getByText(t.autoClosureReason)).toBeTruthy();
        expect(screen.queryByText(new RegExp(t.endRecorded))).toBeNull();
        const closed = await http(
          "get",
          `/api/clinic/visits/${arrived.body.id}`,
        );
        expect(closed.body).toMatchObject({
          status: "auto_closed",
          recordedEndAt: null,
          autoClosure: {
            effectiveClosedAt: "2026-11-14T00:00:00.000Z",
            recordedAt: "2026-11-16T08:15:00.000Z",
          },
          visit: {
            startedAt: entered.body.visit.startedAt,
            recordedEndAt: null,
          },
        });
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: t.correctStatus }));
        const dialog = await screen.findByRole("dialog");
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
        expect(await screen.findByText(t.completed)).toBeTruthy();
        expect(screen.getByText(t.autoClosureReason)).toBeTruthy();
        const corrected = await http(
          "get",
          `/api/clinic/visits/${arrived.body.id}`,
        );
        expect(corrected.body).toMatchObject({
          status: "completed",
          arrivedAt: arrived.body.arrivedAt,
          recordedEndAt: "2026-11-16T08:15:00.000Z",
          autoClosure: closed.body.autoClosure,
          corrections: [
            {
              before: { status: "auto_closed", recordedEndAt: null },
              after: {
                status: "completed",
                recordedEndAt: "2026-11-16T08:15:00.000Z",
              },
            },
          ],
        });
        expect(
          fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
        ).toHaveLength(1);
      },
    );
  },
);
