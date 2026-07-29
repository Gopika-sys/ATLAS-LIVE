interface Props {
  memoryIncidents: number;
  recurringThreats: Record<string, number>;
}

export default function MemoryPanel({ memoryIncidents, recurringThreats }: Props) {
  const recurring = Object.entries(recurringThreats).sort(([, a], [, b]) => b - a);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <span className="section-label">ATLAS MEMORY</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex justify-between text-[10px] mb-2">
          <span className="text-muted">INCIDENTS LEARNED</span>
          <span className="text-accent tabular-nums">{memoryIncidents}</span>
        </div>
        {recurring.length > 0 && (
          <>
            <div className="section-label mb-1 mt-2">RECURRING THREATS</div>
            {recurring.map(([type, count]) => (
              <div key={type} className="flex justify-between text-[10px] py-0.5">
                <span className="text-high">{type.replace(/_/g, " ")}</span>
                <span className="text-muted tabular-nums">{count}×</span>
              </div>
            ))}
          </>
        )}
        {recurring.length === 0 && (
          <div className="text-muted text-[10px]">No recurring patterns detected yet.</div>
        )}
      </div>
    </div>
  );
}
