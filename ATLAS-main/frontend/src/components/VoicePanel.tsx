import { useRef, useState } from "react";
import Waveform from "./Waveform";

interface Props {
  onSend: (blob: Blob) => Promise<{ transcribed: string; response_text: string; intent?: string } | null>;
}

const INTENT_BADGE: Record<string, string> = {
  status:       "badge-low",
  threat_query: "badge-critical",
  report:       "badge-medium",
  approve:      "badge-low",
  deny:         "badge-high",
  firewall:     "badge-medium",
  unknown:      "",
};

export default function VoicePanel({ onSend }: Props) {
  const [recording, setRecording]     = useState(false);
  const [transcribed, setTranscribed] = useState("");
  const [response, setResponse]       = useState("");
  const [intent, setIntent]           = useState("");
  const [loading, setLoading]         = useState(false);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        stream.getTracks().forEach(t => t.stop());
        setLoading(true);
        const result = await onSend(blob);
        setLoading(false);
        if (result) {
          setTranscribed(result.transcribed);
          setResponse(result.response_text);
          setIntent(result.intent ?? "");
          try { new Audio("http://localhost:8000/voice/audio").play(); } catch {}
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      console.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className={`shrink-0 px-4 py-1.5 text-[9px] font-bold tracking-widest transition-all ${
            recording ? "neo-btn-danger neo-btn--pressed" : "neo-btn-accent"
          }`}
        >
          {recording ? "● REC" : "⬤ SPEAK"}
        </button>

        <Waveform active={recording || loading} />

        {loading && (
          <span className="text-muted text-[9px] animate-pulse tracking-wider">PROCESSING...</span>
        )}

        {intent && !loading && (
          <span className={`text-[9px] px-1.5 py-0.5 tracking-wider ${INTENT_BADGE[intent] ?? ""}`}>
            {intent.toUpperCase()}
          </span>
        )}
      </div>

      {(transcribed || response) && (
        <div className="mt-2 space-y-1 neo-inset px-2.5 py-2">
          {transcribed && (
            <div className="text-[10px] flex gap-2">
              <span className="text-muted shrink-0 w-8">YOU</span>
              <span className="text-text/70">{transcribed}</span>
            </div>
          )}
          {response && (
            <div className="text-[10px] flex gap-2 border-l border-accent pl-2">
              <span className="text-accent shrink-0 w-8">ATL</span>
              <span className="text-text">{response}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
