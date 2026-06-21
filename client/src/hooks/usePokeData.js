/**
 * usePokeData.js
 *
 * Loads pokemon.json, moves.json, and items.json from the server's /data/ endpoint
 * (served as static files by Express in Phase 4) or directly imported as modules
 * during development via Vite's JSON import support.
 *
 * For Phase 3 (frontend only, no server yet) we import directly from the local
 * server/data path using a Vite alias. For Phase 4 they'll be served by Express.
 *
 * Returns { pokemon, moves, items, moveIndex, loading, error }
 *   pokemon   — array of 151 Pokémon objects
 *   moves     — array of 164 move objects
 *   items     — array of 13 item objects
 *   moveIndex — Map<moveName, moveObject> for O(1) lookups
 */

import { useState, useEffect } from "react";

export function usePokeData() {
  const [data, setData] = useState({ pokemon: [], moves: [], items: [], moveIndex: new Map() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        // In dev: Vite serves files from the project root; we proxy /data to server.
        // In Phase 3 standalone: fetch from relative paths (Vite dev server must
        // expose them, or use the public/ symlink). We use dynamic import for now.
        const backendUrl = import.meta.env.VITE_SERVER_URL || "";
        const [pokemonMod, movesMod, itemsMod] = await Promise.all([
          fetch(`${backendUrl}/data/pokemon.json`).then(r => { if (!r.ok) throw new Error("Failed to load pokemon.json"); return r.json(); }),
          fetch(`${backendUrl}/data/moves.json`).then(r => { if (!r.ok) throw new Error("Failed to load moves.json"); return r.json(); }),
          fetch(`${backendUrl}/data/items.json`).then(r => { if (!r.ok) throw new Error("Failed to load items.json"); return r.json(); }),
        ]);

        const moveIndex = new Map(movesMod.map(m => [m.name, m]));
        setData({ pokemon: pokemonMod, moves: movesMod, items: itemsMod, moveIndex });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { ...data, loading, error };
}
