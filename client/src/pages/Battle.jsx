/**
 * Battle.jsx — Phase 4 (stub for Phase 3)
 */
import { useNavigate } from "react-router-dom";

export default function Battle() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg-deep)] gap-4">
      <p className="text-[var(--color-text-secondary)]">⚔️ Battle — coming in Phase 4</p>
      <button onClick={() => navigate("/")} className="text-sm text-[var(--color-primary)] hover:underline">
        ← Back to Team Builder
      </button>
    </div>
  );
}
