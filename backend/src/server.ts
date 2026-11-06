import { bootstrap } from "./bootstrap.ts";
import { createApp } from "./app.ts";
const { service, origin, db } = await bootstrap();
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4310),
  demo = process.env.DEMO_MODE !== "false" && service.provider.name === "mock";
if (
  host !== "127.0.0.1" &&
  host !== "localhost" &&
  !process.env.DEMO_ACCESS_KEY
)
  throw Error(
    "Set DEMO_ACCESS_KEY before exposing the sandbox beyond loopback.",
  );
const app = createApp(service, {
  origin,
  demo,
  accessKey: process.env.DEMO_ACCESS_KEY,
  paystackKey: process.env.PAYSTACK_SECRET_KEY,
  webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
  signatureMode:
    process.env.PAYSTACK_SIGNATURE_MODE === "legacy" ? "legacy" : "timestamped",
});
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    for (let i = 0; i < 10 && (await service.tick()); i++) {}
  } catch (e) {
    console.error(
      "Worker unavailable",
      e instanceof Error ? e.name : "unknown",
    );
  } finally {
    busy = false;
  }
}, 500);
const server = app.listen(port, host, () =>
  console.log(
    `Groundwork sandbox: ${origin}\nStorage: ${db.kind}\nProvider: ${service.provider.name} (no live payments)\nUse Ctrl+C to stop.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(async () => {
      while (busy) await new Promise((r) => setTimeout(r, 20));
      await db.close();
      process.exit(0);
    });
  });
