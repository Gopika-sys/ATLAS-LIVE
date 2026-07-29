interface Props {
  recommendations: string[];
  openIncidentCount?: number;
  threatLevel?: string;
}

const FALLBACK: Record<string, string[]> = {
  critical: [
    "Isolate affected hosts from network immediately",
    "Activate incident response playbook — escalate to CISO",
    "Preserve forensic evidence before remediation",
  ],
  high: [
    "Review and tighten firewall egress rules",
    "Audit privileged account activity for last 24h",
    "Enable enhanced logging on affected systems",
  ],
  medium: [
    "Review authentication logs for anomalies",
    "Patch systems flagged in vulnerability scan",
    "Update threat intelligence feeds",
  ],
  low: [
    "All systems nominal — continue routine monitoring",
    "Schedule next security posture review",
  ],
};

export default function AIRecommendations({ recommendations, openIncidentCount = 0, threatLevel = "low" }: Props) {
  const display = recommendations.length > 0
    ? recommendations
    : openIncidentCount > 0
      ? FALLBACK[threatLevel] ?? FALLBACK.low
      : FALLBACK.low;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="section-label">AI RECOMMENDATIONS</span>
        {recommendations.length === 0 && openIncidentCount > 0 && (
          <span className="text-[9px] badge-medium px-1">AUTO</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {display.map((rec, i) => (
          <div key={i} className="flex gap-2 py-1.5 border-b border-border/20 text-[10px]">
            <span className="text-accent shrink-0">▸</span>
            <span className="text-text/80 leading-relaxed">{rec}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
