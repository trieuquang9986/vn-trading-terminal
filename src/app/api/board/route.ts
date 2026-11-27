import { indexParam, respond } from "../../../lib/api";
import { getBoard } from "../../../lib/queries";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => respond(() => getBoard(indexParam(req.url)));
