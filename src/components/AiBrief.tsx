import { useEffect, useState } from "react";

export default function AiBrief() {
  const [summary, setSummary] = useState<string>("Generating briefing...");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch("/.netlify/functions/ai-brief");
        const data = await res.json();
        setSummary(data.summary || "No briefing available.");
      } catch (err) {
        setSummary("Failed to generate geopolitical briefing.");
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  return (
    <div className="border-t border-b border-neutral-800 bg-neutral-950/70 px-6 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-xs text-red-500 tracking-widest uppercase mb-2">
          AI Daily Geopolitical Brief
        </div>

        <div className="text-sm md:text-base text-neutral-300 leading-relaxed font-light">
          {loading ? "Analyzing global developments..." : summary}
        </div>
      </div>
    </div>
  );
}