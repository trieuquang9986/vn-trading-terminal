import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);

/** Runtime (not type-only) relative imports. */
function imports(file: string) {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.[^"']+)["']/gms)]
    .map((m) => resolve(dirname(file), m[1]))
    .map((base) => [`${base}.ts`, `${base}.tsx`].find(existsSync))
    .filter((f): f is string => Boolean(f));
}

describe("FHSC boundary", () => {
  it("is unreachable from pages, components and API routes", () => {
    const seen = new Set<string>();
    const stack = [...files(resolve("src/app")), ...files(resolve("src/components"))];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      stack.push(...imports(file));
    }
    const reached = [...seen];
    expect(reached.some((f) => f.endsWith("lib/queries.ts"))).toBe(true);
    expect(reached.filter((f) => /fhsc\/client|jobs\/(handlers|runner)/.test(f))).toEqual([]);
  });
});
