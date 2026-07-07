import type { Handler } from "@netlify/functions";

const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY ?? "test";

// Map zone names to Guardian search terms that return good results
const ZONE_SEARCH_MAP: Record<string, string> = {
  "Ukraine-Russia Front": "Ukraine Russia war front military",
  "Crimea": "Crimea Russia Ukraine Black Sea",
  "Kaliningrad Oblast": "Kaliningrad Russia NATO Baltic",
  "Suwalki Corridor": "Suwalki corridor NATO Poland Lithuania",
  "Belarus-Poland Border": "Belarus Poland border hybrid migration",
  "Black Sea / Grain Corridor": "Black Sea Ukraine Russia grain corridor",
  "Narva / Estonia-Russia Border": "Narva Estonia Russia border Baltic",
  "NATO HQ": "NATO headquarters Brussels eastern flank",
  "SHAPE (Allied Command Ops)": "NATO SHAPE Allied Command military",
  "Ramstein Air Base": "Ramstein NATO Ukraine military aid",
  "NATO CCDCOE — Tallinn": "Estonia Tallinn NATO cyber defence",
};

export const handler: Handler = async (event) => {
  const keyword = event.queryStringParameters?.keyword ?? "";
  if (!keyword) {
    return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
  }

  // Use a mapped search term if available, otherwise use the keyword directly
  const searchTerm = ZONE_SEARCH_MAP[keyword] ?? keyword;

  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("q", searchTerm);
  url.searchParams.set("section", "world");
  url.searchParams.set("order-by", "newest");
  url.searchParams.set("page-size", "8");
  url.searchParams.set("api-key", GUARDIAN_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch (err: any) {
    console.error("Guardian events error:", err?.message);
    return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.error("Guardian events HTTP error:", response.status);
    return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
  }

  const data = await response.json();
  const results: any[] = data?.response?.results ?? [];

  const articles = results.map((a: any) => ({
    title: a.webTitle,
    url: a.webUrl,
    source: "The Guardian",
    date: a.webPublicationDate,
  }));

  return {
    statusCode: 200,
    headers: { "Cache-Control": "public, max-age=600" },
    body: JSON.stringify({ articles }),
  };
};
