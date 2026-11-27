/** All market dates are Asia/Ho_Chi_Minh (UTC+7, no DST). */
const ICT_MS = 7 * 3600 * 1000;

export function ictParts(d: Date = new Date()) {
  const s = new Date(d.getTime() + ICT_MS);
  return { date: s.toISOString().slice(0, 10), hour: s.getUTCHours(), weekday: s.getUTCDay() };
}

export const unixToIctDate = (t: number) => ictParts(new Date(t * 1000)).date;

/** Unix seconds at 00:00 ICT for a YYYY-MM-DD date. */
export const ictDateToUnix = (date: string) => (Date.parse(`${date}T00:00:00Z`) - ICT_MS) / 1000;

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

/** Most recent weekday whose close (15:00 ICT) has passed. Holidays are detected later from S1. */
export function expectedSessionDate(now: Date = new Date()) {
  const { date, hour } = ictParts(now);
  let d = hour >= 15 ? date : addDays(date, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}
