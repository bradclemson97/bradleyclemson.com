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

    if (!document.getElementById("pulse-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "pulse-style";
      styleEl.innerHTML = `
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0.6; }
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
        projection: "globe",
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapInstanceRef.current = map;
    }
  }, []);

  // Smooth marker update with debounce
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

        const newMarkers: maplibregl.Marker[] = [];

        data.countries.forEach((c: CountryData) => {
          const coords = countryCentroids[c.country];
          if (!coords) return;

          const size = Math.min(40, 10 + c.count * 2);
          const glow = Math.min(1, c.count / 20);

          const el = document.createElement("div");
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.borderRadius = "50%";
          el.style.background = `rgba(220,38,38,${0.5 + glow * 0.5})`;
          el.style.border = `2px solid rgba(220,38,38,1)`;
          el.style.boxShadow = `0 0 ${6 + glow * 20}px rgba(220,38,38,0.7)`;
          el.style.animation = "pulse 1.5s infinite";
          el.style.cursor = "pointer";

          el.addEventListener("mouseenter", () => (el.style.transform = "scale(1.5)"));
          el.addEventListener("mouseleave", () => (el.style.transform = "scale(1)"));

          const marker = new maplibregl.Marker(el)
            .setLngLat(coords)
            .setPopup(
              new maplibregl.Popup({ offset: 25 }).setHTML(`
                <strong>${c.country}</strong><br/>
                ${c.count} ${topic} events (${timeRange})
              `)
            )
            .addTo(map);

          newMarkers.push(marker);
        });

        // Replace old markers after new ones are ready
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = newMarkers;
      } catch (err) {
        console.error("Failed to fetch GDELT events:", err);
      } finally {
        setLoading(false);
      }
    }, 300); // debounce 300ms

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