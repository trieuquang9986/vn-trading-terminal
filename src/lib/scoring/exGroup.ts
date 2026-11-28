import type { IndexCode } from "../fhsc/endpoints";
import { pointContributions, type Member } from "./indexImpact";

/** Vingroup stocks on HOSE. VPL is not a VN30 member, so only three drop out there. */
export const VIN_GROUP = ["VIC", "VHM", "VPL", "VRE"];

/**
 * One session of an index rebuilt without some members: the remaining stocks' daily moves,
 * weighted by their own prior-session weights (remove and reweight, not point subtraction).
 * Points are expressed on the official index's previous close.
 */
export function exGroup(
  index: IndexCode, prevIndexValue: number, today: Member[], excluded: string[], previous?: Member[],
) {
  const out = new Set(excluded);
  const found = today.filter((m) => out.has(m.symbol));
  const { points, weights, missing } = pointContributions(index, prevIndexValue, today, previous);
  // A member of the group with no move or weight would silently stay in the figure.
  if (!found.length || found.some((m) => m.changePercent == null || missing.includes(m.symbol))) return null;

  let groupWeight = 0;
  let groupPoints = 0;
  let restWeight = 0;
  let restPoints = 0;
  for (const m of today) {
    const weight = weights.get(m.symbol) ?? 0;
    if (out.has(m.symbol)) {
      groupWeight += weight;
      groupPoints += points.get(m.symbol) ?? 0;
    } else {
      restWeight += weight;
      restPoints += points.get(m.symbol) ?? 0;
    }
  }
  if (!restWeight || !prevIndexValue) return null;
  return {
    excluded: found.map((m) => m.symbol).sort(),
    groupWeight,
    groupPoints,
    changePercent: (restPoints / prevIndexValue / restWeight) * 100,
    points: restPoints / restWeight,
    /** What each remaining stock contributes to the rebuilt index. */
    contributions: new Map(today.filter((m) => !out.has(m.symbol)).map((m) => [m.symbol, (points.get(m.symbol) ?? 0) / restWeight])),
  };
}
