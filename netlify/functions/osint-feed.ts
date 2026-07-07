import type { Handler } from "@netlify/functions";

const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY ?? "test";

// Eastern flank query — Guardian supports simple OR/AND boolean
const QUERY =
  "(Ukraine OR Russia OR NATO OR Estonia OR Latvia OR Lithuania OR Poland OR Belarus OR Baltic OR Kaliningrad) AND (military OR conflict OR attack OR missile OR drone OR cyber OR troops OR war OR sanctions OR hybrid OR defense OR threat OR invasion)";

export const handler: Handler = async () => {
  const url = new URL("https://content.guardianapis.com/search");
  url.searchParams.set("q", QUERY);
  url.searchParams.set("section", "world");
  url.searchParams.set("show-fields", "trailText");
  url.searchParams.set("order-by", "newest");
  url.searchParams.set("page-size", "30");
  url.searchParams.set("api-key", GUARDIAN_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch (err: any) {
    console.error("Guardian OSINT error:", err?.message);
    return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.error("Guardian OSINT HTTP error:", response.status, await response.text());
    return { statusCode: 200, body: JSON.stringify({ articles: [] }) };
  }

  const data = await response.json();
  const results: any[] = data?.response?.results ?? [];

  const articles = results.map((a: any) => {
    const title: string = a.webTitle ?? "";
    let status: "red" | "amber" | "green" = "green";

    if (/(war|conflict|attack|bomb|missile|invasion|fighting|shelling|killed|casualties|airstrike|explosion|strike|offensive)/i.test(title)) {
      status = "red";
    } else if (/(tension|cyber|sanction|hybrid|threat|deploy|exercise|reinfor|mobiliz|provoc|intercept|NATO|drills?)/i.test(title)) {
      status = "amber";
    }

    return {
      title: a.webTitle,
      url: a.webUrl,
      source: "The Guardian",
      date: a.webPublicationDate,
      status,
    };
  });

  return {
    statusCode: 200,
    headers: { "Cache-Control": "public, max-age=300" },
    body: JSON.stringify({ articles }),
  };
};
