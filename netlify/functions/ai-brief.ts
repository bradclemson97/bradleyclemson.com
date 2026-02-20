import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  try {
    const prompt = `
Provide a concise intelligence-style geopolitical briefing (6–10 sentences).

Highlight:
- Active conflicts
- Rising tensions
- Strategic risks
- Emerging instability

Tone: neutral, analytical, professional.
Avoid speculation.
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
            temperature: 0.5,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ summary: `Google AI error: ${text}` }),
      };
    }

    const data = await response.json();

    const summary =
      data.candidates?.[0]?.content?.parts?.[0]?.text ??
      "No briefing available.";

    return {
      statusCode: 200,
      body: JSON.stringify({ summary }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        summary: "AI briefing unavailable.",
      }),
    };
  }
};