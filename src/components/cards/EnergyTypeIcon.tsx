/**
 * Small circular badge representing a Pokémon elemental (energy) type.
 * Deliberately an original abstract design (color + letterform), not a
 * reproduction of the official TCG energy symbols, which are Nintendo/The
 * Pokémon Company IP.
 */
import type { CSSProperties } from "react";

const TYPE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  Grass: { bg: "#4e9a51", fg: "#ffffff", label: "G" },
  Fire: { bg: "#e0653a", fg: "#ffffff", label: "F" },
  Water: { bg: "#4f92d6", fg: "#ffffff", label: "W" },
  Lightning: { bg: "#f2c94c", fg: "#3a3000", label: "L" },
  Psychic: { bg: "#a05fc4", fg: "#ffffff", label: "P" },
  Fighting: { bg: "#a15127", fg: "#ffffff", label: "Ft" },
  Darkness: { bg: "#4a4459", fg: "#ffffff", label: "D" },
  Metal: { bg: "#8e97a3", fg: "#ffffff", label: "M" },
  Fairy: { bg: "#e58cc6", fg: "#ffffff", label: "Fy" },
  Dragon: { bg: "#7a6a3f", fg: "#ffffff", label: "Dr" },
  Colorless: { bg: "#d8d3c4", fg: "#4a453a", label: "C" },
};

const DEFAULT_STYLE = { bg: "#9ca3af", fg: "#ffffff", label: "?" };

export function energyTypeStyle(type: string) {
  return TYPE_STYLES[type] ?? DEFAULT_STYLE;
}

type EnergyTypeIconProps = {
  type: string;
  size?: number;
  className?: string;
  /** Extra offset so several icons can be stacked with a slight overlap. */
  style?: CSSProperties;
};

export function EnergyTypeIcon({ type, size = 20, className = "", style }: EnergyTypeIconProps) {
  const { bg, fg, label } = energyTypeStyle(type);
  return (
    <span
      role="img"
      aria-label={`${type} energy type`}
      title={`${type} energy type`}
      className={`inline-flex items-center justify-center rounded-full border border-white/70 font-semibold shadow-sm ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.42),
        backgroundColor: bg,
        color: fg,
        lineHeight: 1,
        ...style,
      }}
    >
      {label}
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
