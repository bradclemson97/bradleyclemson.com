import { useEffect, useState } from "react";

const zones = [
  { label: "Washington", tz: "America/New_York" },
  { label: "London", tz: "Europe/London" },
  { label: "Riyadh", tz: "Asia/Riyadh" },
  { label: "Beijing", tz: "Asia/Shanghai" },
];

function formatTime(timeZone: string) {
  const now = new Date();

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(now);

  return { time, date };
}

export default function WorldClock() {
  const [times, setTimes] = useState(
    zones.map(z => ({
      ...z,
      ...formatTime(z.tz),
    }))
  );

  const [utc, setUtc] = useState(formatTime("UTC"));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimes(
        zones.map(z => ({
          ...z,
          ...formatTime(z.tz),
        }))
      );
      setUtc(formatTime("UTC"));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm px-6 py-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 items-center">

        {/* UTC Highlight */}
        <div className="text-center md:text-left border-r border-neutral-800 pr-4">
          <div className="text-xs text-red-500 tracking-widest uppercase">
            UTC
          </div>
          <div className="text-xl font-mono text-white">
            {utc.time}
          </div>
          <div className="text-[11px] text-neutral-500">
            {utc.date}
          </div>
        </div>

        {/* Regional Clocks */}
        {times.map(({ label, time, date }) => (
          <div key={label} className="text-center">
            <div className="text-xs text-neutral-400 tracking-widest uppercase">
              {label}
            </div>
            <div className="text-lg font-mono text-white">
              {time}
            </div>
            <div className="text-[11px] text-neutral-500">
              {date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}