import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { countryCentroids } from "../data/countryCentroids";

interface CountryData {
  country: string;
  count: number;
}

const topics = ["protest", "cyber", "election"];
const timeRanges = ["6h", "24h", "7d"];

export default function SituationRoomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  const [topic, setTopic] = useState("protest");
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(false);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapRef.current) return;

    // Add pulse animation keyframes
    if (!document.getElementById("pulse-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "pulse-style";
      styleEl.innerHTML = `
        @keyframes pulse-ring {
          0% {
            transform: scale(0.6);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(styleEl);
    }

    if (!mapInstanceRef.current) {
      const map = new maplibregl.Map({
        container: mapRef.current,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: [0, 20],
        zoom: 1.5,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapInstanceRef.current = map;
    }
  }, []);

  // Update markers (top 5 countries only)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const debounceTimeout = setTimeout(async () => {
      setLoading(true);

      try {
        const res = await fetch(
          `/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}`
        );
        const data = await res.json();
        if (!data.countries) return;

        // 🔹 Sort by count DESC and take top 5
        const topCountries = [...data.countries]
          .sort((a: CountryData, b: CountryData) => b.count - a.count)
          .slice(0, 5);

        // 🔹 Remove old markers BEFORE adding new ones
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        topCountries.forEach((c) => {
          const coords = countryCentroids[c.country];
          if (!coords) return;

          const size = Math.min(40, 10 + c.count * 2);
          const glow = Math.min(1, c.count / 20);

          // Parent element
          const el = document.createElement("div");
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.position = "relative";
          el.style.background = "transparent";
          el.style.cursor = "pointer";

          // Pulsing ring
          const ring = document.createElement("div");
          ring.style.position = "absolute";
          ring.style.top = "50%";
          ring.style.left = "50%";
          ring.style.width = "100%";
          ring.style.height = "100%";
          ring.style.borderRadius = "50%";
          ring.style.background = "rgba(220,38,38,0.6)";
          ring.style.transform = "translate(-50%, -50%)";
          ring.style.animation = "pulse-ring 1.5s infinite";

          // Core dot
          const core = document.createElement("div");
          core.style.position = "absolute";
          core.style.top = "50%";
          core.style.left = "50%";
          core.style.width = `${Math.max(6, size / 3)}px`;
          core.style.height = `${Math.max(6, size / 3)}px`;
          core.style.borderRadius = "50%";
          core.style.background = "rgb(220,38,38)";
          core.style.transform = "translate(-50%, -50%)";
          core.style.boxShadow = `0 0 ${10 + glow * 20}px rgba(220,38,38,0.9)`;

          el.appendChild(ring);
          el.appendChild(core);

          el.addEventListener("mouseenter", () => {
            core.style.transform = "translate(-50%, -50%) scale(1.4)";
          });
          el.addEventListener("mouseleave", () => {
            core.style.transform = "translate(-50%, -50%) scale(1)";
          });

          // Add marker with the custom element
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .setPopup(
              new maplibregl.Popup({ offset: 25 }).setHTML(`
                <strong>${c.country}</strong><br/>
                ${c.count} ${topic} events (${timeRange})
              `)
            )
            .addTo(map);

          markersRef.current.push(marker);
        });
      } catch (err) {
        console.error("Failed to fetch GDELT events:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimeout);
  }, [topic, timeRange]);

  return (
    <div>
      {/* Controls */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="mr-2 font-semibold">Topic:</label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="rounded px-2 py-1 bg-neutral-800 text-white"
          >
            {topics.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mr-2 font-semibold">Time Range:</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded px-2 py-1 bg-neutral-800 text-white"
          >
            {timeRanges.map((tr) => (
              <option key={tr} value={tr}>
                {tr}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="ml-4 text-red-400 font-semibold">Loading...</div>
        )}
      </div>

      {/* Map */}
      <div
        ref={mapRef}
        style={{ height: "600px", width: "100%" }}
        className="rounded-xl shadow-2xl border border-neutral-800"
      />
    </div>
  );
}