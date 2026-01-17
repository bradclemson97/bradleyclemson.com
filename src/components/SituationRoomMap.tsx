import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { countryCentroids } from "../data/countryCentroids";

interface CountryData {
  country: string;
  count: number;
}

interface Article {
  title: string;
  url: string;
  source?: string;
  date?: string;
}

const topics = ["protest", "cyber", "election"];
const timeRanges = ["6h", "24h", "7d"];

/* ✅ GDELT date parser */
function parseGdeltDate(seenDate?: string) {
  if (!seenDate || seenDate.length !== 14) return null;

  const year = seenDate.slice(0, 4);
  const month = seenDate.slice(4, 6);
  const day = seenDate.slice(6, 8);
  const hour = seenDate.slice(8, 10);
  const minute = seenDate.slice(10, 12);
  const second = seenDate.slice(12, 14);

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
  );
}

export default function SituationRoomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const clickPopupRef = useRef<maplibregl.Popup | null>(null);

  const [topic, setTopic] = useState("protest");
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [0, 20],
      zoom: 1.5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapInstanceRef.current = map;

    hoverPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    clickPopupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "360px",
    });
  }, []);

  // Update top countries layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}`
        );
        const data = await res.json();
        if (!data.countries) return;

        const topCountries = [...data.countries]
          .sort((a: CountryData, b: CountryData) => b.count - a.count)
          .slice(0, 5);

        const geojson = {
          type: "FeatureCollection",
          features: topCountries
            .map((c) => {
              const coords = countryCentroids[c.country];
              if (!coords) return null;
              return {
                type: "Feature",
                geometry: { type: "Point", coordinates: coords },
                properties: {
                  country: c.country,
                  count: c.count,
                },
              };
            })
            .filter(Boolean),
        };

        if (map.getLayer("top-countries-layer")) map.removeLayer("top-countries-layer");
        if (map.getSource("top-countries")) map.removeSource("top-countries");

        map.addSource("top-countries", {
          type: "geojson",
          data: geojson,
        });

        map.addLayer({
          id: "top-countries-layer",
          type: "circle",
          source: "top-countries",
          paint: {
            "circle-radius": ["+", 10, ["*", 1.5, ["get", "count"]]],
            "circle-color": "rgba(220,38,38,0.6)",
            "circle-stroke-color": "rgb(220,38,38)",
            "circle-stroke-width": 2,
            "circle-opacity": 0.7,
          },
        });

        // Hover popup
        map.on("mouseenter", "top-countries-layer", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;

          const { country, count } = f.properties as any;
          const coords = (f.geometry as GeoJSON.Point).coordinates;

          hoverPopupRef.current!
            .setLngLat(coords as [number, number])
            .setHTML(
              `<strong>${country}</strong><br/>${count} ${topic} events (${timeRange})`
            )
            .addTo(map);
        });

        map.on("mouseleave", "top-countries-layer", () => {
          map.getCanvas().style.cursor = "";
          hoverPopupRef.current?.remove();
        });

        // CLICK → fetch & show news feed
        map.on("click", "top-countries-layer", async (e) => {
          const f = e.features?.[0];
          if (!f) return;

          const { country } = f.properties as any;
          const coords = (f.geometry as GeoJSON.Point).coordinates;

          clickPopupRef.current!
            .setLngLat(coords as [number, number])
            .setHTML(`<div class="text-sm text-neutral-400">Loading news…</div>`)
            .addTo(map);

          try {
            const res = await fetch(
              `/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}&country=${encodeURIComponent(
                country
              )}`
            );
            const data = await res.json();

            const articles: Article[] = data.articles || [];

            const html =
              articles.length === 0
                ? `<div class="text-sm text-neutral-400">No recent articles</div>`
                : `
                  <div style="max-height:220px; overflow:auto;">
                    ${articles.slice(0, 10).map((a) => {
                      const parsed = parseGdeltDate(a.date);
                      const displayDate = parsed
                        ? parsed.toLocaleString()
                        : "";

                      return `
                        <div style="margin-bottom:8px;">
                          <a href="${a.url}" target="_blank" rel="noopener noreferrer"
                             style="color:#f87171; font-weight:600;">
                            ${a.title}
                          </a>
                          <div style="font-size:11px; color:#9ca3af;">
                            ${a.source ?? ""}${displayDate ? " • " + displayDate : ""}
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                `;

            clickPopupRef.current!.setHTML(html);
          } catch {
            clickPopupRef.current!.setHTML(
              `<div class="text-sm text-red-400">Failed to load articles</div>`
            );
          }
        });

        // Pulse animation
        let frame = 0;
        const animate = () => {
          if (!map.getLayer("top-countries-layer")) return;
          frame += 0.05;

          map.setPaintProperty("top-countries-layer", "circle-radius", [
            "+",
            10,
            ["*", 1.5, ["get", "count"]],
            ["*", 5, Math.sin(frame)],
          ]);

          requestAnimationFrame(animate);
        };
        animate();
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [topic, timeRange]);

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="rounded px-2 py-1 bg-neutral-800 text-white"
        >
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="rounded px-2 py-1 bg-neutral-800 text-white"
        >
          {timeRanges.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        {loading && <div className="text-red-400">Loading…</div>}
      </div>

      <div
        ref={mapRef}
        style={{ height: "600px", width: "100%" }}
        className="rounded-xl shadow-2xl border border-neutral-800"
      />
    </div>
  );
}