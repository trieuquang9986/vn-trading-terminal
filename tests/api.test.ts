import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/db", () => ({ hasDb: () => true }));
import { respond } from "../src/lib/api";

describe("API caching", () => {
  it("keys the CDN cache on the query string", async () => {
    const res = await respond(async () => ({}));
    expect(res.headers.get("Netlify-Vary")).toBe("query");
  });
});
