import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Status fill colors — consistent with OsintFeed dot palette
const C_RED   = "#dc2626";
const C_AMBER = "#f59e0b";
const C_GREEN = "#22c55e";

// Chart chrome (dark surface ~ neutral-900 #171717)
const SURFACE   = "#171717";
const GRID      = "#2c2c2a";
const AXIS_INK  = "#71717a"; // zinc-500

interface DayBucket { date: string; fullDate: string; red: number; amber: number; green: number; }
interface ZoneCount  { name: string; count: number; }
interface Meta       { total: number; critical: number; days: number; }
interface TimelineData { timeline: DayBucket[]; zones: ZoneCount[]; meta: Meta; }

// ── Custom tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div style={{
      background: "#0a0a0a", border: "1px solid #27272a",
      borderRadius: 6, padding: "8px 12px",
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#e4e4e7",
    }}>
      <div style={{ marginBottom: 4, color: "#a1a1aa" }}>{label}</div>
      {[...payload].reverse().map((p: any) => (
        <div key={p.name} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, display: "inline-block" }} />
          <span style={{ color: "#a1a1aa" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #27272a", marginTop: 4, paddingTop: 4, color: "#a1a1aa" }}>
        Total: <span style={{ color: "#e4e4e7", fontWeight: 600 }}>{total}</span>
      </div>
    </div>
  );
}

// ── Custom legend ───────────────────────────────────────────────────────────
function ChartLegend() {
  const items = [
    { label: "Active Conflict", color: C_RED },
    { label: "Elevated Tension", color: C_AMBER },
    { label: "Routine Coverage", color: C_GREEN },
  ];
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
      {items.map(({ label, color }) => (
        <span key={label} style={{ display: "flex", alignItems: "center", gap: 5,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#a1a1aa" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-5 py-4 flex-1 min-w-0">
      <div className="text-xs text-neutral-500 tracking-widest uppercase mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white" style={{ fontVariantNumeric: "normal" }}>{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function NewsTimeline() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [showTable, setShowTable] = useState(false);

  const fetchData = async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/.netlify/functions/news-timeline?days=${d}`);
      const json = await res.json();
      setData(json);
    } catch {
      /* leave previous data visible */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(days); }, [days]);

  const maxZone = data?.zones[0]?.count ?? 1;

  return (
    <div className={`rounded-2xl border border-neutral-800 bg-neutral-900/40 backdrop-blur-sm shadow-2xl p-6 transition-opacity duration-300 ${loading && data ? "opacity-60" : "opacity-100"}`}>

      {/* Header + range picker */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Coverage Analytics</h2>
          <p className="text-xs text-neutral-500 mt-0.5">News frequency and zone focus · GDELT / The Guardian</p>
        </div>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                days === d
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      {data ? (
        <div className="flex gap-3 mb-6 flex-wrap">
          <StatTile label="Total Articles" value={data.meta.total} sub={`last ${data.meta.days} days`} />
          <StatTile label="Critical Stories" value={data.meta.critical} sub="active conflict" />
          <StatTile
            label="Threat Rate"
            value={data.meta.total > 0 ? `${Math.round((data.meta.critical / data.meta.total) * 100)}%` : "—"}
            sub="red / total"
          />
        </div>
      ) : loading ? (
        <div className="flex gap-3 mb-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-1 h-20 rounded-xl border border-neutral-800 bg-neutral-900/60 animate-pulse" />
          ))}
        </div>
      ) : null}

      {/* Stacked bar chart */}
      <div className="mb-1">
        <div className="text-xs text-neutral-500 uppercase tracking-widest mb-3">Stories per day by threat level</div>
        {loading && !data ? (
          <div className="h-64 rounded-lg bg-neutral-900/60 animate-pulse" />
        ) : data?.timeline.length ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={data.timeline}
                barSize={Math.max(8, Math.min(20, Math.floor(560 / data.timeline.length) - 4))}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: AXIS_INK, fontFamily: "'IBM Plex Mono', monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "#383835" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: AXIS_INK, fontFamily: "'IBM Plex Mono', monospace", tabularNums: true } as any}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                {/* bottom to top: red → amber → green; only top bar gets rounded data-end */}
                <Bar dataKey="red"   name="Active Conflict"   stackId="a" fill={C_RED}   stroke={SURFACE} strokeWidth={1} radius={[0, 0, 0, 0]} />
                <Bar dataKey="amber" name="Elevated Tension"  stackId="a" fill={C_AMBER} stroke={SURFACE} strokeWidth={1} radius={[0, 0, 0, 0]} />
                <Bar dataKey="green" name="Routine Coverage"  stackId="a" fill={C_GREEN} stroke={SURFACE} strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend />
          </>
        ) : (
          <div className="h-40 flex items-center justify-center text-neutral-500 text-sm">No data available</div>
        )}
      </div>

      {/* Zone coverage bars */}
      {data?.zones.length ? (
        <div className="mt-8">
          <div className="text-xs text-neutral-500 uppercase tracking-widest mb-3">Zone coverage · article mentions</div>
          <div className="space-y-2.5" role="table" aria-label="Zone coverage counts">
            {data.zones.map(z => (
              <div key={z.name} className="flex items-center gap-3" role="row">
                <div className="w-40 text-xs text-neutral-400 truncate shrink-0 font-mono" role="rowheader">{z.name}</div>
                <div className="flex-1 h-4 bg-neutral-800 rounded-sm overflow-hidden" role="cell">
                  <div
                    className="h-full rounded-sm transition-all duration-500"
                    style={{
                      width: `${Math.max(2, Math.round((z.count / maxZone) * 100))}%`,
                      background: "#3987e5", // palette sequential slot 1 dark
                    }}
                  />
                </div>
                <div className="w-8 text-right text-xs text-neutral-400 font-mono tabular-nums" role="cell">{z.count}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Accessible table view */}
      {data?.timeline.length ? (
        <div className="mt-6 border-t border-neutral-800 pt-4">
          <button
            onClick={() => setShowTable(t => !t)}
            className="text-xs text-neutral-500 hover:text-neutral-300 font-mono transition-colors"
          >
            {showTable ? "▲ hide table" : "▼ show data table"}
          </button>
          {showTable && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs font-mono text-neutral-400 border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800">
                    <th className="text-left py-1.5 pr-4 text-neutral-500 font-normal">Date</th>
                    <th className="text-right py-1.5 pr-4 text-red-500 font-normal">Conflict</th>
                    <th className="text-right py-1.5 pr-4 text-amber-500 font-normal">Tension</th>
                    <th className="text-right py-1.5 pr-4 text-green-500 font-normal">Routine</th>
                    <th className="text-right py-1.5 text-neutral-500 font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.timeline].reverse().map(row => (
                    <tr key={row.fullDate} className="border-b border-neutral-900">
                      <td className="py-1 pr-4 tabular-nums">{row.fullDate}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{row.red}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{row.amber}</td>
                      <td className="py-1 pr-4 text-right tabular-nums">{row.green}</td>
                      <td className="py-1 text-right tabular-nums">{row.red + row.amber + row.green}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
