import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  try {
    // 🔹 Read query parameters from the URL
    const topic = event.queryStringParameters?.topic || "protest"; // default: protest
    const timespan = event.queryStringParameters?.timespan || "24h"; // default: 24h

    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      `?query=${encodeURIComponent(topic)}` +
      `&timespan=${encodeURIComponent(timespan)}` +
      "&maxrecords=100" +
      "&format=json";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "SituationRoom/1.0",
        "Accept": "application/json",
      },
    });

    const data = await response.json();

    if (!data.articles) {
      throw new Error("No articles returned");
    }

    // 🔹 Country aggregation
    const countryCounts: Record<string, number> = {};

    for (const article of data.articles) {
      const country = article.sourcecountry;
      if (!country) continue;

      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    // 🔹 Convert to frontend-friendly array
    const result = Object.entries(countryCounts).map(([country, count]) => ({
      country,
      count,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        totalArticles: data.articles.length,
        countries: result,
      }),
    };
  } catch (err) {
    console.error("Situation Room error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
