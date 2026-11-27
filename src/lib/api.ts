/** Shared wrapper for the read-only API routes. */
import { hasDb } from "./db";

export async function respond(load: () => Promise<unknown>, maxAge = 300) {
  if (!hasDb()) return Response.json({ error: "Cơ sở dữ liệu chưa được cấu hình." }, { status: 503 });
  try {
    return Response.json(await load(), {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=60`,
        // Netlify's Next.js runtime otherwise leaves the query out of the cache key,
        // so ?index= and ?symbol= variants would be served each other's responses.
        "Netlify-Vary": "query",
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Không thể đọc dữ liệu thị trường." }, { status: 500 });
  }
}

export const indexParam = (url: string) => (new URL(url).searchParams.get("index") === "VN30" ? "VN30" : "VNINDEX");

export const parseSymbol = (value: string | null | undefined) => {
  const s = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{3}$/.test(s) ? s : null;
};
