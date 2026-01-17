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
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [topic, setTopic] = useState("protest");
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(false);

  // Initialize MapLibre
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

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
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

        // Top 5 countries
        const topCountries: CountryData[] = [...data.countries]
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Convert to GeoJSON
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

        // Clean up old layer & source (important)
        if (map.getLayer("top-countries-layer")) {
          map.off("mouseenter", "top-countries-layer", () => {});
          map.off("mouseleave", "top-countries-layer", () => {});
          map.removeLayer("top-countries-layer");
        }
        if (map.getSource("top-countries")) {
          map.removeSource("top-countries");
        }

        // Add source + layer
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

        // Hover popup handlers
        map.on("mouseenter", "top-countries-layer", (e) => {
          map.getCanvas().style.cursor = "pointer";

          const feature = e.features?.[0];
          if (!feature) return;

          const { country, count } = feature.properties as {
            country: string;
            count: number;
          };

          const coords = (
            feature.geometry as GeoJSON.Point
          ).coordinates.slice();

          popupRef.current!
            .setLngLat(coords as [number, number])
            .setHTML(
              `<strong>${country}</strong><br/>${count} ${topic} events (${timeRange})`
            )
            .addTo(map);
        });

        map.on("mouseleave", "top-countries-layer", () => {
          map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
        });

        // Pulsing animation
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
      } catch (err) {
        console.error("Failed to fetch GDELT events:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
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