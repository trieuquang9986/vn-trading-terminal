import { indexParam, respond } from "../../../lib/api";
import { getMovers } from "../../../lib/queries";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => {
  const n = Number(new URL(req.url).searchParams.get("sessions"));
  return respond(() => getMovers(indexParam(req.url), n === 5 || n === 21 ? n : 1));
};
