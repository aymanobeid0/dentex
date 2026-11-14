import "dotenv/config";
import { app, prisma, visitsMaintenance } from "./app";
import { startVisitsMaintenance } from "./infrastructure/visits-maintenance";
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  !process.env.APP_ORIGIN
)
  throw new Error("Configure JWT_SECRET and APP_ORIGIN before starting");
let worker: ReturnType<typeof startVisitsMaintenance> | undefined;
let shutdown: Promise<void> | undefined;
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () => {
    console.log("Dentex API listening");
    if (!shutdown) worker = startVisitsMaintenance(visitsMaintenance);
  },
);
function stop() {
  shutdown ??= (async () => {
    const closed = new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await worker?.stop();
    await closed;
    await prisma.$disconnect();
  })();
  void shutdown.catch((error) => {
    console.error("Dentex API shutdown failed", error);
    process.exitCode = 1;
  });
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
