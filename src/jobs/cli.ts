/** Shared entry for the `npm run job:*` scripts. Loads .env.local / .env if present. */
import { enqueueSeed } from "./handlers";
import { drain, plan, type RunOptions } from "./runner";

export async function main(options: RunOptions & { planFirst?: boolean }) {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* file is optional */
    }
  }
  if (options.planFirst) await plan();
  else await enqueueSeed();
  console.log(await drain(options));
}
