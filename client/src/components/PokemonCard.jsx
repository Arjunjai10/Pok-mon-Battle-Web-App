/**
 * PokemonCard.jsx
 *
 * Shows a Pokémon's sprite, name, types, and selection state.
 * Used in the 151-Pokémon grid on the left panel of TeamBuilder.
 *
 * Props:
 *   pokemon    — pokemon object from pokemon.json
 *   selected   — boolean: is this mon on the team?
 *   slotIndex  — number (0-5) or null: which team slot this occupies
 *   onClick    — () => void
 *   disabled   — boolean: team is full and this mon isn't selected
 */

import { TypeBadge } from "../utils/typeUtils.jsx";

export default function PokemonCard({ pokemon, selected, slotIndex, onClick, disabled }) {
  const dexNum = String(pokemon.id).padStart(3, "0");

  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      id={`pokemon-card-${pokemon.id}`}
      className={[
        "group relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all duration-200 text-left w-full",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
        selected
          ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20"
          : disabled
            ? "border-[var(--color-border)] bg-[var(--color-bg-card)] opacity-40 cursor-not-allowed"
            : "border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-glow)] hover:bg-[var(--color-bg-hover)] hover:-translate-y-0.5",
      ].join(" ")}
      aria-pressed={selected}
      aria-label={`${pokemon.name}${selected ? ` (slot ${slotIndex + 1})` : ""}`}
    >
      {/* Slot badge */}
      {selected && slotIndex !== null && (
        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-500 text-white text-[0.6rem] font-bold flex items-center justify-center z-10 shadow">
          {slotIndex + 1}
        </span>
      )}

      {/* Hover Stats Tooltip (Desktop only) */}
      <div className="absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full w-44 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] rounded-lg p-2 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none hidden sm:block">
        <div className="text-[10px] font-bold text-center mb-1.5 text-[var(--color-primary)] uppercase tracking-wider border-b border-[var(--color-border)] pb-1">Base Stats</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.65rem]">
          {Object.entries(pokemon.baseStats).map(([key, val]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)] font-mono uppercase">{key.substring(0,3)}</span>
              <span className="font-bold tabular-nums text-[var(--color-text-primary)]">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dex number */}
      <span className="text-[0.6rem] font-mono text-[var(--color-text-muted)]">#{dexNum}</span>

      {/* Sprite */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <img
          src={pokemon.spriteUrl}
          alt={pokemon.name}
          loading="lazy"
          className={[
            "w-full h-full object-contain transition-transform duration-200",
            selected ? "scale-110 drop-shadow-lg" : "group-hover:scale-105",
          ].join(" ")}
          onError={e => { e.target.style.opacity = "0.3"; }}
        />
      </div>

      {/* Name */}
      <span className="text-[0.72rem] font-semibold capitalize text-center leading-tight text-[var(--color-text-primary)] truncate w-full text-center">
        {pokemon.name.replace(/-/g, " ")}
      </span>

      {/* Types */}
      <div className="flex gap-1 flex-wrap justify-center">
        {pokemon.types.map(t => (
          <TypeBadge key={t} type={t} size="xs" />
        ))}
      </div>
    </button>
  );
}
