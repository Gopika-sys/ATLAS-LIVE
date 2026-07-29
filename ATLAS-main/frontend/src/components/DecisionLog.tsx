export type Decision = {
  reasoning_text: string;
  plan_json?: {
    approved_actions?: string[];
    pending_approval?: string[];
    recommendations?: string[];
    agent_results?: Record<string, { action?: string; severity?: string }>;
  };
  ts?: string;
};

const ACTION_COLOR: Record<string, string> = {
  escalate: "border-critical text-critical",
  execute:  "border-accent text-accent",
  resolve:  "border-low text-low",
  monitor:  "border-medium text-medium",
};

function isError(text: string) {
  return text.startsWith("Failed to parse") || text.startsWith("Unparseable") || text.includes("JSONDecodeError");
}

export default function DecisionLog({ decisions }: { decisions: Decision[] }) {
  const clean = decisions.filter(d => !isError(d.reasoning_text));

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <span className="section-label">DECISION LOG</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
      {clean.length === 0 && <div className="text-muted text-[10px]">Awaiting decisions...</div>}
      {clean.map((d, i) => {
        const plan = d.plan_json ?? {};
        const approved = plan.approved_actions ?? [];
        const pending = plan.pending_approval ?? [];
        const recs = plan.recommendations ?? [];
        const actionMatch = d.reasoning_text.match(/\b(escalate|execute|resolve|monitor|block|isolate)\b/i);
        const actionKey = actionMatch?.[1]?.toLowerCase() ?? "execute";

        return (
          <div key={i} className="mb-3 pb-3 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2 mb-1.5">
              {d.ts && <span className="text-muted text-[9px] tabular-nums">{new Date(d.ts).toLocaleTimeString()}</span>}
              <span className={`text-[9px] border px-1.5 py-0.5 tracking-wider ${ACTION_COLOR[actionKey] ?? "border-muted text-muted"}`}>
                {actionKey.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-text/80 leading-relaxed line-clamp-3">
              {d.reasoning_text.replace(/\s+/g, " ").trim()}
            </p>
            {approved.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {approved.map((a, j) => (
                  <span key={j} className="text-[9px] badge-low px-1.5 py-0.5">✓ {a}</span>
                ))}
              </div>
            )}
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {pending.map((a, j) => (
                  <span key={j} className="text-[9px] badge-high px-1.5 py-0.5">⏳ {a}</span>
                ))}
              </div>
            )}
            {recs[0] && (
              <div className="mt-1.5 text-[9px] text-accent/70 border-l border-accent/30 pl-2">
                {recs[0]}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
