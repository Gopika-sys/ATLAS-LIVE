import { useRef, useState } from "react";
import { useAtlas } from "../hooks/useAtlas";

function pad(n: number) { return n < 10 ? "0" + n : n; }
function timeStr(ts?: string) {
  const d = ts ? new Date(ts) : new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const SUGGESTIONS = [
  "system status", "show active threats", "run firewall scan",
  "generate report", "lock down network", "help",
];

export default function Voice() {
  const { state, sendVoice, sendTextCommand } = useAtlas();
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cmdText, setCmdText] = useState("");
  const [localHistory, setLocalHistory] = useState<{ transcribed?: string; response_text?: string; ts?: string }[]>([]);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const playAudio = () => {
    const audio = new Audio("http://localhost:8000/voice/audio");
    audio.play().catch(() => {});  // silently ignore if piper not installed
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        stream.getTracks().forEach(t => t.stop());
        setLoading(true);
        const r = await sendVoice(blob);
        if (r) {
          setLocalHistory(prev => [{ transcribed: r.transcribed, response_text: r.response_text, ts: new Date().toISOString() }, ...prev]);
          playAudio();
        }
        setLoading(false);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch { /* mic denied */ }
  };

  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false); };

  const handleSend = async () => {
    const text = cmdText.trim();
    if (!text) return;
    setCmdText("");
    setLoading(true);
    const r = await sendTextCommand(text);
    if (r) {
      setLocalHistory(prev => [{ transcribed: r.transcribed, response_text: r.response_text, ts: new Date().toISOString() }, ...prev]);
      playAudio();
    }
    setLoading(false);
  };

  // Merge DB history + local session history, deduplicated
  const history = [
    ...localHistory,
    ...state.voice_history.filter(h => !localHistory.some(l => l.transcribed === h.transcribed && l.ts === h.ts)),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Voice Assistant Agent</div>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 4px" }}>Voice Console</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Command ATLAS with natural language — by voice or text.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: ".8fr 1.2fr", gap: 20, alignItems: "start" }}>

        {/* Orb card */}
        <div className="neo" style={{
          padding: "30px 20px 26px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 16, textAlign: "center",
        }}>
          <div className={`orb-outer${recording ? " listening" : ""}`}>
            <span className="orb-ring" />
            <span className="orb-ring" />
            <div className="orb-core"
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2.6" width="6" height="11.4" rx="3"/>
                <path d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0"/>
                <path d="M12 17.8v3.2M9 21h6"/>
              </svg>
            </div>
          </div>

          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--muted)", minHeight: 16 }}>
            {loading ? "Processing…" : recording ? "Listening…" : "Hold to speak"}
          </div>

          <div style={{ fontSize: 11, color: "var(--faint)", maxWidth: 220, lineHeight: 1.5 }}>
            Hold the orb and speak a command, or use the text console →
          </div>

          {/* Wave bars */}
          <div style={{ display: "flex", alignItems: "center", gap: 3, height: 22 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2, background: "var(--accent)",
                height: recording ? `${8 + Math.sin(i * 0.8) * 10}px` : "5px",
                transition: "height .2s ease",
                opacity: recording ? 1 : 0.4,
              }} />
            ))}
          </div>
        </div>

        {/* Transcript + input */}
        <div className="neo" style={{ display: "flex", flexDirection: "column", height: 460 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {history.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", marginTop: 40 }}>
                ATLAS online. Hold the orb or type a command below.
              </div>
            )}
            {history.map((entry, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {entry.transcribed && (
                  <div style={{
                    alignSelf: "flex-end", maxWidth: "82%",
                    padding: "10px 14px", borderRadius: "16px 16px 4px 16px",
                    background: "linear-gradient(145deg,#3d63e6,#2c4bc4)",
                    color: "#fff", fontSize: 12.5, lineHeight: 1.5,
                  }}>
                    {entry.transcribed}
                    <div style={{ fontSize: 9, opacity: .65, marginTop: 5, fontFamily: "var(--f-mono)" }}>
                      {timeStr(entry.ts)}
                    </div>
                  </div>
                )}
                {entry.response_text && (
                  <div className="neo-inset" style={{
                    alignSelf: "flex-start", maxWidth: "82%",
                    padding: "10px 14px", borderRadius: "16px 16px 16px 4px",
                    color: "var(--ink-2)", fontSize: 12.5, lineHeight: 1.5,
                  }}>
                    {entry.response_text}
                    <div style={{ fontSize: 9, opacity: .65, marginTop: 5, fontFamily: "var(--f-mono)" }}>
                      {timeStr(entry.ts)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Suggestions */}
          <div style={{ padding: "0 16px", display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {SUGGESTIONS.map(s => (
              <button key={s} className="chip" style={{ fontSize: 10.5, padding: "5px 10px", fontFamily: "var(--f-mono)" }}
                onClick={() => setCmdText(s)}>
                {s}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div style={{
            display: "flex", gap: 10, padding: "14px 16px",
            borderTop: "1px solid var(--line)",
          }}>
            <input
              value={cmdText}
              onChange={e => setCmdText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="Type a command… e.g. 'show active threats'"
              style={{
                flex: 1, border: "none", borderRadius: 14, padding: "11px 15px",
                fontFamily: "var(--f-body)", fontSize: 12.5, outline: "none",
                background: "var(--bg-2)",
                boxShadow: "inset 3px 3px 7px var(--sh-dark-soft), inset -3px -3px 7px var(--sh-light-soft)",
                color: "var(--ink)",
              }}
            />
            <button className="btn btn-primary btn-icon" onClick={handleSend}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.4 11.6 20.6 4 13 21.2 10.4 14.2 3.4 11.6Z"/>
                <path d="M10.4 14.2 15 9.6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="neo" style={{ padding: 20 }}>
        <div className="panel-title" style={{ marginBottom: 14 }}>AI Recommendations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(state.recommendations.length > 0 ? state.recommendations : [
            "All systems nominal — continue routine monitoring",
            "Schedule next security posture review",
            "Review authentication logs for anomalies",
          ]).map((rec, i) => (
            <div key={i} className="neo-inset" style={{
              padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>▸</span>
              <span style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{rec}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
