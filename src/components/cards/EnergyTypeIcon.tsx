/**
 * Small circular badge representing a Pokémon elemental (energy) type.
 *
 * Renders the icon set supplied in public/energy-icons/ (added at the
 * user's request, replacing the original abstract letterform badges).
 * File names use the app's own type vocabulary, which matches TCGdex's
 * `Types` union exactly (Colorless/Darkness/Dragon/Fairy/Fighting/Fire/
 * Grass/Lightning/Metal/Psychic/Water) — no per-type mapping table is
 * needed beyond a straightforward lowercase of the type name.
 */
import type { CSSProperties } from "react";
import Image from "next/image";

const ICON_FILE_BY_TYPE: Record<string, string> = {
  Grass: "grass",
  Fire: "fire",
  Water: "water",
  Lightning: "lightning",
  Psychic: "psychic",
  Fighting: "fighting",
  Darkness: "darkness",
  Metal: "metal",
  Fairy: "fairy",
  Dragon: "dragon",
  Colorless: "colorless",
};

export function energyIconSrc(type: string): string | null {
  const file = ICON_FILE_BY_TYPE[type];
  return file ? `/energy-icons/${file}.png` : null;
}

type EnergyTypeIconProps = {
  type: string;
  size?: number;
  className?: string;
  /** Extra offset so several icons can be stacked with a slight overlap. */
  style?: CSSProperties;
};

export function EnergyTypeIcon({ type, size = 20, className = "", style }: EnergyTypeIconProps) {
  const src = energyIconSrc(type);

  if (!src) {
    // Unknown/unrecognized type string — fall back to a plain neutral
    // badge rather than a broken image, same defensive spirit as the
    // old DEFAULT_STYLE fallback.
    return (
      <span
        role="img"
        aria-label={`${type} energy type`}
        title={`${type} energy type`}
        className={`inline-flex items-center justify-center rounded-full border border-white/70 bg-gray-400 text-[0.6em] font-semibold text-white shadow-sm ${className}`}
        style={{ width: size, height: size, ...style }}
      >
        ?
      </span>
    );
  }

  return (
    <span
      className={`inline-block overflow-hidden rounded-full border border-white/70 shadow-sm ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <Image
        src={src}
        alt={`${type} energy type`}
        title={`${type} energy type`}
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

/** A vertically-overlapping stack of type icons, most-represented type on top. */
export function EnergyTypeStack({ types, size = 20 }: { types: string[]; size?: number }) {
  if (types.length === 0) return null;
  return (
    <span className="inline-flex items-center" style={{ paddingRight: (types.length - 1) * (size * 0.4) }}>
      {types.map((type, i) => (
        <EnergyTypeIcon
          key={type}
          type={type}
          size={size}
          style={{
            marginLeft: i === 0 ? 0 : -(size * 0.4),
            zIndex: types.length - i,
            position: "relative",
          }}
        />
      ))}
    </span>
  );
}
