import { openDB, migrate } from "./db.ts";
import { Service } from "./service.ts";
import {
  MockProvider,
  PaystackProvider,
  MockPos,
  UnconfiguredPos,
} from "./providers.ts";
export async function bootstrap() {
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:4310";
  const database =
    process.env.DATABASE_URL || process.env.DATA_DIR || ".data/groundwork";
  const db = await openDB(database);
  await migrate(db);
  const name = process.env.PAYMENT_PROVIDER || "mock";
  if (!["mock", "paystack"].includes(name))
    throw Error("Unsupported payment provider");
  const provider =
    name === "paystack"
      ? new PaystackProvider(process.env.PAYSTACK_SECRET_KEY || "", origin)
      : new MockProvider(db);
  const posName = process.env.POS_PROVIDER || "mock";
  if (!["mock", "pilot", "gaap"].includes(posName))
    throw Error("Unsupported POS provider");
  const pos =
    posName === "mock"
      ? new MockPos(db)
      : new UnconfiguredPos(posName as "pilot" | "gaap");
  const service = new Service(db, provider, pos);
  await service.seed();
  return { service, origin, db };
}
