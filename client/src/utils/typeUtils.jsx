/**
 * typeUtils.js — Type color and display helpers
 * Mirrors the CSS --color-type-* variables so JS can read them too.
 */

export const TYPE_COLORS = {
  Normal:   { bg: "#a8a878", text: "#fff" },
  Fire:     { bg: "#f08030", text: "#fff" },
  Water:    { bg: "#6890f0", text: "#fff" },
  Electric: { bg: "#f8d030", text: "#222" },
  Grass:    { bg: "#78c850", text: "#fff" },
  Ice:      { bg: "#98d8d8", text: "#222" },
  Fighting: { bg: "#c03028", text: "#fff" },
  Poison:   { bg: "#a040a0", text: "#fff" },
  Ground:   { bg: "#e0c068", text: "#222" },
  Flying:   { bg: "#a890f0", text: "#fff" },
  Psychic:  { bg: "#f85888", text: "#fff" },
  Bug:      { bg: "#a8b820", text: "#fff" },
  Rock:     { bg: "#b8a038", text: "#fff" },
  Ghost:    { bg: "#705898", text: "#fff" },
  Dragon:   { bg: "#7038f8", text: "#fff" },
};

export function getTypeColor(type) {
  return TYPE_COLORS[type] ?? { bg: "#6b7280", text: "#fff" };
}

/** Render a small colored type pill */
export function TypeBadge({ type, size = "sm" }) {
  const { bg, text } = getTypeColor(type);
  const cls = size === "xs"
    ? "px-1.5 py-0.5 text-[0.6rem]"
    : "px-2 py-0.5 text-[0.7rem]";
  return (
    <span
      className={`inline-block rounded font-bold uppercase tracking-wider ${cls}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {type}
    </span>
  );
}

/** Stat abbreviation labels */
export const STAT_LABELS = {
  hp:             "HP",
  attack:         "Atk",
  defense:        "Def",
  specialAttack:  "SpA",
  specialDefense: "SpD",
  speed:          "Spe",
};

/** Map learn method keys to human-readable labels and colours */
export const METHOD_META = {
  "level-up":                   { label: "Level Up",  color: "#4ade80" },
  "machine":                    { label: "TM / HM",   color: "#60a5fa" },
  "tutor":                      { label: "Tutor",     color: "#f59e0b" },
  "stadium-surfing-pikachu":    { label: "Stadium",   color: "#c084fc" },
};

export function getMethodMeta(methodKey) {
  return METHOD_META[methodKey] ?? { label: methodKey, color: "#9ca3af" };
}

/** Given a Pokémon's learnset entries, group moves by their learn method.
 *  Returns an ordered array of { method, label, color, moves[] } groups.
 *  Order: level-up → machine → tutor → others
 */
export function groupLearnsetByMethod(learnset) {
  const ORDER = ["level-up", "machine", "tutor", "stadium-surfing-pikachu"];
  const groups = {};

  for (const entry of learnset) {
    // A move can appear under multiple methods (e.g., level-up in RB and machine in Yellow)
    // We pick the "best" method per entry: prefer level-up, then machine, then tutor, etc.
    const sortedMethods = [...entry.methods].sort(
      (a, b) => ORDER.indexOf(a.method) - ORDER.indexOf(b.method)
    );
    const primaryMethod = sortedMethods[0]?.method ?? "machine";
    const primaryLevel  = sortedMethods[0]?.level ?? 0;

    if (!groups[primaryMethod]) groups[primaryMethod] = [];
    groups[primaryMethod].push({
      name: entry.name,
      level: primaryLevel,
      allMethods: entry.methods,
    });
  }

  // Sort level-up moves by level ascending
  if (groups["level-up"]) {
    groups["level-up"].sort((a, b) => a.level - b.level);
  }

  // Return in canonical order, skipping empty groups
  return ORDER
    .filter(m => groups[m]?.length > 0)
    .map(m => ({
      method: m,
      ...getMethodMeta(m),
      moves: groups[m],
    }));
}
