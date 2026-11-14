import { afterEach, it, expect, vi } from "vitest";
import { startVisitsMaintenance } from "../server/infrastructure/visits-maintenance";
afterEach(() => vi.useRealTimers());
it("runs at startup and every minute, excludes overlap, reports failure and stops only after inflight work", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  let runs = 0;
  const errors: unknown[] = [];
  const failure = new Error("synthetic maintenance failure");
  const worker = startVisitsMaintenance(
    {
      async maintain() {
        runs++;
        if (runs === 1) await first;
        if (runs === 2) throw failure;
      },
    },
    (error) => errors.push(error),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(runs).toBe(1);
  await vi.advanceTimersByTimeAsync(180000);
  expect(runs).toBe(1);
  release();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(60000);
  expect(runs).toBe(2);
  expect(errors).toEqual([failure]);
  await vi.advanceTimersByTimeAsync(60000);
  expect(runs).toBe(3);
  await worker.stop();
  await vi.advanceTimersByTimeAsync(180000);
  expect(runs).toBe(3);
  expect(vi.getTimerCount()).toBe(0);

  let finish!: () => void,
    stopped = false;
  const pending = startVisitsMaintenance({
    maintain: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  await vi.advanceTimersByTimeAsync(0);
  const stopping = pending.stop().then(() => {
    stopped = true;
  });
  await vi.advanceTimersByTimeAsync(180000);
  expect(stopped).toBe(false);
  finish();
  await stopping;
  expect(stopped).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("importing the real app does not start background maintenance", async () => {
  // Timer creation is the external resource observed; app is not mocked.
  const interval = vi.spyOn(globalThis, "setInterval");
  const { prisma } = await import("../server/app");
  // express-rate-limit already has its own 15-minute cleanup timer.
  expect(interval.mock.calls.filter(([, delay]) => delay === 60000)).toEqual(
    [],
  );
  await prisma.$disconnect();
  interval.mockRestore();
});
