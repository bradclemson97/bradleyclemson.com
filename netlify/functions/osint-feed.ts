import type { Handler } from "@netlify/functions";

// GDELT query targeting NATO eastern flank events
const EASTERN_FLANK_QUERY =
  "(Ukraine OR Russia OR Estonia OR Latvia OR Lithuania OR Poland OR Belarus OR Baltic OR Kaliningrad OR NATO) " +
  "(military OR conflict OR attack OR missile OR drone OR cyber OR troops OR invasion OR war OR sanction OR hybrid OR defense OR NATO OR troops OR threat OR shelling OR artillery OR mobiliz)";

function parseGdeltDate(seenDate?: string): Date | null {
  if (!seenDate) return null;
  const s = seenDate.replace(/[TZ]/g, "");
  if (s.length < 8) return null;
  const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
  const h = s.slice(8, 10) || "00", min = s.slice(10, 12) || "00";
  return new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
}

export const handler: Handler = async () => {
  try {
    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      `?query=${encodeURIComponent(EASTERN_FLANK_QUERY)}` +
      "&timespan=24h" +
      "&maxrecords=30" +
      "&format=json" +
      "&translation=auto";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "SituationRoom/1.0", Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err: any) {
      console.error("GDELT OSINT network error:", err?.message);
      return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("GDELT OSINT HTTP error:", response.status);
      return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
    }

    const rawArticles: any[] = data.articles ?? [];

    const articles = rawArticles.slice(0, 30).map((a: any) => {
      const title: string = a.title ?? "";
      let status: "red" | "amber" | "green" = "green";

      if (/(war|conflict|attack|bomb|missile|invasion|fighting|shelling|killed|casualties|airstrike|explosion|strike)/i.test(title)) {
        status = "red";
      } else if (/(tension|cyber|sanction|hybrid|threat|deploy|exercise|reinfor|mobiliz|provoc|intercept|violat)/i.test(title)) {
        status = "amber";
      }

      const date = parseGdeltDate(a.seendate);

      return {
        title: a.title,
        url: a.url,
        source: a.domain ?? a.source,
        date: date ? date.toISOString() : undefined,
        status,
      };
    });

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=120" },
      body: JSON.stringify({ articles }),
    };
  } catch (err) {
    console.error("OSINT feed error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to fetch OSINT feed" }) };
  }
};
