import { indexParam, parseSymbol, respond } from "../../../lib/api";
import { getForeignFlow } from "../../../lib/queries";

export const dynamic = "force-dynamic";
export const GET = (req: Request) =>
  respond(() => getForeignFlow(indexParam(req.url), parseSymbol(new URL(req.url).searchParams.get("symbol"))));
