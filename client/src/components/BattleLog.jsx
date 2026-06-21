/**
 * BattleLog.jsx — Scrolling battle log panel
 *
 * Props:
 *   entries — string[] (newest at the end)
 */
import { useEffect, useRef } from "react";

export default function BattleLog({ entries = [] }) {
  const bottomRef = useRef(null);

  const getLogStyle = (entry) => {
    if (entry.includes("critical hit")) return "text-red-500 font-bold drop-shadow-sm";
    if (entry.includes("super effective")) return "text-orange-500 font-semibold";
    if (entry.includes("not very effective")) return "text-[var(--color-text-muted)]";
    if (entry.includes("rose!")) return "text-green-500 font-semibold";
    if (entry.includes("fell!")) return "text-red-400 font-semibold";
    if (entry.includes("fainted")) return "text-red-600 font-bold uppercase tracking-wide";
    return "text-[var(--color-text-primary)]";
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      id="battle-log"
      className="glass-card flex flex-col h-full overflow-hidden"
      aria-live="polite"
      aria-label="Battle log"
    >
      <div className="px-4 py-2 border-b border-[var(--color-border)] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]">
          Battle Log
        </span>
      </div>
      <div className="scroll-panel flex-1 px-4 py-3 space-y-1.5">
        {entries.length === 0 && (
          <p className="text-[var(--color-text-muted)] text-xs italic">
            Waiting for battle to start…
          </p>
        )}
        {entries.map((entry, i) => (
          <p
            key={i}
            className={`text-sm animate-fade-in leading-snug ${getLogStyle(entry)}`}
            style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
          >
            {entry}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
