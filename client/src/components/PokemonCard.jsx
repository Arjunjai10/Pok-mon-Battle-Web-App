/**
 * PokemonCard.jsx
 *
 * Shows a Pokémon's animated Showdown sprite, name, types, and selection state.
 * Used in the 151-Pokémon grid on the left panel of TeamBuilder.
 */

import { TypeBadge } from "../utils/typeUtils.jsx";
import PokemonSprite from "./PokemonSprite.jsx";

export default function PokemonCard({ pokemon, selected, slotIndex, onClick, disabled }) {
  const dexNum = String(pokemon.id).padStart(3, "0");

  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      id={`pokemon-card-${pokemon.id}`}
      className={[
        "group relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all duration-200 text-left w-full overflow-hidden backdrop-blur-md",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        selected
          ? "border-blue-500 bg-blue-500/15 shadow-[0_0_20px_rgba(59,130,246,0.35)] transform -translate-y-1 z-10"
          : disabled
            ? "border-white/5 bg-slate-900/50 opacity-40 cursor-not-allowed grayscale shadow-none"
            : "border-white/10 bg-[var(--color-bg-card)]/80 shadow-[0_4px_12px_rgba(0,0,0,0.4)] hover:border-blue-400/60 hover:bg-slate-800/90 hover:shadow-[0_8px_25px_rgba(59,130,246,0.25)] hover:-translate-y-1.5 hover:z-10",
      ].join(" ")}
      aria-pressed={selected}
      aria-label={`${pokemon.name}${selected ? ` (slot ${slotIndex + 1})` : ""}`}
    >
      {/* Slot badge */}
      {selected && slotIndex !== null && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 text-white text-[0.65rem] font-black flex items-center justify-center z-20 shadow-[0_2px_6px_rgba(59,130,246,0.8)] border border-white/30">
          {slotIndex + 1}
        </span>
      )}

      {/* Hover Stats Tooltip (Desktop only) */}
      <div className="absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full w-44 bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none hidden sm:block transform group-hover:-translate-y-[calc(100%+8px)]">
        <div className="text-[10px] font-black text-center mb-1.5 text-blue-400 uppercase tracking-wider border-b border-white/10 pb-1">
          Base Stats
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.65rem]">
          {Object.entries(pokemon.baseStats).map(([key, val]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-slate-400 font-mono uppercase font-semibold">{key.substring(0, 3)}</span>
              <span className="font-bold tabular-nums text-white">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dex number */}
      <span className="text-[0.65rem] font-mono text-slate-400 font-bold tracking-wider self-start">
        #{dexNum}
      </span>

      {/* Animated Sprite */}
      <div className="relative w-16 h-16 flex items-center justify-center z-10 py-1">
        <PokemonSprite
          id={pokemon.id}
          spriteUrl={pokemon.spriteUrl}
          name={pokemon.name}
          variant="front-gif"
          animate={selected}
          className="w-full h-full object-contain group-hover:scale-115 transition-transform duration-300"
        />
      </div>

      {/* Name */}
      <span className="text-xs font-extrabold capitalize text-center leading-tight text-[var(--color-text-primary)] truncate w-full group-hover:text-blue-300 transition-colors">
        {pokemon.name.replace(/-/g, " ")}
      </span>

      {/* Types */}
      <div className="flex gap-1 flex-wrap justify-center mt-0.5">
        {pokemon.types.map((t) => (
          <TypeBadge key={t} type={t} size="xs" />
        ))}
      </div>
    </button>
  );
}
