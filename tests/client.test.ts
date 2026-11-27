import { describe, expect, it, vi } from "vitest";
import { BudgetExhaustedError, createClient, type Budget } from "../src/lib/fhsc/client";

const budget = (cap = 300) => {
  let calls = 0;
  const warnings: string[] = [];
  const b: Budget = {
    reserve: async () => (calls < cap ? ++calls : null),
    record429: async () => {},
    warn: async (m) => void warnings.push(m),
  };
  return { b, warnings };
};
const ok = () => new Response(JSON.stringify({ error_code: "0", data: { n: 1 } }));

describe("FHSC client", () => {
  it("sends the key header and unwraps data", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const client = createClient({ apiKey: "k", budget: budget().b, fetchImpl, sleep: async () => {} });
    expect(await client.get("/market/indices")).toEqual({ n: 1 });
    expect((fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1].headers).toMatchObject({ "X-FH-APIKEY": "k" });
  });

  it("stops at the daily cap without calling the API", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const client = createClient({ apiKey: "k", budget: budget(1).b, fetchImpl, sleep: async () => {} });
    await client.get("/market/a");
    await expect(client.get("/market/b")).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("warns at 210 calls", async () => {
    const { b, warnings } = budget();
    const client = createClient({ apiKey: "k", budget: b, fetchImpl: async () => ok(), sleep: async () => {} });
    for (let i = 0; i < 211; i++) await client.get("/market/a");
    expect(warnings).toHaveLength(1);
  });

  it("waits and retries after a 429", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 5);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "X-RateLimit-Reset": reset } }))
      .mockResolvedValueOnce(ok());
    const sleeps: number[] = [];
    const client = createClient({ apiKey: "k", budget: budget().b, fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    expect(await client.get("/market/a")).toEqual({ n: 1 });
    expect(sleeps[0]).toBeGreaterThan(3000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
