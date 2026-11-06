import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
export type Row = Record<string, any>;
export interface SQL {
  query<T extends Row = Row>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
export interface DB extends SQL {
  tx<T>(fn: (sql: SQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: string;
}
export async function openDB(url?: string): Promise<DB> {
  if (url?.startsWith("postgres")) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      kind: "PostgreSQL",
      query: async (s, p) => (await pool.query(s, p)) as any,
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const result = await fn(c);
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (url && url !== "memory://")
    await mkdir(dirname(resolve(url)), { recursive: true });
  const p = new PGlite(url || "memory://");
  let tail: Promise<unknown> = Promise.resolve();
  // Every embedded operation shares one lane so reads cannot enter another request's transaction.
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = tail.then(fn, fn);
    tail = r.catch(() => {});
    return r;
  };
  return {
    kind: "PGlite · embedded PostgreSQL",
    query: (s, v) => run(() => p.query(s, v)) as any,
    tx: (fn) => run(() => p.transaction((t) => fn(t as SQL))),
    close: () => run(() => p.close()),
  };
}
export async function migrate(db: DB) {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await db.tx(async (q) => {
    for (const s of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await q.query(s);
  });
}
export async function one(q: SQL, s: string, p: any[] = []) {
  return (await q.query(s, p)).rows[0];
}
