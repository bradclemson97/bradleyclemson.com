import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  try {
    if (!process.env.GOOGLE_AI_KEY) {
      throw new Error("Missing GOOGLE_AI_KEY environment variable");
    }

    const prompt = `You are an intelligence analyst specializing in European security and NATO's eastern flank.

Provide a concise intelligence-style briefing (3-4 complete sentences) focused specifically on the current situation along NATO's eastern flank. Address:
- The Russia-Ukraine conflict: front-line developments, battlefield posture, and escalation indicators
- NATO posture in the Baltic states (Estonia, Latvia, Lithuania) and Poland — Enhanced Forward Presence, exercises, reinforcements
- Any hybrid warfare activity: cyberattacks, information operations, border provocations, or energy coercion targeting eastern flank NATO members
- Kaliningrad or Belarus developments relevant to NATO security

Tone: neutral, analytical, professional — written as an intelligence product, not a news summary. Do not speculate. All sentences must be complete.

Date context: ${new Date().toUTCString()}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 450,
          },
        }),
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      console.error("GOOGLE AI ERROR:", raw);
      return {
        statusCode: response.status,
        body: JSON.stringify({ summary: "Intelligence brief unavailable.", details: raw }),
      };
    }

    const parsed = JSON.parse(raw);
    const summary =
      parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No briefing generated.";

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=3600" },
      body: JSON.stringify({ summary }),
    };
  } catch (error: any) {
    console.error("AI BRIEF CRASH:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ summary: "AI briefing unavailable.", error: error?.message }),
    };
  }
};
