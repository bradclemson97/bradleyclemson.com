import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  try {
    if (!process.env.GOOGLE_AI_KEY) {
      throw new Error("Missing GOOGLE_AI_KEY environment variable");
    }

    const prompt = `
Provide a concise intelligence-style geopolitical briefing (2-3 sentences).
Ensure the final sentence is complete.
Tone: neutral, analytical, professional.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      console.error("GOOGLE ERROR:", raw);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          summary: "Google AI request failed.",
          details: raw,
        }),
      };
    }

    const parsed = JSON.parse(raw);

    const summary =
      parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "No briefing generated.";

    return {
      statusCode: 200,
      body: JSON.stringify({ summary }),
    };
  } catch (error: any) {
    console.error("AI BRIEF CRASH:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        summary: "AI briefing unavailable.",
        error: error?.message || "Unknown server error",
      }),
    };
  }
};