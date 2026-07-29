/**
 * HpBar.jsx — Animated sleek eSports HP meter
 *
 * Props:
 *   current  — number (current HP)
 *   max      — number (max HP)
 *   animate  — boolean (whether to use CSS transitions)
 *   showText — boolean (show "current / max" label)
 *   size     — "sm" | "md" | "lg"
 */

export default function HpBar({ current, max, animate = true, showText = true, size = "md" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;

  let barBg, glowColor, pulseClass = "";
  if (pct > 50) {
    barBg = "linear-gradient(90deg, #10B981, #34D399)"; // Emerald to Green-400
    glowColor = "rgba(16, 185, 129, 0.4)";
  } else if (pct > 20) {
    barBg = "linear-gradient(90deg, #F59E0B, #FACC15)"; // Amber to Yellow-400
    glowColor = "rgba(245, 158, 11, 0.4)";
  } else {
    barBg = "linear-gradient(90deg, #DC2626, #F87171)"; // Crimson to Red-400
    glowColor = "rgba(239, 68, 68, 0.6)";
    if (pct > 0) pulseClass = "animate-pulse";
  }

  const heights = { sm: "h-2", md: "h-3.5", lg: "h-4.5" };

  return (
    <div className="w-full">
      {showText && (
        <div className="flex justify-between items-center text-xs font-mono mb-1 tracking-wider">
          <span className="font-bold text-[var(--color-text-primary)] drop-shadow-sm flex items-center gap-1">
            HP <span style={{ color: pct > 50 ? "#34D399" : pct > 20 ? "#FACC15" : "#F87171" }}>{Math.max(0, Math.round(current))}</span>
          </span>
          <span className="text-[var(--color-text-muted)] text-[10px]">/ {max}</span>
        </div>
      )}
      <div
        className={`w-full rounded-full overflow-hidden bg-slate-950/80 border border-white/15 p-[2px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ${heights[size]}`}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`HP: ${current}/${max}`}
      >
        <div
          className={`h-full rounded-full ${pulseClass}`}
          style={{
            width: `${pct}%`,
            background: barBg,
            boxShadow: pct > 0 ? `0 0 8px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.4)` : "none",
            transition: animate ? "width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.4s ease" : "none",
          }}
        />
      </div>
    </div>
  );
}
