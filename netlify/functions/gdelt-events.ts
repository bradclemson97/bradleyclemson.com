import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  try {
    const topic = event.queryStringParameters?.topic ?? "protest";
    const timespan = event.queryStringParameters?.timespan ?? "24h";
    const countryFilter = event.queryStringParameters?.country;
    const keyword = event.queryStringParameters?.keyword;

    // 🔹 Build GDELT query
    let query = topic;
    if (keyword) {
      query = keyword;
    } else if (countryFilter) {
      query = `sourcecountry:${countryFilter}`;
    }

    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      `?query=${encodeURIComponent(query)}` +
      `&timespan=${timespan}` +
      "&maxrecords=250" +
      "&format=json";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "SituationRoom/1.0",
        Accept: "application/json",
      },
    });

    const data = await response.json();
    if (!data.articles) {
      return {
        statusCode: 200,
        body: JSON.stringify({ countries: [], articles: [] }),
      };
    }

    // 🔹 COUNTRY DRILLDOWN MODE
    if (countryFilter || keyword) {
      const articles = data.articles
        .slice(0, 20)
        .map((a: any) => ({
          title: a.title,
          url: a.url,
          source: a.source,
          date: a.seendate,
        }));

      return {
        statusCode: 200,
        headers: {
          "Cache-Control": "public, max-age=300",
        },
        body: JSON.stringify({ articles }),
      };
    }

    // 🔹 AGGREGATION MODE
    const countryCounts: Record<string, number> = {};

    for (const article of data.articles) {
      const c = article.sourcecountry;
      if (!c) continue;
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }

    const countries = Object.entries(countryCounts).map(
      ([country, count]) => ({
        country,
        count,
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({
        totalArticles: data.articles.length,
        countries,
      }),
    };
  } catch (err) {
    console.error("GDELT error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};