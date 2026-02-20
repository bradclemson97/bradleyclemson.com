import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { countryCentroids } from "../data/countryCentroids";

/* ---------------- NATO (ISO-3) ---------------- */
const NATO_MEMBERS = [
  "USA","CAN","GBR","FRA","-99","DEU","ITA","ESP","PRT","NLD","BEL","LUX",
  "NOR","DNK","ISL","POL","CZE","SVK","HUN","ROU","BGR","HRV","SVN",
  "ALB","MNE","MKD","GRC","TUR","LTU","LVA","EST","FIN","SWE"
];

/* ---------------- Tension Zones ---------------- */
const tensionZones = [
  {
    name: "Sudan civil war",
    status: "red",
    coordinates: [30, 15],
    description:
      "Ongoing conflict between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF) since April 2023. Fighting has displaced millions and destabilized Khartoum and Darfur."
  },
  {
    name: "Syrian civil war",
    status: "red",
    coordinates: [38, 35],
    description:
      "Multi-sided conflict beginning in 2011 involving the Assad government, rebel factions, Kurdish forces, ISIS remnants, and foreign actors including Russia, Iran, Turkey, and the US."
  },
  {
    name: "Ukraine / Russia",
    status: "red",
    coordinates: [36, 49],
    description:
      "Full-scale Russian invasion launched in February 2022 following the 2014 annexation of Crimea. Ongoing high-intensity warfare across eastern and southern Ukraine."
  },
  {
    name: "India / Pakistan",
    status: "amber",
    coordinates: [74, 32],
    description:
      "Longstanding territorial dispute over Kashmir. Periodic cross-border firing and political escalation between two nuclear-armed states."
  },
  {
    name: "Israel / Gaza",
    status: "amber",
    coordinates: [34.8, 31.5],
    description:
      "Escalating conflict between Israel and Hamas following October 2023 attacks. Ongoing military operations and regional tensions."
  },
  {
    name: "Greenland",
    status: "amber",
    coordinates: [-42, 72],
    description:
      "Strategic Arctic region gaining geopolitical importance due to climate change, resource competition, and US-China-Russia interest."
  },
  {
    name: "Thailand / Cambodia",
    status: "amber",
    coordinates: [102.5, 14.5],
    description:
      "Periodic border tensions centered around disputed temple sites and nationalist political rhetoric."
  },
  {
    name: "Taiwan",
    status: "amber",
    coordinates: [121, 23.7],
    description:
      "Rising cross-strait tensions as China increases military pressure while Taiwan strengthens international partnerships."
  },
  {
    name: "Iran",
    status: "amber",
    coordinates: [53.688, 32.4279],
    description:
      "Heightened tensions involving Iran’s nuclear program, regional proxy conflicts, and confrontation with Israel and the United States."
  },
];

interface CountryData { country: string; count: number; }
interface Article { title: string; url: string; source?: string; date?: string; }

const topics = ["protest", "cyber", "election", "sanctions", "military", "disaster"];
const timeRanges = ["6h", "24h", "7d"];

/* ---------------- GDELT date parser ---------------- */
function parseGdeltDate(seenDate?: string) {
  if(!seenDate || seenDate.length!==14) return null;
  const y=seenDate.slice(0,4), m=seenDate.slice(4,6), d=seenDate.slice(6,8);
  const h=seenDate.slice(8,10), min=seenDate.slice(10,12), s=seenDate.slice(12,14);
  return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
}

/* ---------------- Component ---------------- */
export default function SituationRoomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefInstance = useRef<maplibregl.Map|null>(null);
  const clickPopup = useRef<maplibregl.Popup|null>(null);

  const [topic,setTopic] = useState("protest");
  const [timeRange,setTimeRange] = useState("24h");
  const [loading,setLoading] = useState(false);
  const [showNato, setShowNato] = useState(true);

  useEffect(()=>{
    if(!mapRef.current || mapRefInstance.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style:"https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center:[0,20],
      zoom:1.5
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRefInstance.current = map;

    clickPopup.current = new maplibregl.Popup({ maxWidth:"360px" });

    map.on("load", ()=>{

      /* ---------- Countries source ---------- */
      map.addSource("countries", {
        type:"geojson",
        data:"https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
      });

      /* ---------- Add NATO borders layer after source loaded ---------- */
      const addNatoLayer = () => {
        if(!map.getSource("countries")) return;
        if(!map.getLayer("nato-borders")){

          map.addLayer({
            id: "nato-borders",
            type: "line",
            source: "countries",
            paint: {
              "line-color": "#3b82f6",
              "line-width": 3
            },
            filter: [
              "in",
              ["get", "ISO3166-1-Alpha-3"],
              ["literal", NATO_MEMBERS]
            ]
          });


        }
      };
      setTimeout(addNatoLayer, 500);

      /* ---------- Tension zones layer ---------- */
      const tensionGeo = {
        type:"FeatureCollection",
        features:tensionZones.map(z=>({
          type:"Feature",
          geometry:{ type:"Point", coordinates:z.coordinates },
          properties:z
        }))
      };

      map.addSource("tension-zones",{ type:"geojson", data:tensionGeo });

      map.addLayer({
        id:"tension-zones-layer",
        type:"circle",
        source:"tension-zones",
        paint:{
          "circle-radius":7,
          "circle-color":["match",["get","status"],"red","#dc2626","amber","#f59e0b","#6b7280"],
          "circle-stroke-color":"#000",
          "circle-stroke-width":1.5
        }
      });

      /* ---------- Tension zones click ---------- */
      map.on("click","tension-zones-layer", async (e)=>{
        const f = e.features?.[0]; if(!f) return;
        const {name,status,description} = f.properties as any;
        const coords = (f.geometry as GeoJSON.Point).coordinates;

        clickPopup.current!.setLngLat(coords as [number,number])
          .setHTML(`<div class="text-neutral-400">Loading ${name}…</div>`)
          .addTo(map);

        try{
          const res = await fetch(`/.netlify/functions/gdelt-events?timespan=7d&keyword=${encodeURIComponent(name)}`);
          const data = await res.json();
          const articles:Article[] = data.articles||[];

          clickPopup.current!.setHTML(
            `
            <div style="max-width:340px;">
              <strong style="font-size:14px;">${name}</strong>
              <div style="font-size:12px;margin:4px 0 6px 0;">
                ${status==="red"?"🔴 Active Conflict":"🟠 Heightened Tensions"}
              </div>

              <div style="font-size:12px;color:#d1d5db;margin-bottom:8px;line-height:1.4;">
                ${description}
              </div>

              ${
                articles.length === 0
                  ? `<div class="text-neutral-400 text-sm">No recent articles</div>`
                  : `<div style="max-height:200px;overflow:auto;border-top:1px solid #333;padding-top:6px;">
                      ${articles.slice(0,8).map(a=>{
                        const d=parseGdeltDate(a.date);
                        return `
                          <div style="margin-bottom:8px;">
                            <a href="${a.url}" target="_blank"
                               style="color:#f87171;font-weight:600;font-size:12px;">
                               ${a.title}
                            </a>
                            <div style="font-size:10px;color:#9ca3af;">
                              ${a.source??""}${d?" • "+d.toLocaleString():""}
                            </div>
                          </div>
                        `;
                      }).join("")}
                    </div>`
              }
            </div>
            `
          );
        }catch{
          clickPopup.current!.setHTML(`<div class="text-red-400">Failed to load updates</div>`);
        }
      });
        map.resize();
    });
    requestAnimationFrame(() => map.resize());
  },[]);

/* ---------------- Resize for mobile  ---------------- */
    useEffect(() => {
      const map = mapRefInstance.current;
      const container = mapRef.current;
      if (!map || !container) return;

      const observer = new ResizeObserver(() => {
        map.resize();
      });

      observer.observe(container);

      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const map = mapRefInstance.current;
      if (!map) return;

      if (map.getLayer("nato-borders")) {
        map.setLayoutProperty(
          "nato-borders",
          "visibility",
          showNato ? "visible" : "none"
        );
      }
      if (map.getLayer("nato-borders-glow")) {
        map.setLayoutProperty(
          "nato-borders-glow",
          "visibility",
          showNato ? "visible" : "none"
        );
      }
    }, [showNato]);


  /* ---------------- NATO toggle ---------------- */
  useEffect(()=>{
    const map = mapRefInstance.current;
    if(!map || !map.getLayer("nato-borders")) return;
    map.setLayoutProperty("nato-borders","visibility",showNato?"visible":"none");
  },[showNato]);

  /* ---------------- GDELT pulse layer ---------------- */
  useEffect(()=>{
    const map = mapRefInstance.current;
    if(!map) return;

    const t = setTimeout(async ()=>{
      setLoading(true);
      try{
        const res = await fetch(`/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}`);
        const data = await res.json();
        if(!data.countries) return;

        const top = [...data.countries].sort((a:CountryData,b:CountryData)=>b.count-a.count).slice(0,5);
        const geojson = { type:"FeatureCollection", features: top.map(c=>{
          const coords = countryCentroids[c.country];
          if(!coords) return null;
          return { type:"Feature", geometry:{ type:"Point", coordinates:coords }, properties:c };
        }).filter(Boolean)};

        if(map.getLayer("top-countries-layer")) map.removeLayer("top-countries-layer");
        if(map.getSource("top-countries")) map.removeSource("top-countries");

        map.addSource("top-countries",{ type:"geojson", data:geojson });

        map.addLayer({
          id:"top-countries-layer",
          type:"circle",
          source:"top-countries",
          paint:{
            "circle-radius":["+",3,["min",4,["*",0.25,["get","count"]]]],
            "circle-color":"rgba(255,255,255,0.7)",
            "circle-stroke-color":"#ffffff",
            "circle-stroke-width":1.5
          }
        });

        map.on("mouseenter","top-countries-layer",()=>map.getCanvas().style.cursor="pointer");
        map.on("mouseleave","top-countries-layer",()=>map.getCanvas().style.cursor="");

        map.on("click","top-countries-layer",async(e)=>{
          const f = e.features?.[0]; if(!f) return;
          const {country} = f.properties as any;
          const coords = (f.geometry as GeoJSON.Point).coordinates;

          clickPopup.current!.setLngLat(coords as [number,number])
            .setHTML(`<div class="text-sm text-neutral-400">Loading news…</div>`)
            .addTo(map);

          try{
            const res = await fetch(`/.netlify/functions/gdelt-events?topic=${topic}&timespan=${timeRange}&country=${encodeURIComponent(country)}`);
            const data = await res.json();
            const articles:Article[] = data.articles||[];
            clickPopup.current!.setHTML(
              articles.slice(0,8).map(a=>{
                const d=parseGdeltDate(a.date);
                return `<div style="margin-bottom:8px;"><a href="${a.url}" target="_blank" style="color:#f87171;font-weight:600;">${a.title}</a><div style="font-size:11px;color:#9ca3af;">${a.source??""}${d?" • "+d.toLocaleString():""}</div></div>`;
              }).join("")
            );
          }catch{
            clickPopup.current!.setHTML(`<div class="text-sm text-red-400">Failed to load articles</div>`);
          }
        });

        /* ---------- Pulse animation ---------- */
        let frame=0;
        const animate=()=>{
          if(!map.getLayer("top-countries-layer")) return;
          frame+=0.04;
          map.setPaintProperty("top-countries-layer","circle-radius",["+",3,["min",4,["*",0.25,["get","count"]]],["*",1.5,Math.sin(frame)]]);
          requestAnimationFrame(animate);
        };
        animate();

      }finally{ setLoading(false); }
    },300);

    return ()=>clearTimeout(t);
  },[topic,timeRange]);

  return (
    <div>
      <div className="flex gap-4 mb-4 items-center">
        <select value={topic} onChange={e=>setTopic(e.target.value)} className="bg-neutral-800 text-white rounded px-2 py-1">
          {topics.map(t=><option key={t}>{t}</option>)}
        </select>

        <select value={timeRange} onChange={e=>setTimeRange(e.target.value)} className="bg-neutral-800 text-white rounded px-2 py-1">
          {timeRanges.map(t=><option key={t}>{t}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm text-blue-400">
          <input type="checkbox" checked={showNato} onChange={e=>setShowNato(e.target.checked)} className="accent-blue-500"/>
          NATO
        </label>

        {loading && <div className="text-red-400">Loading…</div>}
      </div>

      <div ref={mapRef} className="rounded-xl shadow-2xl border border-neutral-800" style={{height:"600px", width:"100%"}}/>
    </div>
  );
}