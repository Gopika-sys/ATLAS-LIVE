interface BlockedEntry {
  agent_name?: string;
  action?: string;
  params?: Record<string, unknown>;
  ts?: string;
}

function extractIP(entry: BlockedEntry): string | null {
  const p = entry.params ?? {};
  return (
    (p.target_ip as string) ||
    (p.source_ip as string) ||
    ((p.reasoning as string)?.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0]) ||
    null
  );
}

export default function BlockedIPs({ entries }: { entries: BlockedEntry[] }) {
  const ips = entries
    .map((e) => ({ ip: extractIP(e), ts: e.ts, agent: e.agent_name }))
    .filter((e) => e.ip);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="section-label">BLOCKED IPs</span>
        <span className="ml-auto badge-critical text-[9px] px-1.5 py-0.5">{ips.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {ips.length === 0 && <div className="text-muted text-[10px] py-2">No IPs blocked yet.</div>}
        {ips.map((entry, i) => (
          <div key={i} className="text-[10px] py-1.5 border-b border-border/30 flex justify-between items-center gap-2">
            <span className="text-critical font-mono">{entry.ip}</span>
            <div className="flex flex-col items-end gap-0.5">
              {entry.agent && <span className="text-muted text-[9px]">{entry.agent}</span>}
              {entry.ts && <span className="text-muted text-[9px] tabular-nums">{new Date(entry.ts).toLocaleTimeString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
