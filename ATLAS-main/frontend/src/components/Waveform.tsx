import { useEffect, useState } from "react";

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const FRAME_LEN = 8;
const IDLE_FRAME = "▁▁▁▁▁▁▁▁";
const TICK_MS = 120;

export default function Waveform({ active }: { active: boolean }) {
  const [frame, setFrame] = useState(IDLE_FRAME);

  useEffect(() => {
    if (!active) {
      setFrame(IDLE_FRAME);
      return;
    }
    const interval = setInterval(() => {
      const bars = Array.from(
        { length: FRAME_LEN },
        () => BARS[Math.floor(Math.random() * BARS.length)],
      );
      setFrame(bars.join(""));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [active]);

  return <div className="text-accent text-xl tracking-widest font-mono">{frame}</div>;
}