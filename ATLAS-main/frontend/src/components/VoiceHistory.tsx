interface VoiceEntry {
  transcribed?: string;
  response_text?: string;
  ts?: string;
}

export default function VoiceHistory({ history }: { history: VoiceEntry[] }) {
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <span className="section-label">VOICE HISTORY</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {history.length === 0 && <div className="text-muted text-[10px] py-2">No voice commands recorded.</div>}
        {history.map((entry, i) => (
          <div key={i} className="text-[10px] border-b border-border/30 py-2">
            {entry.ts && (
              <div className="text-muted text-[9px] mb-1 tabular-nums">{new Date(entry.ts).toLocaleTimeString()}</div>
            )}
            {entry.transcribed && (
              <div><span className="text-muted">YOU </span>{entry.transcribed}</div>
            )}
            {entry.response_text && (
              <div className="mt-0.5 border-l border-accent/40 pl-2">
                <span className="text-accent">ATL </span>
                <span className="text-text/80">{entry.response_text}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
