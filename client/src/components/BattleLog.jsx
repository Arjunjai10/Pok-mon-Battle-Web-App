/**
 * BattleLog.jsx — Scrolling telemetry battle log panel
 *
 * Props:
 *   entries — string[] (newest at the end)
 */
import { useEffect, useRef } from "react";

export default function BattleLog({ entries = [] }) {
  const bottomRef = useRef(null);

  const getLogStyle = (entry) => {
    const text = entry.toLowerCase();
    if (text.includes("critical hit")) return "text-red-400 font-black drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]";
    if (text.includes("super effective")) return "text-amber-400 font-extrabold drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]";
    if (text.includes("not very effective")) return "text-slate-500 font-medium italic";
    if (text.includes("rose!") || text.includes("buff") || text.includes("boosted")) return "text-emerald-400 font-bold";
    if (text.includes("fell!") || text.includes("reduced")) return "text-rose-400 font-semibold";
    if (text.includes("fainted")) return "text-red-500 font-black uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 inline-block my-0.5";
    if (text.includes("started") || text.includes("sent out") || text.includes("switched")) return "text-blue-300 font-extrabold";
    return "text-slate-200 font-medium";
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      id="battle-log"
      className="bg-slate-900/95 border border-white/15 rounded-3xl flex flex-col h-full overflow-hidden shadow-[0_15px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl text-left"
      aria-live="polite"
      aria-label="Battle log"
    >
      <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-950/80 shadow-inner">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
            <span>📡</span> Live Match Telemetry
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded-md border border-white/5">
          GEN-1 ENGINE
        </span>
      </div>

      <div className="scroll-panel flex-1 px-5 py-4 space-y-2 overflow-y-auto custom-scrollbar bg-slate-950/40 text-sm font-mono leading-relaxed">
        {entries.length === 0 && (
          <p className="text-slate-600 text-xs italic font-sans flex items-center justify-center h-full">
            Waiting for battle telemetry...
          </p>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`animate-fade-in transition-all ${getLogStyle(entry)}`}
            style={{ animationDelay: `${Math.min(i * 15, 150)}ms` }}
          >
            <span className="text-slate-600 text-[11px] font-bold mr-2 select-none">❯</span>
            {entry}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
