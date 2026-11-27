import { describe, expect, it } from "vitest";
import { treemap } from "../src/components/terminal/treemap";
import { vndFactor } from "../src/lib/fhsc/units";
import { faScorecard, totalHealth, type FaMetrics } from "../src/lib/scoring/faScore";
import { capWeights, freeFloatBucket, pointContributions } from "../src/lib/scoring/indexImpact";
import { maxDrawdown, obv, periodReturn } from "../src/lib/scoring/series";
import { obvScore, spreadScore, taScorecard, volumeScore } from "../src/lib/scoring/taScore";
import { expectedSessionDate } from "../src/lib/time";

describe("series", () => {
  it("computes OBV, returns and drawdown", () => {
    expect(obv([10, 11, 11, 9], [5, 7, 3, 4])).toEqual([0, 7, 7, 3]);
    expect(periodReturn([100, 110], 1)).toBeCloseTo(0.1);
    expect(periodReturn([100], 1)).toBeNull();
    expect(maxDrawdown([100, 120, 90, 130], 3)).toBeCloseTo(-0.25);
  });
});

describe("TA bands", () => {
  it("matches the spec at the edges", () => {
    expect([0.05, 0.02, 0.01, 0, -0.02, -0.05, -0.06].map(spreadScore)).toEqual([100, 80, 65, 50, 35, 20, 0]);
    expect([3, 1.5, 0.1, 0, -1.5, -3].map(obvScore)).toEqual([100, 80, 65, 50, 20, 0]);
    expect(volumeScore(2.5, 0.01)).toBe(100);
    expect(volumeScore(2.5, -0.01)).toBe(40);
  });
  it("reports coverage when history is short", () => {
    const card = taScorecard({
      closes: [1, 2, 3, 4, 5, 6], volumes: [1, 1, 1, 1, 1, 1], vniCloses: [1, 1, 1, 1, 1, 1],
      technicals: { close: null, sma20: null, sma50: null, volumeSma20: null, volume: null },
    });
    expect(card.coverage).toBe(30);
  });
});

describe("FA", () => {
  it("re-normalises over available fields and never fakes a total", () => {
    const fa = faScorecard({ roe: 0.25 } as FaMetrics);
    expect(fa.metrics).toHaveLength(13);
    expect(fa.metrics.reduce((s, m) => s + m.weight, 0)).toBe(90);
    const empty = faScorecard({} as FaMetrics);
    expect(totalHealth(empty, empty)).toEqual({ score: null, partial: true });
  });
});

describe("index impact", () => {
  it("buckets free float and caps weights at 10%", () => {
    expect(freeFloatBucket(41)).toBe(0.45);
    expect(freeFloatBucket(45)).toBe(0.45);
    const weights = capWeights([50, ...Array(20).fill(1)]);
    expect(weights[0]).toBeCloseTo(0.1);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1);
  });
  it("splits an index move across members", () => {
    const { points } = pointContributions("VNINDEX", 1000, [
      { symbol: "A", price: 102, changePercent: 2, marketCap: 102 },
      { symbol: "B", price: 99, changePercent: -1, marketCap: 99 },
    ]);
    expect(points.get("A")! + points.get("B")!).toBeCloseTo(5);
  });
});

describe("units, time, treemap", () => {
  it("detects thousand-VND prices", () => {
    expect(vndFactor(25.4, 25400)).toBe(1000);
    expect(vndFactor(25400, 25400)).toBe(1);
  });
  it("rolls weekends back to Friday", () => {
    expect(expectedSessionDate(new Date("2026-11-29T05:00:00Z"))).toBe("2026-11-27");
    expect(expectedSessionDate(new Date("2026-11-27T01:00:00Z"))).toBe("2026-11-26");
  });
  it("fills the box in proportion to value", () => {
    const rects = treemap([6, 3, 1], (v) => v, { x: 0, y: 0, w: 100, h: 100 });
    expect(rects.map((r) => Math.round(r.w * r.h))).toEqual([6000, 3000, 1000]);
  });
});
