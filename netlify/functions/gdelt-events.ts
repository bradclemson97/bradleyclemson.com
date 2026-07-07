import type { Handler } from "@netlify/functions";

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
  "North Macedonia": "MK",
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
  "Belarus": "BY",
  "Poland": "PL",
  "Estonia": "EE",
  "Latvia": "LV",
  "Lithuania": "LT",
  "Finland": "FI",
  "Norway": "NO",
  "Denmark": "DK",
  "Netherlands": "NL",
  "Belgium": "BE",
  "Czech Republic": "CZ",
  "Slovakia": "SK",
  "Hungary": "HU",
  "France": "FR",
  "Canada": "CA",
  "Thailand / Cambodia": "TH,KH",
  "Ukraine / Russia": "UA,RU",
};

const COUNTRY_CODES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_CODES).map(([name, code]) => [code, name])
);

// Countries to include in eastern flank pulse layer
const EASTERN_FLANK_COUNTRIES = new Set([
  "Ukraine", "Russia", "Belarus", "Poland", "Estonia", "Latvia", "Lithuania",
  "Finland", "Sweden", "Germany", "United States", "United Kingdom", "France",
  "Romania", "Bulgaria", "Hungary", "Slovakia", "Czech Republic", "Norway", "Denmark",
  "Netherlands", "Belgium", "Turkey", "Canada", "Italy",
]);

// Topic → eastern flank GDELT query
const EASTERN_FLANK_TOPIC_QUERIES: Record<string, string> = {
  military: "military (Ukraine OR Russia OR NATO OR Poland OR Estonia OR Latvia OR Lithuania OR Belarus OR Baltic)",
  cyber: "cyber (Ukraine OR Russia OR NATO OR Estonia OR Baltic OR Poland OR Belarus OR Kremlin)",
  hybrid: "(hybrid OR disinformation OR propaganda OR sabotage OR espionage) (Russia OR NATO OR Ukraine OR Baltic OR Belarus OR Poland)",
  NATO: "NATO (Ukraine OR Russia OR Baltic OR Poland OR Estonia OR Latvia OR Lithuania OR Belarus OR eastern OR flank OR reinforc OR exercise)",
  energy: "(energy OR gas OR pipeline OR LNG OR nuclear) (Russia OR Ukraine OR Poland OR Baltic OR Belarus OR Nordstream OR Gazprom)",
  nuclear: "(nuclear OR Zaporizhzhia OR IAEA OR radiation OR warhead) (Russia OR Ukraine OR NATO OR Belarus)",
};

export const handler: Handler = async (event) => {
  try {
    const topic = event.queryStringParameters?.topic ?? "military";
    const timespan = event.queryStringParameters?.timespan ?? "24h";
    const countryFilter = event.queryStringParameters?.country;
    const keyword = event.queryStringParameters?.keyword;
    const region = event.queryStringParameters?.region;
    const isEasternFlank = region === "eastern-flank";

    let query: string;

    if (keyword) {
      query = keyword;
    } else if (countryFilter) {
      const normalizedCountry =
        COUNTRY_CODES_REVERSE[countryFilter.toUpperCase()] || countryFilter;
      query = normalizedCountry;
    } else if (isEasternFlank) {
      query = EASTERN_FLANK_TOPIC_QUERIES[topic] ??
        `${topic} (Ukraine OR Russia OR NATO OR Poland OR Baltic OR Estonia OR Latvia OR Lithuania)`;
    } else {
      query = topic;
    }

    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      `?query=${encodeURIComponent(query)}` +
      `&timespan=${timespan}` +
      "&maxrecords=100" +
      "&format=json" +
      "&translation=auto";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "SituationRoom/1.0", Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err: any) {
      console.error("Network failure:", err?.code || err?.message);
      return { statusCode: 200, body: JSON.stringify({ countries: [], articles: [] }) };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("GDELT HTTP error:", response.status);
      return { statusCode: 200, body: JSON.stringify({ countries: [], articles: [] }) };
    }

    let data: any;
    try {
      data = await response.json();
      if (!data?.articles || !Array.isArray(data.articles)) {
        return { statusCode: 200, body: JSON.stringify({ countries: [], articles: [] }) };
      }
    } catch {
      console.error("Invalid JSON from GDELT");
      return { statusCode: 200, body: JSON.stringify({ countries: [], articles: [] }) };
    }

    // ---- COUNTRY DRILLDOWN / KEYWORD MODE ----
    if (countryFilter || keyword) {
      const articles = data.articles.slice(0, 20).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: a.domain ?? a.source,
        date: a.seendate,
      }));
      return {
        statusCode: 200,
        headers: { "Cache-Control": "public, max-age=300" },
        body: JSON.stringify({ articles }),
      };
    }

    // ---- AGGREGATION MODE ----
    const countryCounts: Record<string, number> = {};
    for (const article of data.articles) {
      const c = article.sourcecountry;
      if (!c) continue;
      // When eastern flank mode, only count relevant countries
      if (isEasternFlank && !EASTERN_FLANK_COUNTRIES.has(c)) continue;
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }

    const countries = Object.entries(countryCounts).map(([country, count]) => ({
      country,
      count,
    }));

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({ totalArticles: data.articles.length, countries }),
    };
  } catch (err: any) {
    console.error("FULL ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", message: err?.message }),
    };
  }
};
