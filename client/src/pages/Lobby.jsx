/**
 * Lobby.jsx — Phase 4 (stub for Phase 3)
 * Room creation / join UI — real implementation comes in Phase 4 with Socket.io.
 */
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function Lobby() {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("poke-team-final");
    if (!saved) { navigate("/"); return; }
    setTeam(JSON.parse(saved));
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg-deep)] gap-6">
      <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
        <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">
          🏟️ Lobby
        </h1>
        {team && (
          <div className="space-y-2">
            <p className="text-[var(--color-text-secondary)] text-sm">
              Team loaded: <strong className="text-[var(--color-success)]">{team.length} Pokémon</strong>
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {team.map((s, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <img src={s.pokemon.spriteUrl} alt={s.pokemon.name} className="w-12 h-12 object-contain" />
                  <span className="text-[0.65rem] text-[var(--color-text-muted)] capitalize">
                    {s.nickname}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[var(--color-warning)] text-sm font-medium">
          ⚠️ Lobby + Socket.io rooms coming in Phase 4
        </p>
        <button onClick={() => navigate("/")}
          className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm transition-colors">
          ← Back to Team Builder
        </button>
      </div>
    </div>
  );
}
