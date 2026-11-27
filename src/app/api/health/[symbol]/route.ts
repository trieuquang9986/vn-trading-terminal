import { requestTicker } from "../../../../jobs/onDemandTicker";
import { parseSymbol, respond } from "../../../../lib/api";
import { getHealth } from "../../../../lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = parseSymbol((await params).symbol);
  if (!symbol) return Response.json({ error: "Invalid ticker." }, { status: 400 });
  // A ticker without data is queued for the background crawler; FHSC is never called here.
  return respond(async () => {
    const health = await getHealth(symbol);
    return { ...health, request: health.hasData ? null : await requestTicker(symbol) };
  }, 60);
}
