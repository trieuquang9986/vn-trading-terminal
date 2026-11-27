import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return (await client.query(text, params)) as T[];
}

const IDENT = /^[a-z_0-9]+$/;

/** Idempotent multi-row upsert. Table and column names come from code only. */
export async function upsert(table: string, keys: string[], rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  if (![table, ...cols, ...keys].every((n) => IDENT.test(n))) throw new Error("Bad identifier");
  const updates = cols.filter((c) => !keys.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  const conflict = updates.length ? `DO UPDATE SET ${updates.join(", ")}` : "DO NOTHING";
  // Postgres rejects duplicate keys inside one INSERT, so keep the last occurrence.
  const unique = [...new Map(rows.map((r) => [keys.map((k) => r[k]).join("|"), r])).values()];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${cols.map((c) => `$${params.push(r[c] ?? null)}`).join(",")})`);
    await query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${values.join(",")} ON CONFLICT (${keys.join(",")}) ${conflict}`,
      params,
    );
  }
}

export async function logWarning(message: string) {
  console.warn(`\x1b[38;5;208m[warn]\x1b[0m ${message}`);
  await query(
    `INSERT INTO crawl_log (day, kind, message) VALUES ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'warning', $1)`,
    [message.slice(0, 1000)],
  );
}
