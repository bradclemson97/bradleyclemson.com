import { useEffect, useState } from "react";

interface Article {
  title: string;
  url: string;
  source?: string;
  date?: string;
  status: "red" | "amber" | "green";
}

export default function OsintFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/.netlify/functions/osint-feed`);
      const data = await res.json();

      const newArticles: Article[] = data.articles || [];
      const newIds = new Set<number>();
      newArticles.forEach((_, idx) => {
        if (!articles[idx] || articles[idx].url !== newArticles[idx].url) newIds.add(idx);
      });
      setHighlightIds(newIds);
      setArticles(newArticles);

      setTimeout(() => setHighlightIds(new Set()), 3000); // remove pulse after 3s
    } catch (err) {
      console.error("Failed to fetch OSINT feed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    red: "bg-red-600",
    amber: "bg-amber-500",
    green: "bg-green-500",
  };

  return (
    <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 backdrop-blur-sm shadow-2xl p-6">
      <h2 className="text-xl font-semibold mb-4 text-white">OSINT Feed</h2>
      {loading && <div className="text-neutral-400">Loading news…</div>}

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {articles.map((a, i) => {
          const date = a.date ? new Date(a.date).toLocaleString() : undefined;
          return (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block p-2 rounded transition flex gap-2 items-start ${
                highlightIds.has(i) ? "animate-pulse" : "hover:bg-neutral-800/50"
              }`}
            >
              {/* Status badge */}
              <div className={`w-2 h-2 mt-1 rounded-full ${statusColors[a.status]}`} />
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-400">{a.title}</div>
                <div className="text-xs text-neutral-400">
                  {a.source} {date ? `• ${date}` : ""}
                </div>
              </div>
            </a>
          );
        })}
        {articles.length === 0 && !loading && (
          <div className="text-neutral-400">No recent news</div>
        )}
      </div>
    </div>
  );
}