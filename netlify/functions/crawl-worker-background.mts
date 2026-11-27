/** Background function (15 min limit). Rejects anyone without the shared secret. */
import { drain } from "../../src/jobs/runner";

export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return;
  console.log(await drain({ maxCalls: 100 }));
};
