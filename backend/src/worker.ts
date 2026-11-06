import { bootstrap } from "./bootstrap.ts";
if (!process.env.DATABASE_URL?.startsWith("postgres"))
  throw Error(
    "A separate worker requires DATABASE_URL for PostgreSQL. Embedded mode runs its worker inside the API process.",
  );
const { service, db } = await bootstrap();
let stop = false;
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, () => {
    stop = true;
  });
while (!stop) {
  await service.tick();
  await new Promise((r) => setTimeout(r, 500));
}
await db.close();
