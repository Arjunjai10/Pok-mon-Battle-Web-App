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
        "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
        selected
          ? "border-blue-500 bg-blue-500/15 shadow-sm shadow-blue-500/30"
          : disabled
            ? "border-[var(--color-border)] bg-transparent opacity-35 cursor-not-allowed"
            : "border-[var(--color-border)] bg-[var(--color-bg-panel)] hover:border-[var(--color-border-glow)] hover:bg-[var(--color-bg-hover)]",
      ].join(" ")}
      aria-pressed={selected}
    >
      {/* Checkbox dot */}
      <span className={[
        "flex-none w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
        selected ? "border-blue-400 bg-blue-500" : "border-[var(--color-text-muted)]",
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
          style={{ backgroundColor: "#7c3aed22", color: "#a78bfa", border: "1px solid #7c3aed55" }}>
          {move.statusEffect}
        </span>
      )}
    </button>
  );
}
