import type { Handler } from "@netlify/functions";

// Mapping full country names → ISO codes
const COUNTRY_CODES: Record<string, string> = {
  "United States": "US",
  "South Korea": "KR",
  "India": "IN",
  "Turkey": "TR",
  "Indonesia": "ID",
  "Italy": "IT",
  "Nigeria": "NG",
  "China": "CN",
  "Brazil": "BR",
  "Algeria": "DZ",
  "Vietnam": "VN",
  "Serbia": "RS",
  "United Kingdom": "GB",
  "Cyprus": "CY",
  "Bulgaria": "BG",
  "Australia": "AU",
  "Sri Lanka": "LK",
  "Peru": "PE",
  "Thailand": "TH",
  "Russia": "RU",
  "Pakistan": "PK",
  "Bolivia": "BO",
  "Hong Kong": "HK",
  "Malaysia": "MY",
  "Macedonia": "MK",
  "Slovenia": "SI",
  "Israel": "IL",
  "Spain": "ES",
  "Liberia": "LR",
  "Romania": "RO",
  "Albania": "AL",
  "Greece": "GR",
  "Kosovo": "XK",
  "Austria": "AT",
  "Taiwan": "TW",
  "Mexico": "MX",
  "Japan": "JP",
  "Dominican Republic": "DO",
  "Colombia": "CO",
  "Egypt": "EG",
  "Switzerland": "CH",
  "Sweden": "SE",
  "Bangladesh": "BD",
  "Germany": "DE",
  "Greenland": "GL",
  "Cambodia": "KH",
  "Ukraine": "UA",
  "Thailand / Cambodia": "TH,KH",
  "Ukraine / Russia": "UA,RU",
};

export const handler: Handler = async (event) => {
  try {
    const topic = event.queryStringParameters?.topic ?? "PROTEST";
    const timespan = event.queryStringParameters?.timespan ?? "24h";
    const countryFilter = event.queryStringParameters?.country;
    const keyword = event.queryStringParameters?.keyword;

    // ---------------- BUILD PROPER GDELT QUERY ----------------
    let query = `theme:${topic.toUpperCase()}`;

    if (keyword) {
      // Free-text search
      query = keyword;
    }

    if (countryFilter) {
      // Accept:
      // - ISO code (US)
      // - Full country name ("United States")
      // - Multi-country ("TH,KH")

      let iso = countryFilter.toUpperCase();

      // If full name provided, convert to ISO
      if (COUNTRY_CODES[countryFilter]) {
        iso = COUNTRY_CODES[countryFilter];
      }

      // Multi-country support
      if (iso.includes(",")) {
        const parts = iso.split(",");
        query = parts
          .map((c) => `sourcecountry:${c.trim()}`)
          .join(" OR ");
      } else {
        query = `sourcecountry:${iso}`;
      }
    }

    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      `?query=${encodeURIComponent(query)}` +
      "&mode=ArtList" +
      `&timespan=${timespan}` +
      "&maxrecords=100" +
      "&format=json";

    console.log("GDELT URL:", url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      console.error("Network failure:", err?.message);
      return emptyResponse();
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("GDELT HTTP error:", response.status);
      return emptyResponse();
    }

    const data = await response.json();

    if (!data?.articles || !Array.isArray(data.articles)) {
      console.log("No articles returned");
      return emptyResponse();
    }

    // ---------------- COUNTRY DRILLDOWN MODE ----------------
    if (countryFilter || keyword) {
      const articles = data.articles.slice(0, 20).map((a: any) => ({
        title: a.title,
        url: a.url,
        domain: a.domain,
        date: a.seendate,
        sourcecountry: a.sourcecountry,
      }));

      return {
        statusCode: 200,
        headers: { "Cache-Control": "public, max-age=300" },
        body: JSON.stringify({ articles }),
      };
    }

    // ---------------- AGGREGATION MODE ----------------
    const countryCounts: Record<string, number> = {};

    for (const article of data.articles) {
      const c = article.sourcecountry;
      if (!c) continue;
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }

    const countries = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({
        totalArticles: data.articles.length,
        countries,
      }),
    };
  } catch (err: any) {
    console.error("FULL ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        message: err?.message,
      }),
    };
  }
};

function emptyResponse() {
  return {
    statusCode: 200,
    body: JSON.stringify({
      totalArticles: 0,
      countries: [],
      articles: [],
    }),
  };
}