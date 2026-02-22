import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  try {
    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      "?query=sourcecountry:US" +
      "&mode=ArtList" +
      "&timespan=7d" +
      "&maxrecords=10" +
      "&format=json";

    console.log("DEBUG: Calling GDELT URL:", url);

    const response = await fetch(url);

    console.log("DEBUG: Response status:", response.status);

    const rawText = await response.text();

    console.log("DEBUG: Raw response length:", rawText.length);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: rawText, // return EXACT raw GDELT output
    };
  } catch (err: any) {
    console.error("DEBUG ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Debug function failed",
        message: err?.message,
      }),
    };
  }
};