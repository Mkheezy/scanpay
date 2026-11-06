import { createHash, randomBytes, randomUUID } from "node:crypto";
export const id = () => randomUUID();
export const token = () => randomBytes(24).toString("base64url");
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(
  ok: unknown,
  code: string,
  message: string,
  status = 409,
): asserts ok {
  if (!ok) throw new AppError(status, code, message);
}
export function split(cents: number, people: number) {
  requireThat(
    Number.isSafeInteger(cents) &&
      cents >= 0 &&
      Number.isInteger(people) &&
      people >= 2 &&
      people <= 12,
    "INVALID_SPLIT",
    "Choose 2–12 people.",
    400,
  );
  const floor = Math.floor(cents / people);
  return Array.from(
    { length: people },
    (_, i) => floor + (i < cents % people ? 1 : 0),
  );
}
export function quote(
  balance: number,
  mode: string,
  amount: number | undefined,
  people: number | undefined,
  tipPercent: number,
) {
  const principal =
    mode === "equal"
      ? split(balance, people || 2)[0]
      : mode === "custom"
        ? amount!
        : balance;
  requireThat(
    Number.isSafeInteger(principal) && principal > 0 && principal <= balance,
    "AMOUNT_UNAVAILABLE",
    "This amount is no longer available. Refresh the bill.",
    409,
  );
  requireThat(
    [0, 10, 12, 15].includes(tipPercent),
    "INVALID_TIP",
    "Choose an available tip.",
    400,
  );
  const tip = Math.round((principal * tipPercent) / 100);
  return { amount: principal, tip, total: principal + tip };
}
