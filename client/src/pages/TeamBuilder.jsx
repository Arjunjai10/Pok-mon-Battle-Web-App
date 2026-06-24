/**
 * TeamBuilder.jsx — Phase 3
 *
 * Three-panel layout:
 *   LEFT   — Searchable/filterable 151-Pokémon grid
 *   CENTRE — Detail panel: sprite, stats, move picker (grouped by method), held item
 *   RIGHT  — Team roster (6 slots) + Proceed button
 *
 * Validation before proceeding:
 *   ✓ Exactly 6 Pokémon selected
 *   ✓ Every Pokémon has exactly 4 moves (no duplicates enforced by the Set)
 *   ✓ Held item is optional (can be null)
 *
 * Team state is persisted to localStorage so it survives a page refresh.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePokeData } from "../hooks/usePokeData.js";
import PokemonCard from "../components/PokemonCard.jsx";
import MoveButton from "../components/MoveButton.jsx";
import HpBar from "../components/HpBar.jsx";
import { TypeBadge, STAT_LABELS, groupLearnsetByMethod, getMethodMeta } from "../utils/typeUtils.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import AuthModal from "../components/AuthModal.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_SIZE = 6;
const MOVES_PER_MON = 4;

const EMPTY_SLOT = null;

function emptySlots() {
  return Array(TEAM_SIZE).fill(EMPTY_SLOT);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatMoveName(name) {
  return name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function statBar(value, max = 255) {
  const pct = Math.round((value / max) * 100);
  const color = value >= 100 ? "#4ade80" : value >= 70 ? "#60a5fa" : value >= 50 ? "#f59e0b" : "#f87171";
  return { pct, color };
}

// ── Team slot validation ───────────────────────────────────────────────────────

function validateTeam(team) {
  const errors = [];
  const filledSlots = team.filter(Boolean);

  if (filledSlots.length < TEAM_SIZE) {
    errors.push(`Select ${TEAM_SIZE - filledSlots.length} more Pokémon to complete your team.`);
  }

  filledSlots.forEach((slot) => {
    if (slot.moves.length < MOVES_PER_MON) {
      errors.push(
        `${capitalize(slot.pokemon.name)} needs ${MOVES_PER_MON - slot.moves.length} more move${slot.moves.length === MOVES_PER_MON - 1 ? "" : "s"}.`
      );
    }
  });

  return errors;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TeamBuilder() {
  const navigate = useNavigate();
  const { pokemon, moves, items, moveIndex, loading, error } = usePokeData();

  // ── Team state: array of 6 slots, each null or { pokemon, moves: string[], item: string|null, nickname: string }
  const [team, setTeam] = useState(() => {
    try {
      const saved = localStorage.getItem("poke-team");
      return saved ? JSON.parse(saved) : emptySlots();
    } catch { return emptySlots(); }
  });

  // ── Which Pokémon is open in the detail panel
  const [activePokemon, setActivePokemon] = useState(null);

  // ── Auth state
  const { user, logout, saveTeam, loadTeam, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Search / filter state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // ── Persist team to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("poke-team", JSON.stringify(team));
  }, [team]);

  // ── Auto-load team from server if empty
  useEffect(() => {
    if (user && !authLoading) {
      const isTeamEmpty = team.every(slot => slot === null);
      if (isTeamEmpty) {
        loadTeam().then(savedTeam => {
          if (savedTeam && savedTeam.length > 0) {
            setTeam(savedTeam);
          }
        }).catch(err => console.error("Auto-load failed", err));
      }
    }
  }, [user, authLoading]);

  // ── Computed: which pokemon IDs are on the team
  const teamPokemonIds = useMemo(
    () => new Set(team.filter(Boolean).map((s) => s.pokemon.id)),
    [team]
  );

  // ── Computed: slot index for a given pokemon id
  const slotIndexFor = useCallback(
    (id) => team.findIndex((s) => s?.pokemon.id === id),
    [team]
  );

  // ── Computed: filtered pokemon list
  const filteredPokemon = useMemo(() => {
    let list = pokemon;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.includes(q) || String(p.id).padStart(3, "0").includes(q)
      );
    }
    if (typeFilter) {
      list = list.filter((p) => p.types.includes(typeFilter));
    }
    return list;
  }, [pokemon, search, typeFilter]);

  // ── All unique types for the filter dropdown
  const allTypes = useMemo(() => {
    const s = new Set();
    pokemon.forEach((p) => p.types.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [pokemon]);

  // ── Active slot (for the detail panel)
  const activeSlot = useMemo(
    () => activePokemon ? team.find((s) => s?.pokemon.id === activePokemon.id) ?? null : null,
    [team, activePokemon]
  );

  const activeMoves = activeSlot?.moves ?? [];
  const activeItem = activeSlot?.item ?? null;
  const activeNickname = activeSlot?.nickname ?? "";

  // ── Learnset grouped by method (memoized per activePokemon)
  const learnsetGroups = useMemo(() => {
    if (!activePokemon) return [];
    return groupLearnsetByMethod(activePokemon.learnset);
  }, [activePokemon]);

  // ── Team is full?
  const teamFull = teamPokemonIds.size >= TEAM_SIZE;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectPokemon = useCallback(
    (mon) => {
      // Open detail panel regardless
      setActivePokemon(mon);

      // If already on team → just open detail
      if (teamPokemonIds.has(mon.id)) return;

      // Team is full → do nothing (card is disabled)
      if (teamFull) return;

      // Add to first empty slot
      setTeam((prev) => {
        const next = [...prev];
        const emptyIdx = next.findIndex((s) => s === null);
        if (emptyIdx === -1) return prev;
        next[emptyIdx] = { pokemon: mon, moves: [], item: null, nickname: "" };
        return next;
      });
    },
    [teamPokemonIds, teamFull]
  );

  const handleRemovePokemon = useCallback(
    (monId) => {
      setTeam((prev) => prev.map((s) => (s?.pokemon.id === monId ? null : s)));
      if (activePokemon?.id === monId) setActivePokemon(null);
    },
    [activePokemon]
  );

  const handleToggleMove = useCallback(
    (moveName) => {
      if (!activePokemon) return;
      setTeam((prev) =>
        prev.map((s) => {
          if (s?.pokemon.id !== activePokemon.id) return s;
          const has = s.moves.includes(moveName);
          if (has) {
            return { ...s, moves: s.moves.filter((m) => m !== moveName) };
          }
          if (s.moves.length >= MOVES_PER_MON) return s; // already 4
          return { ...s, moves: [...s.moves, moveName] };
        })
      );
    },
    [activePokemon]
  );

  const handleSetItem = useCallback(
    (itemName) => {
      if (!activePokemon) return;
      setTeam((prev) =>
        prev.map((s) =>
          s?.pokemon.id === activePokemon.id
            ? { ...s, item: s.item === itemName ? null : itemName }
            : s
        )
      );
    },
    [activePokemon]
  );

  const handleSetNickname = useCallback(
    (nickname) => {
      if (!activePokemon) return;
      setTeam((prev) =>
        prev.map((s) =>
          s?.pokemon.id === activePokemon.id ? { ...s, nickname } : s
        )
      );
    },
    [activePokemon]
  );

  const handleReorderSlot = useCallback((fromIdx, toIdx) => {
    setTeam((prev) => {
      const next = [...prev];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      return next;
    });
  }, []);

  // ── Proceed to Lobby ──────────────────────────────────────────────────────────

  const validationErrors = useMemo(() => validateTeam(team), [team]);
  const canProceed = validationErrors.length === 0;

  const handleProceed = () => {
    if (!canProceed) return;
    // Serialize team for Lobby: include full move objects for the engine
    const serialized = team.filter(Boolean).map((slot) => ({
      pokemon: slot.pokemon,
      moves: slot.moves.map((mName) => moveIndex.get(mName)).filter(Boolean),
      item: slot.item,
      nickname: slot.nickname || capitalize(slot.pokemon.name.replace(/-/g, " ")),
    }));
    sessionStorage.setItem("poke-team-final", JSON.stringify(serialized));
    navigate("/lobby");
  };

  const handleSaveTeam = async () => {
    if (!user || !canProceed) return;
    try {
      setIsSaving(true);
      await saveTeam(team);
      alert('Team saved to your account!');
    } catch (err) {
      alert('Failed to save team: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-deep)] overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-none flex items-center justify-between px-6 py-4 bg-[var(--color-danger)] border-b-4 border-red-700 z-30 sticky top-0 shadow-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-inner">
            <span className="text-2xl drop-shadow-sm">⚔️</span>
          </div>
          <div>
            <h1 className="font-display font-extrabold text-3xl text-white leading-none tracking-wide drop-shadow-md">
              Pokémon Battle
            </h1>
            <p className="text-[0.75rem] font-bold text-red-200 mt-1 uppercase tracking-widest drop-shadow-sm">Gen I • Team Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-black text-white hidden sm:block bg-red-800/40 px-3 py-1 rounded-full border border-red-700/50">
            <span className={teamPokemonIds.size === TEAM_SIZE ? "text-[var(--color-accent)]" : "text-white"}>
              {teamPokemonIds.size}
            </span>
            <span className="text-red-200"> / {TEAM_SIZE} Selected</span>
          </span>
          
          {/* User Profile / Login */}
          <div className="border-l border-red-700/50 pl-4 ml-2">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-white uppercase tracking-wider">{user.username}</span>
                <button 
                  onClick={logout}
                  className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs font-bold rounded-lg border border-red-800 transition-colors uppercase"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-white text-[var(--color-danger)] font-black text-sm uppercase tracking-widest rounded-xl border-b-4 border-red-200 hover:-translate-y-0.5 active:translate-y-0 active:border-b-0 transition-all shadow-sm"
              >
                Login
              </button>
            )}
          </div>
          
          <button
            id="proceed-btn"
            onClick={handleProceed}
            disabled={!canProceed}
            title={validationErrors[0] ?? "Go to Lobby"}
            className={[
              "px-6 py-2.5 rounded-full font-extrabold text-sm transition-all duration-200 border-2",
              canProceed
                ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] text-black border-yellow-600 shadow-[0_4px_0_#ca8a04] hover:-translate-y-1 hover:shadow-[0_6px_0_#ca8a04] active:translate-y-1 active:shadow-none"
                : "bg-red-400 text-red-800 border-red-500 cursor-not-allowed shadow-none",
            ].join(" ")}
          >
            Go to Lobby →
          </button>
        </div>
      </header>

      {/* ── Body: three panels ── */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

        {/* ══ LEFT: Pokémon Grid ══════════════════════════════════════════════ */}
        <aside className={`flex-col w-full lg:w-64 flex-none border-r border-[var(--color-border)] bg-[var(--color-bg-card)] ${activePokemon ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search + filter */}
          <div className="p-3 space-y-2 border-b border-[var(--color-border)]">
            <input
              id="pokemon-search"
              type="search"
              placeholder="Search name or #…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-glow)] transition-colors"
            />
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
              <button 
                onClick={() => setTypeFilter("")}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${typeFilter === "" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-bg-deep)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-panel)]"}`}
              >
                All
              </button>
              {allTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap uppercase tracking-wider transition-colors border ${typeFilter === t ? "text-white" : "text-white/50 hover:text-white"}`}
                  style={{ 
                    backgroundColor: typeFilter === t ? `var(--color-type-${t.toLowerCase()})` : `color-mix(in srgb, var(--color-type-${t.toLowerCase()}) 30%, transparent)`,
                    borderColor: `var(--color-type-${t.toLowerCase()})`
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[0.65rem] text-[var(--color-text-muted)] text-right">
              {filteredPokemon.length} Pokémon
            </p>
          </div>

          {/* Grid */}
          <div className="scroll-panel flex-1 p-2">
            <div className="grid grid-cols-2 gap-1.5">
              {filteredPokemon.map((mon) => {
                const slotIdx = slotIndexFor(mon.id);
                const isSelected = slotIdx !== -1;
                return (
                  <PokemonCard
                    key={mon.id}
                    pokemon={mon}
                    selected={isSelected}
                    slotIndex={isSelected ? slotIdx : null}
                    onClick={() => handleSelectPokemon(mon)}
                    disabled={teamFull && !isSelected}
                  />
                );
              })}
            </div>
          </div>
        </aside>

        {/* ══ CENTRE: Detail Panel ═════════════════════════════════════════════ */}
        <main className={`flex-1 overflow-hidden flex-col ${activePokemon ? 'flex' : 'hidden lg:flex'}`}>
          {!activePokemon ? (
            <EmptyDetailPrompt />
          ) : (
            <DetailPanel
              pokemon={activePokemon}
              slot={activeSlot}
              activeMoves={activeMoves}
              activeItem={activeItem}
              activeNickname={activeNickname}
              learnsetGroups={learnsetGroups}
              moveIndex={moveIndex}
              items={items}
              onToggleMove={handleToggleMove}
              onSetItem={handleSetItem}
              onSetNickname={handleSetNickname}
              onRemove={() => handleRemovePokemon(activePokemon.id)}
              isOnTeam={teamPokemonIds.has(activePokemon.id)}
              onBack={() => setActivePokemon(null)}
            />
          )}
        </main>

        {/* ══ RIGHT: Team Roster (Desktop) - REMOVED for unified bottom dock ═════════════════════════════════════ */}
      </div>

      {/* ══ BOTTOM: Persistent Team Dock ══════════════════════════════════════════ */}
      <div className="flex-none border-t-4 border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-4 z-40 relative shadow-[0_-8px_0_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          
          <div className="flex items-center gap-6 w-full sm:w-auto">
            <div className="hidden sm:block">
              <div className="text-sm font-extrabold text-[var(--color-text-primary)] uppercase tracking-widest">
                Your Team
              </div>
              <div className="text-xs font-bold text-[var(--color-text-muted)] mt-1 bg-[var(--color-bg-deep)] inline-block px-2 py-0.5 rounded-md">
                {teamPokemonIds.size}/6 Ready
              </div>
            </div>
            
            <div className="flex gap-3 overflow-x-auto pb-2 sm:pb-0 custom-scrollbar w-full sm:w-auto justify-center sm:justify-start pt-2">
              {team.map((slot, idx) => (
                <button 
                  key={idx} 
                  onClick={() => slot && setActivePokemon(slot.pokemon)} 
                  className={`w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-200 border-4 relative ${slot ? 'bg-white cursor-pointer hover:-translate-y-2 hover:shadow-[0_4px_0_var(--color-border)]' : 'bg-[var(--color-bg-deep)] opacity-80 cursor-default border-dashed border-[var(--color-border)]'} ${activePokemon?.id === slot?.pokemon?.id ? 'border-[var(--color-primary)] shadow-[0_4px_0_var(--color-primary)] bg-blue-50 scale-110 -translate-y-2' : slot ? 'border-[var(--color-border)]' : ''}`}
                >
                   {slot ? (
                     <>
                       <img src={slot.pokemon.spriteUrl} alt={slot.pokemon.name} className="w-10 h-10 sm:w-12 sm:h-12 object-contain drop-shadow-md z-10 hover:animate-float" />
                     </>
                   ) : (
                     <div className="text-xl font-bold text-[var(--color-text-muted)] opacity-40">{idx + 1}</div>
                   )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
            {validationErrors.length > 0 && (
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--color-danger)] text-right hidden sm:block animate-fade-in bg-red-50 px-2 py-1 rounded border border-red-200">
                {validationErrors[0]}
              </div>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              {user && (
                <button
                  onClick={handleSaveTeam}
                  disabled={!canProceed || isSaving}
                  className={`w-full sm:w-auto px-6 py-3.5 rounded-full font-black uppercase tracking-widest text-sm transition-all duration-200 border-4 ${canProceed ? 'bg-[var(--color-bg-card)] border-[var(--color-primary)] text-[var(--color-primary)] hover:-translate-y-1 shadow-[0_6px_0_var(--color-primary)] active:translate-y-1 active:shadow-none' : 'bg-[var(--color-bg-deep)] text-[var(--color-text-muted)] cursor-not-allowed border-[var(--color-border)] shadow-none'}`}
                >
                  {isSaving ? "Saving..." : "Save Team"}
                </button>
              )}
              <button 
                onClick={handleProceed}
                disabled={!canProceed}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-full font-black uppercase tracking-widest text-sm transition-all duration-200 border-4 ${canProceed ? 'bg-[var(--color-primary)] border-blue-700 text-white hover:-translate-y-1 shadow-[0_6px_0_#1d4ed8] active:translate-y-1 active:shadow-none' : 'bg-[var(--color-bg-deep)] text-[var(--color-text-muted)] cursor-not-allowed border-[var(--color-border)] shadow-none'}`}
              >
                {canProceed ? "Ready for Battle →" : "Incomplete Team"}
              </button>
            </div>
          </div>
          
          
        </div>
      </div>
      
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EmptyDetailPrompt() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="text-7xl opacity-20">🔴</div>
      <p className="text-[var(--color-text-secondary)] text-sm">
        Select a Pokémon from the left to view its details and build its moveset.
      </p>
      <p className="text-[var(--color-text-muted)] text-xs">
        Pick 6 Pokémon · Assign 4 moves each · Choose a held item
      </p>
    </div>
  );
}

function DetailPanel({
  pokemon, slot, activeMoves, activeItem, activeNickname,
  learnsetGroups, moveIndex, items,
  onToggleMove, onSetItem, onSetNickname, onRemove, isOnTeam, onBack
}) {
  const [moveSearch, setMoveSearch] = useState("");

  const stats = pokemon.baseStats;
  const movesNeeded = MOVES_PER_MON - activeMoves.length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Top: Pokémon header ── */}
      <div className="flex-none flex items-start gap-4 px-4 sm:px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-panel)] relative">
        {/* Mobile Back Button */}
        <button 
          className="lg:hidden absolute top-2 right-4 text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] uppercase tracking-wider border border-[var(--color-border)] px-2 py-1 rounded bg-[var(--color-bg-deep)]"
          onClick={onBack}
        >
          Close
        </button>

        {/* Sprite */}
        <div className="relative flex-none">
          <img
            src={pokemon.spriteUrl}
            alt={pokemon.name}
            className="w-28 h-28 object-contain drop-shadow-xl"
          />
          {isOnTeam && (
            <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[var(--color-success)] flex items-center justify-center text-white text-xs font-bold shadow">
              ✓
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[0.7rem] font-mono text-[var(--color-text-muted)]">
              #{String(pokemon.id).padStart(3, "0")}
            </span>
            {pokemon.types.map(t => <TypeBadge key={t} type={t} />)}
          </div>

          {/* Nickname input */}
          {isOnTeam ? (
            <div className="mb-2">
              <input
                id={`nickname-${pokemon.id}`}
                type="text"
                placeholder={capitalize(pokemon.name.replace(/-/g, " "))}
                value={activeNickname}
                onChange={e => onSetNickname(e.target.value.slice(0, 16))}
                maxLength={16}
                className="text-xl font-display font-bold bg-transparent border-b border-dashed border-[var(--color-border-glow)] text-[var(--color-text-primary)] focus:outline-none placeholder:text-[var(--color-text-secondary)] w-full"
              />
            </div>
          ) : (
            <h2 className="text-xl font-display font-bold capitalize text-[var(--color-text-primary)] mb-2">
              {pokemon.name.replace(/-/g, " ")}
            </h2>
          )}

          {/* Base stats */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {Object.entries(stats).map(([key, val]) => {
              const { pct, color } = statBar(val);
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[0.65rem] font-mono text-[var(--color-text-muted)] w-7">
                    {STAT_LABELS[key]}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, transition: "width 0.4s ease" }} />
                  </div>
                  <span className="text-[0.65rem] font-mono w-7 text-right" style={{ color }}>{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Remove button */}
        {isOnTeam && (
          <button
            id={`remove-pokemon-${pokemon.id}`}
            onClick={onRemove}
            title="Remove from team"
            className="flex-none text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Tabs: Moves | Item ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <MoveItemTabs
          pokemon={pokemon}
          isOnTeam={isOnTeam}
          activeMoves={activeMoves}
          activeItem={activeItem}
          moveSearch={moveSearch}
          onMoveSearch={setMoveSearch}
          learnsetGroups={learnsetGroups}
          moveIndex={moveIndex}
          items={items}
          onToggleMove={onToggleMove}
          onSetItem={onSetItem}
          movesNeeded={movesNeeded}
        />
      </div>
    </div>
  );
}

function MoveItemTabs({
  pokemon, isOnTeam, activeMoves, activeItem,
  moveSearch, onMoveSearch,
  learnsetGroups, moveIndex, items,
  onToggleMove, onSetItem, movesNeeded,
}) {
  const [tab, setTab] = useState("moves");

  // Filter moves by search
  const filteredGroups = useMemo(() => {
    if (!moveSearch.trim()) return learnsetGroups;
    const q = moveSearch.toLowerCase();
    return learnsetGroups
      .map(g => ({
        ...g,
        moves: g.moves.filter(m => m.name.includes(q)),
      }))
      .filter(g => g.moves.length > 0);
  }, [learnsetGroups, moveSearch]);

  return (
    <>
      {/* Tab bar */}
      <div className="flex-none flex border-b border-[var(--color-border)] px-6">
        {["moves", "item"].map(t => (
          <button
            key={t}
            id={`tab-${t}`}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2.5 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
            ].join(" ")}
          >
            {t === "moves" ? `Moves (${activeMoves.length}/${MOVES_PER_MON})` : "Held Item"}
          </button>
        ))}

        {/* Move search (only on moves tab) */}
        {tab === "moves" && (
          <div className="ml-auto flex items-center py-1.5">
            <input
              id="move-search"
              type="search"
              placeholder="Filter moves…"
              value={moveSearch}
              onChange={e => onMoveSearch(e.target.value)}
              className="px-2.5 py-1 rounded-md bg-[var(--color-bg-deep)] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-glow)] w-40"
            />
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 scroll-panel px-6 py-4">
        {tab === "moves" ? (
          <MovePicker
            isOnTeam={isOnTeam}
            activeMoves={activeMoves}
            filteredGroups={filteredGroups}
            moveIndex={moveIndex}
            onToggleMove={onToggleMove}
            movesNeeded={movesNeeded}
          />
        ) : (
          <ItemPicker
            isOnTeam={isOnTeam}
            activeItem={activeItem}
            items={items}
            onSetItem={onSetItem}
          />
        )}
      </div>
    </>
  );
}

function MovePicker({ isOnTeam, activeMoves, filteredGroups, moveIndex, onToggleMove, movesNeeded }) {
  const activeMoveSet = new Set(activeMoves);
  const movesFull = activeMoves.length >= MOVES_PER_MON;

  if (!isOnTeam) {
    return (
      <p className="text-[var(--color-text-muted)] text-sm italic py-4">
        Add this Pokémon to your team first to assign moves.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Live Moveset Preview Card */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => {
          const mName = activeMoves[i];
          const m = mName ? moveIndex.get(mName) : null;
          return m ? (
            <button
              key={`preview-${i}`}
              onClick={() => onToggleMove(mName)}
              className="flex flex-col items-start justify-center px-3 py-2 rounded-lg border text-left transition-transform hover:scale-[1.02] active:scale-95 group relative overflow-hidden"
              style={{
                borderColor: `var(--color-type-${m.type.toLowerCase()})`,
                backgroundColor: `color-mix(in srgb, var(--color-type-${m.type.toLowerCase()}) 15%, var(--color-bg-panel))`,
              }}
              title="Click to remove"
            >
              <div className="absolute inset-0 bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <span className="text-[var(--color-danger)] font-bold text-xs uppercase tracking-widest drop-shadow-sm">Remove</span>
              </div>
              <div className="flex justify-between w-full items-baseline group-hover:opacity-10 transition-opacity">
                <span className="font-bold text-[var(--color-text-primary)] text-sm truncate">{formatMoveName(m.name)}</span>
                <span className="text-[0.6rem] font-mono text-[var(--color-text-secondary)] ml-1 flex-shrink-0">PP {m.pp}/{m.pp}</span>
              </div>
              <div className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider font-bold group-hover:opacity-10 transition-opacity">
                {m.type} • {m.power ? `PWR ${m.power}` : "STATUS"}
              </div>
            </button>
          ) : (
            <div key={`empty-${i}`} className="flex items-center justify-center px-3 py-2 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg-deep)] opacity-50 h-[52px]">
              <span className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-widest font-bold">Empty Slot</span>
            </div>
          );
        })}
      </div>

      {/* Grouped move lists */}
      {filteredGroups.length === 0 ? (
        <p className="text-[var(--color-text-muted)] text-sm italic">No moves match your search.</p>
      ) : (
        filteredGroups.map((group) => (
          <div key={group.method}>
            {/* Group header */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full flex-none"
                style={{ backgroundColor: group.color }}
              />
              <span
                className="text-[0.7rem] font-bold uppercase tracking-widest"
                style={{ color: group.color }}
              >
                {group.label}
              </span>
              <span className="text-[0.65rem] text-[var(--color-text-muted)]">
                ({group.moves.length})
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: `${group.color}30` }} />
            </div>

            {/* Move buttons */}
            <div className="space-y-1">
              {group.moves.map((entry) => {
                const moveData = moveIndex.get(entry.name);
                if (!moveData) return null;
                const isSelected = activeMoveSet.has(entry.name);
                const isDisabled = movesFull && !isSelected;

                // Level hint
                const levelHint = group.method === "level-up" && entry.level > 0
                  ? `Lv.${entry.level}`
                  : group.method === "machine" ? "TM" : null;

                return (
                  <MoveButton
                    key={entry.name}
                    move={moveData}
                    selected={isSelected}
                    disabled={isDisabled}
                    onClick={() => onToggleMove(entry.name)}
                    levelHint={levelHint}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ItemPicker({ isOnTeam, activeItem, items, onSetItem }) {
  if (!isOnTeam) {
    return (
      <p className="text-[var(--color-text-muted)] text-sm italic py-4">
        Add this Pokémon to your team first to assign a held item.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* No item option */}
      <button
        id="item-none"
        onClick={() => onSetItem(null)}
        className={[
          "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all",
          !activeItem
            ? "border-[var(--color-border-glow)] bg-[var(--color-bg-hover)]"
            : "border-[var(--color-border)] bg-[var(--color-bg-panel)] hover:border-[var(--color-border-glow)]",
        ].join(" ")}
      >
        <span className="text-2xl">🚫</span>
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No Item</p>
          <p className="text-[0.65rem] text-[var(--color-text-muted)]">Hold nothing</p>
        </div>
        {!activeItem && <span className="ml-auto text-[var(--color-primary)]">✓</span>}
      </button>

      {items.map((item) => {
        const isSelected = activeItem === item.name;
        return (
          <button
            key={item.name}
            id={`item-${item.name}`}
            onClick={() => onSetItem(item.name)}
            className={[
              "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all",
              isSelected
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                : "border-[var(--color-border)] bg-[var(--color-bg-panel)] hover:border-[var(--color-border-glow)] hover:bg-[var(--color-bg-hover)]",
            ].join(" ")}
          >
            {item.spriteUrl ? (
              <img src={item.spriteUrl} alt={item.displayName} className="w-8 h-8 object-contain" />
            ) : (
              <span className="w-8 h-8 flex items-center justify-center text-xl">🎒</span>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"}`}>
                {item.displayName}
              </p>
              <p className="text-[0.65rem] text-[var(--color-text-muted)] truncate">
                {item.shortEffect}
              </p>
            </div>
            {isSelected && <span className="flex-none text-[var(--color-accent)]">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function TeamSlot({ index, slot, isActive, onClick, onRemove, moveIndex }) {
  if (!slot) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--color-border)] opacity-40">
        <span className="w-5 h-5 rounded-full border border-[var(--color-border)] flex items-center justify-center text-[0.6rem] text-[var(--color-text-muted)]">
          {index + 1}
        </span>
        <span className="text-[0.7rem] text-[var(--color-text-muted)]">Empty slot</span>
      </div>
    );
  }

  const { pokemon, moves, item, nickname } = slot;
  const displayName = nickname || capitalize(pokemon.name.replace(/-/g, " "));
  const movesReady = moves.length === MOVES_PER_MON;

  return (
    <div
      className={[
        "relative rounded-xl border transition-all duration-150 overflow-hidden cursor-pointer",
        isActive
          ? "border-[var(--color-primary)] shadow-lg shadow-blue-500/20"
          : "border-[var(--color-border)] hover:border-[var(--color-border-glow)]",
      ].join(" ")}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
      id={`team-slot-${index}`}
    >
      <div className="flex items-center gap-2 p-2">
        {/* Slot number */}
        <span className="flex-none w-5 h-5 rounded-full bg-[var(--color-bg-deep)] flex items-center justify-center text-[0.6rem] font-bold text-[var(--color-text-muted)]">
          {index + 1}
        </span>

        {/* Sprite (small) */}
        <img
          src={pokemon.spriteUrl}
          alt={pokemon.name}
          className="flex-none w-10 h-10 object-contain"
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[0.75rem] font-semibold text-[var(--color-text-primary)] truncate">
            {displayName}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {/* Move readiness dots */}
            {Array.from({ length: MOVES_PER_MON }).map((_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: i < moves.length ? "var(--color-primary)" : "var(--color-border)",
                }}
              />
            ))}
            {item && <span className="ml-1 text-[0.6rem] text-[var(--color-accent)]">🎒</span>}
          </div>
        </div>

        {/* Readiness icon */}
        <span className="flex-none text-sm" title={movesReady ? "Ready" : "Needs moves"}>
          {movesReady ? "✅" : "⚠️"}
        </span>

        {/* Remove */}
        <button
          id={`remove-slot-${index}`}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg-deep)] gap-4">
      <div className="w-16 h-16 rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)] animate-spin" />
      <p className="text-[var(--color-text-secondary)] font-medium">Loading Pokémon data…</p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg-deep)] gap-3">
      <span className="text-5xl">❌</span>
      <p className="text-[var(--color-danger)] font-medium">Failed to load data</p>
      <p className="text-[var(--color-text-muted)] text-sm">{message}</p>
    </div>
  );
}
