/** FHSC mixes VND (constituents) and thousand VND (technicals). */

/** Returns 1 or 1000: the factor that turns `value` into VND, judged against a known VND price. */
export function vndFactor(value: number, referenceVnd: number): 1 | 1000 | null {
  if (!(value > 0) || !(referenceVnd > 0)) return null;
  const ratio = referenceVnd / value;
  if (ratio > 0.5 && ratio < 2) return 1;
  if (ratio > 500 && ratio < 2000) return 1000;
  return null;
}
