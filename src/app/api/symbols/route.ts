import { respond } from "../../../lib/api";
import { getSymbols } from "../../../lib/queries";

export const dynamic = "force-dynamic";
export const GET = () => respond(getSymbols);
