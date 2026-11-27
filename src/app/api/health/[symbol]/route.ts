import { requestTicker } from "../../../../jobs/onDemandTicker";
import { parseSymbol, respond } from "../../../../lib/api";
import { getHealth } from "../../../../lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = parseSymbol((await params).symbol);
  if (!symbol) return Response.json({ error: "Mã chứng khoán không hợp lệ." }, { status: 400 });
  // A ticker with missing data is moved up the queue for the background crawler; FHSC is never called here.
  return respond(async () => {
    const health = await getHealth(symbol);
    return { ...health, request: health.hasData && health.fa.coverage > 0 ? null : await requestTicker(symbol) };
  }, 60);
}
