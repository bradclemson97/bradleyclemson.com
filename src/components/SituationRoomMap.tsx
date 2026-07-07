import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { countryCentroids } from "../data/countryCentroids";

/* ---------------- NATO Eastern Flank Members (ISO-3) ---------------- */
const NATO_MEMBERS = [
  "USA","CAN","GBR","FRA","-99","DEU","ITA","ESP","PRT","NLD","BEL","LUX",
  "NOR","DNK","ISL","POL","CZE","SVK","HUN","ROU","BGR","HRV","SVN",
  "ALB","MNE","MKD","GRC","TUR","LTU","LVA","EST","FIN","SWE"
];

/* ---------------- Eastern Flank Tension Zones & Landmarks ---------------- */
const tensionZones = [
  {
    name: "Ukraine-Russia Front",
    status: "red",
    coordinates: [37.5, 48.2],
    description:
      "Active high-intensity warfare across eastern and southern Ukraine following Russia's full-scale invasion in February 2022. Front lines stretch ~1,000km across Donetsk, Zaporizhzhia, and Kherson oblasts."
  },
  {
    name: "Crimea",
    status: "red",
    coordinates: [34.2, 45.3],
    description:
      "Russian-occupied Ukrainian peninsula since 2014. Houses Russia's Black Sea Fleet at Sevastopol. Subject to ongoing Ukrainian strikes targeting naval assets and logistics hubs."
  },
  {
    name: "Kaliningrad Oblast",
    status: "amber",
    coordinates: [20.5, 54.7],
    description:
      "Russian exclave between Poland and Lithuania, housing Iskander-M ballistic missiles (range ~500km), Baltic Fleet assets, and S-400 air defence systems. A persistent flashpoint for NATO's eastern flank."
  },
  {
    name: "Suwalki Corridor",
    status: "amber",
    coordinates: [23.3, 54.3],
    description:
      "A 65km land corridor between Kaliningrad and Belarus linking Poland and Lithuania — NATO's most strategically vulnerable chokepoint. Russian seizure would sever the Baltic states from the rest of the Alliance overland."
  },
  {
    name: "Belarus-Poland Border",
    status: "amber",
    coordinates: [23.6, 52.6],
    description:
      "Ongoing hybrid warfare: the Lukashenko regime weaponises migration flows to pressure Poland, Lithuania, and Latvia. Russian forces exercise regularly from Belarusian territory, including near Brest and Grodno."
  },
  {
    name: "Black Sea / Grain Corridor",
    status: "amber",
    coordinates: [31.5, 45.5],
    description:
      "Contested maritime space following Russia's withdrawal from the Black Sea Grain Initiative (2023). Ukraine has forced Russia's Black Sea Fleet to relocate eastward via drone and missile strikes on Sevastopol."
  },
  {
    name: "Narva / Estonia-Russia Border",
    status: "amber",
    coordinates: [28.2, 59.4],
    description:
      "The Narva River forms the Estonian-Russian border. Narva is ~95% Russian-speaking. Any Russian provocations here trigger Article 5 directly, making it the Alliance's most sensitive geographic tripwire."
  },
  {
    name: "NATO HQ",
    status: "landmark",
    coordinates: [4.437, 50.911],
    description: "North Atlantic Treaty Organization political and military headquarters, Brussels. Coordinates Alliance-wide deterrence posture and Article 5 consultations."
  },
  {
    name: "SHAPE (Allied Command Ops)",
    status: "landmark",
    coordinates: [3.948, 50.495],
    description: "Supreme Headquarters Allied Powers Europe — NATO's operational military command near Mons, Belgium. Directs all NATO military operations across the theatre."
  },
  {
    name: "Ramstein Air Base",
    status: "landmark",
    coordinates: [7.601, 49.437],
    description: "USAF/NATO hub in Germany. Hosts the Ukraine Defense Contact Group (Ramstein Format), key logistics hub for military aid to Ukraine, and Allied Air Command."
  },
  {
    name: "NATO CCDCOE — Tallinn",
    status: "landmark",
    coordinates: [24.753, 59.437],
    description: "NATO Cooperative Cyber Defence Centre of Excellence, Tallinn. Estonia's premier contribution to Alliance cyber resilience. Coordinates cyber defence doctrine, training, and incident response."
  },
];

interface CountryData { country: string; count: number; }
interface Article { title: string; url: string; source?: string; date?: string; }

const topics = ["military", "cyber", "hybrid", "NATO", "energy", "nuclear"];
const timeRanges = ["6h", "24h", "7d"];

/* ---------------- GDELT date parser (14-char format) ---------------- */
function parseGdeltDate(seenDate?: string) {
  if (!seenDate) return null;
  const s = seenDate.replace(/[TZ]/g, "");
  if (s.length !== 14) return null;
  const y = s.slice(0,4), m = s.slice(4,6), d = s.slice(6,8);
  const h = s.slice(8,10), min = s.slice(10,12), sec = s.slice(12,14);
  return new Date(`${y}-${m}-${d}T${h}:${min}:${sec}Z`);
}

/* ---------------- Component ---------------- */
export default function SituationRoomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefInstance = useRef<maplibregl.Map | null>(null);
  const clickPopup = useRef<maplibregl.Popup | null>(null);
  const mapLoadedRef = useRef(false);

  const [topic, setTopic] = useState("military");
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  /* ---------------- Map init (runs once) ---------------- */
  useEffect(() => {
    if (!mapRef.current || mapRefInstance.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [26, 54],
      zoom: 4.0,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRefInstance.current = map;
    clickPopup.current = new maplibregl.Popup({ maxWidth: "360px" });

    map.on("load", () => {
      /* --- Countries source --- */
      map.addSource("countries", {
        type: "geojson",
        data: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
      });

      /* --- NATO borders layer --- */
      const addNatoLayer = () => {
        if (!map.getSource("countries") || map.getLayer("nato-borders")) return;
        map.addLayer({
          id: "nato-borders",
          type: "line",
          source: "countries",
          paint: { "line-color": "#3b82f6", "line-width": 2.5 },
          filter: ["in", ["get", "ISO3166-1-Alpha-3"], ["literal", NATO_MEMBERS]],
        });
      };
      setTimeout(addNatoLayer, 600);

      /* --- Tension zones + landmarks --- */
      const tensionGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: tensionZones.map(z => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: z.coordinates } as GeoJSON.Point,
          properties: z,
        })),
      };

      map.addSource("tension-zones", { type: "geojson", data: tensionGeo });
      map.addLayer({
        id: "tension-zones-layer",
        type: "circle",
        source: "tension-zones",
        paint: {
          "circle-radius": 8,
          "circle-color": ["match", ["get", "status"], "red", "#dc2626", "amber", "#f59e0b", "landmark", "#8b5cf6", "#6b7280"],
          "circle-stroke-color": "#000",
          "circle-stroke-width": 1.5,
        },
      });

      /* --- Click on tension zones / landmarks --- */
      map.on("click", "tension-zones-layer", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const { name, status, description } = f.properties as any;
        const coords = (f.geometry as GeoJSON.Point).coordinates;

        clickPopup.current!
          .setLngLat(coords as [number, number])
          .setHTML(`<div style="color:#111;">Loading ${name}…</div>`)
          .addTo(map);

        try {
          const res = await fetch(
            `/.netlify/functions/gdelt-events?timespan=7d&keyword=${encodeURIComponent(name)}`
          );
          const data = await res.json();
          const articles: Article[] = data.articles || [];

          const statusText =
            status === "red" ? "🔴 Active Conflict" :
            status === "amber" ? "🟠 Heightened Tensions" :
            status === "landmark" ? "🟣 Strategic Asset" : "";

          const statusColor =
            status === "red" ? "#b91c1c" :
            status === "amber" ? "#c2410c" :
            status === "landmark" ? "#7c3aed" : "#6b7280";

          clickPopup.current!.setHTML(`
            <div style="max-width:340px; font-family:'IBM Plex Mono',monospace; color:#111;">
              <strong style="font-size:14px;">${name}</strong>
              <div style="font-size:12px; margin:4px 0 6px; color:${statusColor};">${statusText}</div>
              <div style="font-size:12px; color:#333; margin-bottom:8px; line-height:1.5;">${description}</div>
              ${articles.length === 0
                ? `<div style="color:#555; font-size:12px;">No recent articles found</div>`
                : `<div style="max-height:200px; overflow:auto; border-top:1px solid #ccc; padding-top:6px;">
                    ${articles.slice(0, 8).map(a => {
                      const d = parseGdeltDate(a.date);
                      return `<div style="margin-bottom:8px;">
                        <a href="${a.url}" target="_blank" style="color:${statusColor}; font-weight:600; font-size:12px;">${a.title}</a>
                        <div style="font-size:10px; color:#555;">${a.source ?? ""}${d ? " • " + d.toLocaleString() : ""}</div>
                      </div>`;
                    }).join("")}
                  </div>`
              }
            </div>
          `);
        } catch {
          clickPopup.current!.setHTML(`<div style="color:#b91c1c;">Failed to load updates</div>`);
        }
      });

      map.on("mouseenter", "tension-zones-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "tension-zones-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      map.resize();
      mapLoadedRef.current = true;
      setMapLoaded(true);
    });

    requestAnimationFrame(() => map.resize());
  }, []);

  /* ---------------- Resize observer ---------------- */
  useEffect(() => {
    const map = mapRefInstance.current;
    const container = mapRef.current;
    if (!map || !container) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ---------------- GDELT pulse layer (waits for map load) ---------------- */
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRefInstance.current;
    if (!map) return;

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}&region=eastern-flank`
        );
        const data = await res.json();
        if (!data.countries || !Array.isArray(data.countries)) return;

        const top = [...data.countries]
          .sort((a: CountryData, b: CountryData) => b.count - a.count)
          .slice(0, 8);

        const features = top
          .map((c: CountryData) => {
            const coords = countryCentroids[c.country];
            if (!coords) return null;
            return {
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: coords },
              properties: c,
            };
          })
          .filter(Boolean);

        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: features as GeoJSON.Feature[],
        };

        if (map.getLayer("top-countries-layer")) map.removeLayer("top-countries-layer");
        if (map.getSource("top-countries")) map.removeSource("top-countries");

        map.addSource("top-countries", { type: "geojson", data: geojson });
        map.addLayer({
          id: "top-countries-layer",
          type: "circle",
          source: "top-countries",
          paint: {
            "circle-radius": ["+", 5, ["min", 10, ["*", 0.3, ["get", "count"]]]],
            "circle-color": "rgba(239,68,68,0.25)",
            "circle-stroke-color": "#ef4444",
            "circle-stroke-width": 1.5,
          },
        });
      } catch (err) {
        console.error("GDELT pulse layer error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [topic, timeRange, mapLoaded]);

  return (
    <div className="p-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-widest">Topic</span>
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="bg-neutral-800 text-white text-sm rounded px-2 py-1 border border-neutral-700"
          >
            {topics.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-widest">Window</span>
          <select
            value={timeRange}
            onChange={e => setTimeRange(e.target.value)}
            className="bg-neutral-800 text-white text-sm rounded px-2 py-1 border border-neutral-700"
          >
            {timeRanges.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {loading && (
          <span className="text-xs text-red-400 animate-pulse tracking-widest uppercase">
            ● Fetching GDELT…
          </span>
        )}
      </div>

      {/* Map + Legend */}
      <div style={{ position: "relative" }}>
        {/* Legend */}
        <div style={{
          position: "absolute",
          top: 12,
          left: 12,
          backgroundColor: "rgba(10,10,10,0.85)",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "11px",
          color: "#e5e5e5",
          zIndex: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          lineHeight: "1.8",
        }}>
          <div><span style={{ color: "#dc2626" }}>●</span> Active Conflict</div>
          <div><span style={{ color: "#f59e0b" }}>●</span> Elevated Tension</div>
          <div><span style={{ color: "#8b5cf6" }}>●</span> Strategic Asset</div>
          <div><span style={{ color: "#ef4444", opacity: 0.6 }}>●</span> GDELT Activity</div>
          <div style={{ marginTop: "6px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px", color: "#3b82f6" }}>
            — NATO Member
          </div>
        </div>

        <div
          ref={mapRef}
          className="rounded-xl shadow-2xl border border-neutral-800"
          style={{ height: "580px", width: "100%" }}
        />
      </div>
    </div>
  );
}
