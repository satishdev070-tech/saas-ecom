import pg from "pg";

/**
 * Test helpers that execute SQL exactly as PostgREST would for a given caller:
 * `set local role` + `request.jwt.claims`, inside a transaction that is always rolled back.
 */
export const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:54329/postgres";

export const USERS = {
  aanganOwner: "00000000-0000-4000-a000-000000000001",
  aanganStaff: "00000000-0000-4000-a000-000000000002",
  rangrezOwner: "00000000-0000-4000-a000-000000000003",
  shopper: "00000000-0000-4000-a000-000000000004",
  platformAdmin: "00000000-0000-4000-a000-000000000005",
} as const;

export const TENANTS = {
  aangan: "10000000-0000-4000-a000-00000000000a",
  rangrez: "10000000-0000-4000-a000-00000000000b",
} as const;

export const PRODUCTS = {
  aanganKurta: "32000000-0000-4000-a000-000000000001",
  aanganDraft: "32000000-0000-4000-a000-000000000006",
  rangrezDress: "32000000-0000-4000-a000-0000000000b1",
} as const;

export type Caller = { role: "anon" } | { role: "authenticated"; userId: string } | { role: "service_role" } | { role: "postgres" };

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

export async function closePool() {
  await pool.end();
}

type Q = <T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Runs fn as the caller inside a transaction that is rolled back afterwards. */
export async function as<T>(caller: Caller, fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (caller.role !== "postgres") {
      const claims = caller.role === "authenticated" ? { sub: caller.userId, role: "authenticated" } : { role: caller.role };
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await client.query(`set local role ${caller.role}`);
    }
    // Each statement runs in a savepoint so an expected error doesn't abort the whole test transaction.
    let n = 0;
    const q: Q = async (sql, params) => {
      const sp = `sp${n++}`;
      await client.query(`savepoint ${sp}`);
      try {
        const rows = (await client.query(sql, params)).rows;
        await client.query(`release savepoint ${sp}`);
        return rows;
      } catch (e) {
        await client.query(`rollback to savepoint ${sp}`);
        throw e;
      }
    };
    return await fn(q);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

export const anon: Caller = { role: "anon" };
export const service: Caller = { role: "service_role" };
export const superuser: Caller = { role: "postgres" };
export const user = (userId: string): Caller => ({ role: "authenticated", userId });

/** Expects the promise to reject with a Postgres error whose message matches. */
export async function rejects(p: Promise<unknown>, pattern: RegExp) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (!pattern.test(msg)) throw new Error(`Expected error matching ${pattern}, got: ${msg}`);
    return;
  }
  throw new Error(`Expected rejection matching ${pattern}, but it succeeded`);
}

/** First row or throw (keeps tests strict under noUncheckedIndexedAccess). */
export function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected at least one row");
  return row;
}
