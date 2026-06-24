/**
 * MoveButton.jsx
 *
 * A selectable move button used in the detail panel's move picker.
 * Shows move name, type badge, power/accuracy/PP, and selection state.
 *
 * Props:
 *   move      — move object from moves.json
 *   selected  — boolean
 *   disabled  — boolean (4 moves already chosen and this isn't one)
 *   onClick   — () => void
 *   levelHint — string | null  e.g. "Lv.13" or "TM" for the learn method label
 */

import { TypeBadge } from "../utils/typeUtils.jsx";

export default function MoveButton({ move, selected, disabled, onClick, levelHint }) {
  const isStatus = !move.power;

  return (
    <button
      id={`move-btn-${move.name}`}
      onClick={onClick}
      disabled={disabled && !selected}
      className={[
        "move-btn w-full flex items-center gap-2 px-3 py-3 rounded-2xl text-left overflow-hidden relative",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-primary)]",
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_4px_0_var(--color-primary)] transform translate-y-0 z-10"
          : disabled
            ? "opacity-50 cursor-not-allowed grayscale shadow-none transform-none"
            : "",
      ].join(" ")}
      aria-pressed={selected}
    >
      {/* Checkbox dot */}
      <span className={[
        "flex-none w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 relative z-10",
        selected ? "border-[var(--color-primary)] bg-[var(--color-primary)] scale-110 shadow-[0_0_8px_rgba(59,130,246,0.6)]" : "border-[var(--color-border-glow)] bg-[var(--color-bg-input)]",
      ].join(" ")}>
        {selected && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>

      {/* Move name */}
      <span className="flex-1 capitalize font-medium text-sm text-[var(--color-text-primary)] truncate">
        {move.name.replace(/-/g, " ")}
      </span>

      {/* Level/TM hint */}
      {levelHint && (
        <span className="flex-none text-[0.65rem] font-mono text-[var(--color-text-muted)]">
          {levelHint}
        </span>
      )}

      {/* Type badge */}
      <TypeBadge type={move.type} size="xs" />

      {/* Stats */}
      <div className="flex-none flex gap-2 text-[0.65rem] text-[var(--color-text-secondary)] font-mono min-w-[90px] justify-end">
        <span title="Power">{move.power ?? "—"}</span>
        <span className="text-[var(--color-text-muted)]">|</span>
        <span title="Accuracy">{move.accuracy !== null ? `${move.accuracy}%` : "∞"}</span>
        <span className="text-[var(--color-text-muted)]">|</span>
        <span title="PP">{move.pp}pp</span>
      </div>

      {/* Status effect chip */}
      {move.statusEffect && (
        <span className="flex-none px-1.5 py-0.5 rounded text-[0.55rem] font-bold uppercase tracking-wider"
          style={{ backgroundColor: "#7c3aed22", color: "#7c3aed", border: "1px solid #7c3aed55" }}>
          {move.statusEffect}
        </span>
      )}
    </button>
  );
}
