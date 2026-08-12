import type { Handler } from "@netlify/functions";

const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY ?? "test";

const QUERY =
  "(Ukraine OR Russia OR NATO OR Estonia OR Latvia OR Lithuania OR Poland OR Belarus OR Baltic OR Kaliningrad) AND (military OR conflict OR attack OR missile OR drone OR cyber OR troops OR war OR sanctions OR hybrid OR defense OR threat OR invasion)";

const ZONE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Ukraine–Russia Front", re: /ukraine|donetsk|zaporizhzhia|kherson|kharkiv|mariupol|bakhmut/i },
  { name: "Russia", re: /russia|kremlin|putin|moscow/i },
  { name: "Baltic States", re: /estonia|latvia|lithuania|baltic/i },
  { name: "Poland", re: /poland|polish/i },
  { name: "Belarus", re: /belarus|lukashenko/i },
  { name: "Black Sea", re: /black sea|grain corridor/i },
  { name: "Crimea", re: /crimea|sevastopol/i },
  { name: "Kaliningrad", re: /kaliningrad/i },
];

function classifyStatus(title: string): "red" | "amber" | "green" {
  if (/(war|conflict|attack|bomb|missile|invasion|fighting|shelling|killed|casualties|airstrike|explosion|strike|offensive)/i.test(title))
    return "red";
  if (/(tension|cyber|sanction|hybrid|threat|deploy|exercise|reinfor|mobiliz|provoc|intercept|NATO|drills?)/i.test(title))
    return "amber";
  return "green";
}

export const handler: Handler = async (event) => {
  const days = Math.min(30, Math.max(7, parseInt(event.queryStringParameters?.days ?? "14", 10)));
  const fromDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("q", QUERY);
  url.searchParams.set("section", "world");
  url.searchParams.set("show-fields", "trailText");
  url.searchParams.set("order-by", "newest");
  url.searchParams.set("from-date", fromDate);
  url.searchParams.set("page-size", "200");
  url.searchParams.set("api-key", GUARDIAN_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch {
    return { statusCode: 200, body: JSON.stringify({ timeline: [], zones: [], meta: { total: 0, critical: 0, days } }) };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok)
    return { statusCode: 200, body: JSON.stringify({ timeline: [], zones: [], meta: { total: 0, critical: 0, days } }) };

  const data = await response.json();
  const results: any[] = data?.response?.results ?? [];

  // Seed all dates in range so there are no gaps
  const byDate: Record<string, { red: number; amber: number; green: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    byDate[d] = { red: 0, amber: 0, green: 0 };
  }

  const zoneCounts: Record<string, number> = Object.fromEntries(ZONE_PATTERNS.map(z => [z.name, 0]));

  for (const a of results) {
    const date = (a.webPublicationDate ?? "").slice(0, 10);
    if (!byDate[date]) byDate[date] = { red: 0, amber: 0, green: 0 };
    const status = classifyStatus(a.webTitle ?? "");
    byDate[date][status]++;

    const text = `${a.webTitle ?? ""} ${a.fields?.trailText ?? ""}`;
    for (const z of ZONE_PATTERNS) {
      if (z.re.test(text)) zoneCounts[z.name]++;
    }
  }

  const timeline = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date: date.slice(5), fullDate: date, ...counts }));

  const zones = ZONE_PATTERNS
    .map(z => ({ name: z.name, count: zoneCounts[z.name] }))
    .sort((a, b) => b.count - a.count);

  const critical = results.filter(a => classifyStatus(a.webTitle ?? "") === "red").length;

  return {
    statusCode: 200,
    headers: { "Cache-Control": "public, max-age=600" },
    body: JSON.stringify({ timeline, zones, meta: { total: results.length, critical, days } }),
  };
};
