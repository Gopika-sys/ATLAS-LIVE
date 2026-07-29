import { useEffect, useState } from "react";

type ThreatLevel = "low" | "medium" | "high" | "critical";

const THREAT_COLOR: Record<ThreatLevel, string> = {
  low:      "text-low",
  medium:   "text-medium",
  high:     "text-high",
  critical: "text-critical",
};

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "#4aad6f" : s >= 50 ? "#d4a843" : "#e05c5c";

function ScoreRing({ score }: { score: number }) {
  const r = 15, circ = 2 * Math.PI * r;
  const color = SCORE_COLOR(score);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2">
      <svg width="38" height="38" viewBox="0 0 38 38" style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}>
        {/* Track */}
        <circle cx="19" cy="19" r={r} fill="none" stroke="#252830" strokeWidth="2.5" />
        {/* Fill */}
        <circle
          cx="19" cy="19" r={r} fill="none"
          stroke={color} strokeWidth="2.5"
          strokeDasharray={`${circ * (pct / 100)} ${circ}`}
          strokeLinecap="butt"
          transform="rotate(-90 19 19)"
          style={{ transition: "stroke-dasharray 0.7s ease" }}
        />
        <text x="19" y="23" textAnchor="middle" fontSize="8.5" fill={color}
              fontFamily="JetBrains Mono" fontWeight="700">
          {score}
        </text>
      </svg>
      <div>
        <div className="section-label">SECURITY</div>
        <div className="section-label">SCORE</div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function StatusBar({
  score, threatLevel, connected,
}: {
  score: number;
  threatLevel: ThreatLevel;
  connected: boolean;
}) {
  const [time, setTime]       = useState(new Date().toLocaleTimeString());
  const [uptime, setUptime]   = useState(0);

  useEffect(() => {
    const clock  = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    const uptick = setInterval(() => setUptime(u => u + 1), 1000);
    return () => { clearInterval(clock); clearInterval(uptick); };
  }, []);

  const isCritical = threatLevel === "critical";
  const isHigh     = threatLevel === "high";

  return (
    <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 bg-base border-b border-border">

      {/* Brand */}
      <div className="flex items-center gap-3 mr-2">
        <span className="text-accent font-bold tracking-[0.35em] text-sm"
              style={{ textShadow: "0 0 12px #4fc3a155" }}>
          ATLAS
        </span>
        <span className="text-muted text-[9px] tracking-widest hidden xl:block">
          AUTONOMOUS THREAT &amp; LIFECYCLE ANALYSIS SYSTEM
        </span>
      </div>

      <div className="flex-1" />

      {/* Score */}
      <ScoreRing score={score} />

      {/* Divider */}
      <div className="w-px h-8 bg-border mx-1" />

      {/* Threat level — pulses red when critical */}
      <div
        className={`neo-inset px-3 py-1.5 flex items-center gap-2 transition-all ${
          isCritical ? "border border-critical/30" : isHigh ? "border border-high/20" : ""
        }`}
        style={isCritical ? { boxShadow: "inset 2px 2px 6px #0e1014, inset -1px -1px 4px #262a33, 0 0 8px #e05c5c22" } : undefined}
      >
        <div className={isCritical ? "dot-critical" : isHigh ? "dot-warn" : "dot-live"} />
        <div>
          <div className="section-label">THREAT LEVEL</div>
          <div className={`text-[10px] font-bold tracking-widest ${THREAT_COLOR[threatLevel]}`}>
            {threatLevel.toUpperCase()}
          </div>
        </div>
      </div>

      {/* WS status */}
      <div className="neo-inset px-3 py-1.5 flex items-center gap-2">
        <div className={connected ? "dot-live" : "dot-critical"} />
        <div>
          <div className="section-label">FEED</div>
          <div className={`text-[10px] font-bold tracking-wider ${connected ? "text-low" : "text-critical"}`}>
            {connected ? "LIVE" : "OFFLINE"}
          </div>
        </div>
      </div>

      {/* Uptime */}
      <div className="neo-inset px-3 py-1.5 hidden lg:block">
        <div className="section-label">UPTIME</div>
        <div className="text-[10px] font-mono tabular-nums text-text/70">{formatUptime(uptime)}</div>
      </div>

      {/* Clock */}
      <div className="neo-inset px-3 py-1.5">
        <div className="section-label">LOCAL TIME</div>
        <div className="text-[10px] font-mono tabular-nums text-text/70">{time}</div>
      </div>

    </div>
  );
}
