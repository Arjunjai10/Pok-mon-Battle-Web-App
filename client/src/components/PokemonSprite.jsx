/**
 * PokemonSprite.jsx
 *
 * Universal Pokémon sprite and animated GIF renderer with multi-stage fallback protection.
 * Powers authentic front/back battling animations, team rosters, and hero showcases.
 *
 * Props:
 *   id         — Pokémon ID (number or string)
 *   spriteUrl  — Optional existing sprite/artwork URL
 *   name       — Name for alt attribution
 *   variant    — 'front-gif' (default) | 'back-gif' | 'artwork' | 'icon'
 *   className  — Custom Tailwind class names for sizing and layout
 *   style      — Custom inline styles
 *   animate    — Optional hover/float animation flag
 */

import { useState, useEffect, useMemo } from "react";

export default function PokemonSprite({
  id,
  spriteUrl,
  name = "Pokemon",
  variant = "front-gif",
  className = "w-full h-full object-contain",
  style = {},
  animate = false,
}) {
  const [errorStep, setErrorStep] = useState(0);

  // Extract ID if not directly provided but available via spriteUrl
  const cleanId = useMemo(() => {
    if (id !== undefined && id !== null && id !== "") {
      return String(id).trim();
    }
    if (spriteUrl) {
      const match = spriteUrl.match(/\/(\d+)\.(png|gif|webp)$/i);
      if (match) return match[1];
    }
    return "1"; // Default to Bulbasaur as emergency fallback
  }, [id, spriteUrl]);

  // Reset fallback sequence if ID or variant changes
  useEffect(() => {
    setErrorStep(0);
  }, [cleanId, variant]);

  // Generate ordered cascade of URLs depending on requested variant
  const srcCascade = useMemo(() => {
    const showdownFront = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${cleanId}.gif`;
    const showdownBack = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/back/${cleanId}.gif`;
    const officialArtwork =
      spriteUrl && spriteUrl.includes("official-artwork")
        ? spriteUrl
        : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${cleanId}.png`;
    const staticFront = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${cleanId}.png`;
    const staticBack = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${cleanId}.png`;

    switch (variant) {
      case "back-gif":
        return [showdownBack, staticBack, officialArtwork, staticFront];
      case "artwork":
        return [officialArtwork, showdownFront, staticFront];
      case "icon":
        return [staticFront, showdownFront, officialArtwork];
      case "front-gif":
      default:
        return [showdownFront, officialArtwork, staticFront];
    }
  }, [cleanId, spriteUrl, variant]);

  const currentSrc = srcCascade[Math.min(errorStep, srcCascade.length - 1)];

  // Pixelate GIFs and standard sprites, keep artwork smooth
  const isPixelArt = currentSrc && (currentSrc.endsWith(".gif") || currentSrc.includes("/sprites/pokemon/") || currentSrc.includes("showdown"));

  const handleError = () => {
    if (errorStep < srcCascade.length - 1) {
      setErrorStep((prev) => prev + 1);
    }
  };

  const combinedClasses = [
    className,
    animate ? "animate-float transition-transform duration-300" : "transition-transform duration-300",
  ].join(" ");

  return (
    <img
      src={currentSrc}
      alt={name}
      loading="lazy"
      onError={handleError}
      className={combinedClasses}
      style={{
        imageRendering: isPixelArt ? "pixelated" : "auto",
        filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45))",
        ...style,
      }}
    />
  );
}
