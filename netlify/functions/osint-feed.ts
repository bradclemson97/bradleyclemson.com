import type { Handler } from "@netlify/functions";

const NEWS_API_KEY = process.env.NEWSAPI_KEY;

export const handler: Handler = async () => {
  try {
    if (!NEWS_API_KEY) return { statusCode: 500, body: "NewsAPI key not set" };

    const url = `https://newsapi.org/v2/top-headlines?language=en&category=general&pageSize=20`;

    const res = await fetch(url, {
      headers: { "X-Api-Key": NEWS_API_KEY },
    });
    const data = await res.json();

    const articles = (data.articles || []).map((a: any) => {
      const title = a.title.toLowerCase();
      let status: "red" | "amber" | "green" = "green";

      if (/(war|conflict|attack|bomb|missile|invasion|fighting)/i.test(title)) status = "red";
      else if (/(protest|strike|demonstration|tension|cyber)/i.test(title)) status = "amber";

      return {
        title: a.title,
        url: a.url,
        source: a.source?.name,
        date: a.publishedAt,
        status,
      };
    });

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=60" },
      body: JSON.stringify({ articles }),
    };
  } catch (err) {
    console.error("OSINT feed error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to fetch OSINT feed" }) };
  }
};