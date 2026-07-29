import type { AtlasEvent } from "../hooks/useAtlas";

const NODES = ["GATEWAY", "FIREWALL", "DMZ", "INTERNAL", "DB SERVER", "ADMIN"];

const threatNode = (events: AtlasEvent[]): Set<string> => {
  const hit = new Set<string>();
  for (const e of events) {
    if (e.severity === "critical" || e.severity === "high") {
      if (e.type === "ddos" || e.type === "port_scan") hit.add("GATEWAY");
      if (e.type === "sql_injection" || e.type === "xss") hit.add("DB SERVER");
      if (e.type === "brute_force") hit.add("ADMIN");
      if (e.type === "malware" || e.type === "reverse_shell") hit.add("INTERNAL");
      if (e.type === "phishing") hit.add("DMZ");
    }
  }
  return hit;
};

export default function NetworkTopology({ events }: { events: AtlasEvent[] }) {
  const threatened = threatNode(events);
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <span className="section-label">NETWORK TOPOLOGY</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-1.5">
          {NODES.map((node, i) => {
            const hot = threatened.has(node);
            return (
              <div key={node} className="flex items-center gap-2">
                {i > 0 && <div className="ml-2 text-border text-[10px]">│</div>}
                <div className={`text-[9px] px-2 py-1 tracking-wider ${
                  hot
                    ? "neo-inset border border-critical/40 text-critical"
                    : "neo-inset text-text/60"
                }`}>
                  {node}
                </div>
                {hot && <span className="text-critical text-[9px] animate-pulse">⚠</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
