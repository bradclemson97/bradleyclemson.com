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

/* ---------------- GDELT date parser ---------------- */
function parseGdeltDate(seenDate?: string) {
  if (!seenDate || seenDate.length !== 14) return null;
  const y = seenDate.slice(0, 4);
  const m = seenDate.slice(4, 6);
  const d = seenDate.slice(6, 8);
  const h = seenDate.slice(8, 10);
  const min = seenDate.slice(10, 12);
  const s = seenDate.slice(12, 14);
  return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
}

/* ---------------- Tension / Conflict Zones ---------------- */
const tensionZones = [
  { name: "Greenland", status: "amber", coordinates: [-42, 72] },
  { name: "Thailand / Cambodia", status: "amber", coordinates: [102.5, 14.5] },
  { name: "Ukraine / Russia", status: "red", coordinates: [36, 49] },
  { name: "Taiwan", status: "amber", coordinates: [121, 23.7] },
];

const TENSION_QUERIES: Record<string, string> = {
  "Greenland": "Greenland Arctic NATO Russia",
  "Thailand / Cambodia": "Thailand Cambodia border tensions",
  "Ukraine / Russia": "Ukraine Russia war",
  "Taiwan": "Taiwan China military tensions",
};

/* ---------------- Multi-word country → ISO mapping ---------------- */
const COUNTRY_GDELT_MAP: Record<string, string> = {
  "United States": "US",
  "South Korea": "KR",
  "North Korea": "KP",
  "United Kingdom": "GB",
  "Czech Republic": "CZ",
  "New Zealand": "NZ",
  "Saudi Arabia": "SA",
  "Hong Kong": "HK",
  "Taiwan": "TW",
  "Dominican Republic": "DO",
};

export default function SituationRoomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefInstance = useRef<maplibregl.Map | null>(null);
  const hoverPopup = useRef<maplibregl.Popup | null>(null);
  const clickPopup = useRef<maplibregl.Popup | null>(null);

  const [topic, setTopic] = useState("protest");
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(false);

  /* ---------------- Init map ---------------- */
  useEffect(() => {
    if (!mapRef.current || mapRefInstance.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [0, 20],
      zoom: 1.5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRefInstance.current = map;

    hoverPopup.current = new maplibregl.Popup({ closeButton: false });
    clickPopup.current = new maplibregl.Popup({ maxWidth: "360px" });

    map.on("load", () => {
      /* ---------- Static tension zones ---------- */
      map.addSource("tension-zones", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: tensionZones.map((z) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: z.coordinates },
            properties: z,
          })),
        },
      });

      map.addLayer({
        id: "tension-zones-layer",
        type: "circle",
        source: "tension-zones",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "status"],
            "red", "#dc2626",
            "amber", "#f59e0b",
            "#6b7280",
          ],
          "circle-stroke-color": "#000",
          "circle-stroke-width": 1.5,
        },
      });

      map.on("click", "tension-zones-layer", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const { name, status } = f.properties as any;
        const coords = (f.geometry as GeoJSON.Point).coordinates;

        clickPopup.current!
          .setLngLat(coords as [number, number])
          .setHTML(`<div class="text-neutral-400">Loading ${name}…</div>`)
          .addTo(map);

        try {
          const keyword = TENSION_QUERIES[name];
          const res = await fetch(
            `/.netlify/functions/gdelt-events?timespan=7d&keyword=${encodeURIComponent(keyword)}`
          );
          const data = await res.json();
          const articles: Article[] = data.articles || [];

          clickPopup.current!.setHTML(
            articles.length === 0
              ? `<div class="text-neutral-400">No recent articles</div>`
              : `
                <strong>${name}</strong>
                <div style="font-size:12px; margin-bottom:6px;">
                  ${status === "red" ? "🔴 Active Conflict" : "🟠 Heightened Tensions"}
                </div>
                <div style="max-height:220px; overflow:auto;">
                  ${articles.slice(0, 8).map(a => {
                    const d = parseGdeltDate(a.date);
                    return `
                      <div style="margin-bottom:8px;">
                        <a href="${a.url}" target="_blank"
                           style="color:#f87171;font-weight:600;">
                          ${a.title}
                        </a>
                        <div style="font-size:11px;color:#9ca3af;">
                          ${a.source ?? ""}${d ? " • " + d.toLocaleString() : ""}
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              `
          );
        } catch {
          clickPopup.current!.setHTML(
            `<div class="text-red-400">Failed to load updates</div>`
          );
        }
      });
    });
  }, []);

  /* ---------------- GDELT pulse layer ---------------- */
  useEffect(() => {
    const map = mapRefInstance.current;
    if (!map) return;

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}`
        );
        const data = await res.json();
        if (!data.countries) return;

        const top = [...data.countries]
          .sort((a: CountryData, b: CountryData) => b.count - a.count)
          .slice(0, 5);

        const geojson = {
          type: "FeatureCollection",
          features: top
            .map(c => {
              const coords = countryCentroids[c.country];
              if (!coords) return null;
              return {
                type: "Feature",
                geometry: { type: "Point", coordinates: coords },
                properties: c,
              };
            })
            .filter(Boolean),
        };

        if (map.getLayer("top-countries-layer")) map.removeLayer("top-countries-layer");
        if (map.getSource("top-countries")) map.removeSource("top-countries");

        map.addSource("top-countries", { type: "geojson", data: geojson });
        map.addLayer({
          id: "top-countries-layer",
          type: "circle",
          source: "top-countries",
          paint: {
            "circle-radius": ["+", 10, ["*", 1.5, ["get", "count"]]],
            "circle-color": "rgba(220,38,38,0.6)",
            "circle-stroke-color": "#dc2626",
            "circle-stroke-width": 2,
          },
        });

        // ------------------- Hover popup -------------------
        map.on("mouseenter", "top-countries-layer", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const { country, count } = f.properties as any;
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          hoverPopup.current!
            .setLngLat(coords as [number, number])
            .setHTML(`<strong>${country}</strong><br/>${count} ${topic} events (${timeRange})`)
            .addTo(map);
        });

        map.on("mouseleave", "top-countries-layer", () => {
          map.getCanvas().style.cursor = "";
          hoverPopup.current?.remove();
        });

        // ------------------- Click popup -------------------
        map.on("click", "top-countries-layer", async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const { country } = f.properties as any;
          const coords = (f.geometry as GeoJSON.Point).coordinates;

          // 🔹 normalize multi-word country names → ISO code
          const normalizedCountry = COUNTRY_GDELT_MAP[country] || country;

          clickPopup.current!
            .setLngLat(coords as [number, number])
            .setHTML(`<div class="text-sm text-neutral-400">Loading news…</div>`)
            .addTo(map);

          try {
            const res = await fetch(
              `/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}&country=${encodeURIComponent(
                normalizedCountry
              )}`
            );
            const data = await res.json();
            const articles: Article[] = data.articles || [];

            clickPopup.current!.setHTML(
              articles.length === 0
                ? `<div class="text-sm text-neutral-400">No recent articles</div>`
                : `
                  <div style="max-height:220px; overflow:auto;">
                    ${articles.slice(0, 10).map(a => {
                      const d = parseGdeltDate(a.date);
                      return `
                        <div style="margin-bottom:8px;">
                          <a href="${a.url}" target="_blank" style="color:#f87171;font-weight:600;">
                            ${a.title}
                          </a>
                          <div style="font-size:11px;color:#9ca3af;">
                            ${a.source ?? ""}${d ? " • " + d.toLocaleString() : ""}
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                `
            );
          } catch {
            clickPopup.current!.setHTML(`<div class="text-sm text-red-400">Failed to load articles</div>`);
          }
        });

        // ------------------- Pulse animation -------------------
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

    return () => clearTimeout(t);
  }, [topic, timeRange]);

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <select value={topic} onChange={e => setTopic(e.target.value)}
          className="bg-neutral-800 text-white rounded px-2 py-1">
          {topics.map(t => <option key={t}>{t}</option>)}
        </select>

        <select value={timeRange} onChange={e => setTimeRange(e.target.value)}
          className="bg-neutral-800 text-white rounded px-2 py-1">
          {timeRanges.map(t => <option key={t}>{t}</option>)}
        </select>

        {loading && <div className="text-red-400">Loading…</div>}
      </div>

      <div ref={mapRef}
        className="rounded-xl shadow-2xl border border-neutral-800"
        style={{ height: "600px", width: "100%" }} />
    </div>
  );
}