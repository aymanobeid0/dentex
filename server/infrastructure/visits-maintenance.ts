import type { VisitsMaintenance } from "../modules/visits";

/** Server lifecycle only: importing the app never starts this worker. */
export function startVisitsMaintenance(
  visits: VisitsMaintenance,
  report: (error: unknown) => void = (error) =>
    console.error("Visits day-close maintenance failed", error),
) {
  let stopped = false;
  let inFlight: Promise<void> | undefined;
  function tick() {
    if (stopped || inFlight) return;
    inFlight = Promise.resolve()
      .then(() => visits.maintain())
      .catch(report)
      .finally(() => {
        inFlight = undefined;
      });
  }
  const timer = setInterval(tick, 60000);
  tick();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
