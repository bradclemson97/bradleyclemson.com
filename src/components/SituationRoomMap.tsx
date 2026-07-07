import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/* ---------------- NATO Members (ISO-3) ---------------- */
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
      "Active high-intensity warfare across eastern and southern Ukraine following Russia's full-scale invasion in February 2022. Front lines stretch ~1,000 km across Donetsk, Zaporizhzhia, and Kherson oblasts."
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
      "Russian exclave between Poland and Lithuania, housing Iskander-M ballistic missiles (range ~500 km), Baltic Fleet assets, and S-400 air defence systems. A persistent flashpoint for NATO's eastern flank."
  },
  {
    name: "Suwalki Corridor",
    status: "amber",
    coordinates: [23.3, 54.3],
    description:
      "A 65 km land corridor between Kaliningrad and Belarus linking Poland and Lithuania — NATO's most strategically vulnerable chokepoint. Russian seizure would sever the Baltic states from the Alliance overland."
  },
  {
    name: "Belarus-Poland Border",
    status: "amber",
    coordinates: [23.6, 52.6],
    description:
      "Ongoing hybrid warfare: the Lukashenko regime weaponises migration flows to pressure Poland, Lithuania, and Latvia. Russian forces exercise regularly from Belarusian territory near Brest and Grodno."
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

interface Article { title: string; url: string; source?: string; date?: string; }

/* ---------------- Component ---------------- */
export default function SituationRoomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefInstance = useRef<maplibregl.Map | null>(null);
  const clickPopup = useRef<maplibregl.Popup | null>(null);

  /* ---------------- Map init (once) ---------------- */
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
    clickPopup.current = new maplibregl.Popup({ maxWidth: "360px", closeButton: true });

    map.on("load", () => {
      /* --- Countries source --- */
      map.addSource("countries", {
        type: "geojson",
        data: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
      });

      /* --- NATO fill layer (subtle highlight) --- */
      setTimeout(() => {
        if (!map.getSource("countries") || map.getLayer("nato-fill")) return;
        map.addLayer({
          id: "nato-fill",
          type: "fill",
          source: "countries",
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.06 },
          filter: ["in", ["get", "ISO3166-1-Alpha-3"], ["literal", NATO_MEMBERS]],
        });
        map.addLayer({
          id: "nato-borders",
          type: "line",
          source: "countries",
          paint: { "line-color": "#3b82f6", "line-width": 2 },
          filter: ["in", ["get", "ISO3166-1-Alpha-3"], ["literal", NATO_MEMBERS]],
        });
      }, 600);

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

      /* Glow / halo layer behind the dots */
      map.addLayer({
        id: "tension-zones-halo",
        type: "circle",
        source: "tension-zones",
        paint: {
          "circle-radius": 16,
          "circle-color": ["match", ["get", "status"], "red", "#dc2626", "amber", "#f59e0b", "landmark", "#8b5cf6", "#6b7280"],
          "circle-opacity": 0.15,
          "circle-blur": 1,
        },
        filter: ["!=", ["get", "status"], "landmark"],
      });

      /* Main dot layer */
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

      /* --- Cursor change on hover --- */
      map.on("mouseenter", "tension-zones-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "tension-zones-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      /* --- Click → fetch Guardian articles --- */
      map.on("click", "tension-zones-layer", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const { name, status, description } = f.properties as any;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];

        clickPopup.current!
          .setLngLat(coords)
          .setHTML(`
            <div style="font-family:'IBM Plex Mono',monospace; color:#111; max-width:340px;">
              <strong style="font-size:14px;">${name}</strong>
              <div style="font-size:11px; margin-top:4px; color:#666;">Loading latest articles…</div>
            </div>
          `)
          .addTo(map);

        const statusColor =
          status === "red" ? "#b91c1c" :
          status === "amber" ? "#c2410c" :
          status === "landmark" ? "#7c3aed" : "#6b7280";

        const statusText =
          status === "red" ? "🔴 Active Conflict" :
          status === "amber" ? "🟠 Elevated Tension" :
          status === "landmark" ? "🟣 Strategic Asset" : "";

        try {
          const res = await fetch(
            `/.netlify/functions/gdelt-events?keyword=${encodeURIComponent(name)}`
          );
          const data = await res.json();
          const articles: Article[] = data.articles ?? [];

          clickPopup.current!.setHTML(`
            <div style="max-width:340px; font-family:'IBM Plex Mono',monospace; color:#111;">
              <strong style="font-size:14px;">${name}</strong>
              <div style="font-size:12px; margin:4px 0 6px; color:${statusColor};">${statusText}</div>
              <div style="font-size:12px; color:#333; margin-bottom:8px; line-height:1.5;">${description}</div>
              ${articles.length === 0
                ? `<div style="color:#666; font-size:12px;">No recent articles found</div>`
                : `<div style="max-height:220px; overflow:auto; border-top:1px solid #ddd; padding-top:8px;">
                    ${articles.map(a => {
                      const d = a.date ? new Date(a.date).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "";
                      return `<div style="margin-bottom:10px;">
                        <a href="${a.url}" target="_blank" rel="noopener" style="color:${statusColor}; font-weight:600; font-size:12px; line-height:1.4; text-decoration:none;">${a.title}</a>
                        <div style="font-size:10px; color:#666; margin-top:2px;">${a.source ?? ""}${d ? " · " + d : ""}</div>
                      </div>`;
                    }).join("")}
                  </div>`
              }
            </div>
          `);
        } catch {
          clickPopup.current!.setHTML(`
            <div style="font-family:'IBM Plex Mono',monospace; color:#111; max-width:340px;">
              <strong style="font-size:14px;">${name}</strong>
              <div style="font-size:12px; color:${statusColor}; margin:4px 0 6px;">${statusText}</div>
              <div style="font-size:12px; color:#333; line-height:1.5;">${description}</div>
            </div>
          `);
        }
      });

      map.resize();
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

  return (
    <div className="p-4">
      {/* Map + Legend */}
      <div style={{ position: "relative" }}>
        {/* Legend */}
        <div style={{
          position: "absolute",
          top: 12,
          left: 12,
          backgroundColor: "rgba(8,8,8,0.88)",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "11px",
          color: "#e5e5e5",
          zIndex: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          lineHeight: "2",
        }}>
          <div><span style={{ color: "#dc2626" }}>●</span> Active Conflict</div>
          <div><span style={{ color: "#f59e0b" }}>●</span> Elevated Tension</div>
          <div><span style={{ color: "#8b5cf6" }}>●</span> Strategic Asset</div>
          <div style={{ marginTop: "6px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px", color: "#3b82f6" }}>
            — NATO Member
          </div>
          <div style={{ marginTop: "4px", fontSize: "10px", color: "#555" }}>
            Click any marker for news
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
