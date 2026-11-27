import { requestTicker } from "../../../jobs/onDemandTicker";
import { indexParam, parseSymbol, respond } from "../../../lib/api";
import { getForeignFlow } from "../../../lib/queries";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => {
  const symbol = parseSymbol(new URL(req.url).searchParams.get("symbol"));
  return respond(async () => {
    const flow = await getForeignFlow(indexParam(req.url), symbol);
    // A ticker with no data yet is moved up the crawl queue; FHSC is never called here.
    return { ...flow, request: symbol && !flow.stockAsOf ? await requestTicker(symbol) : null };
  });
};
