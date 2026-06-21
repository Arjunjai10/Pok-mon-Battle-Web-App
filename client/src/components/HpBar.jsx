/**
 * HpBar.jsx — Animated HP bar
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

  const barColor = pct > 50
    ? "var(--color-success)"       // green
    : pct > 20
      ? "var(--color-accent)"      // yellow
      : "var(--color-danger)";     // red

  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" };

  return (
    <div className="w-full">
      {showText && (
        <div className="flex justify-between text-xs font-mono mb-1"
          style={{ color: "var(--color-text-secondary)" }}>
          <span style={{ color: barColor }}>{Math.max(0, Math.round(current))}</span>
          <span style={{ color: "var(--color-text-muted)" }}>/ {max}</span>
        </div>
      )}
      <div
        className={`w-full rounded-full overflow-hidden ${heights[size]}`}
        style={{ backgroundColor: "var(--color-border)" }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`HP: ${current}/${max}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: barColor,
            transition: animate ? "width 0.6s ease, background-color 0.4s ease" : "none",
            boxShadow: `0 0 6px 1px ${barColor}55`,
          }}
        />
      </div>
    </div>
  );
}
