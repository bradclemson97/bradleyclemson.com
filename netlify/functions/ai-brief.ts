import type { Handler } from "@netlify/functions";

const GROQ_KEY = process.env.GROQ_API_KEY;

export const handler: Handler = async () => {
  if (!GROQ_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({ summary: "GROQ_API_KEY environment variable not set." }),
    };
  }

  const prompt = `You are an intelligence analyst specializing in European security and NATO's eastern flank.

Provide a concise intelligence-style briefing (3-4 complete sentences) focused specifically on the current situation along NATO's eastern flank. Address:
- The Russia-Ukraine conflict: front-line developments, battlefield posture, and escalation indicators
- NATO posture in the Baltic states (Estonia, Latvia, Lithuania) and Poland — Enhanced Forward Presence, exercises, reinforcements
- Any hybrid warfare activity: cyberattacks, information operations, border provocations, or energy coercion targeting eastern flank NATO members
- Kaliningrad or Belarus developments relevant to NATO security

Tone: neutral, analytical, professional — written as an intelligence product, not a news summary. All sentences must be complete. Do not mention that you are an AI.

Date context: ${new Date().toUTCString()}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 450,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      console.error("Groq error:", response.status, raw);
      return {
        statusCode: 200,
        body: JSON.stringify({ summary: "Intelligence brief temporarily unavailable." }),
      };
    }

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content ?? "No briefing generated.";

    return {
      statusCode: 200,
      headers: { "Cache-Control": "public, max-age=3600" },
      body: JSON.stringify({ summary }),
    };
  } catch (err: any) {
    console.error("AI brief crash:", err);
    return {
      statusCode: 200,
      body: JSON.stringify({ summary: "Intelligence brief temporarily unavailable." }),
    };
  }
};
