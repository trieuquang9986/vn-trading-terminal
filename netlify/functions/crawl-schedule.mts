/** Cheap tick: plan the queue, and wake the background worker only when there is work. */
import type { Config } from "@netlify/functions";
import { hasWork, plan } from "../../src/jobs/runner";

export default async () => {
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!process.env.FINHAY_API_KEY || !secret || !site) {
    console.warn("Crawler idle: set FINHAY_API_KEY and CRON_SECRET in Netlify environment variables.");
    return;
  }
  await plan();
  if (!(await hasWork())) return;
  const res = await fetch(`${site}/.netlify/functions/crawl-worker-background`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  console.log(`Worker triggered: ${res.status}`);
};

// Every 15 minutes, 08:00-21:45 ICT (01:00-14:45 UTC).
export const config: Config = { schedule: "*/15 1-14 * * *" };
