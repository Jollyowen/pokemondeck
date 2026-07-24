import type { DeckStatistics, StrategyArchetype } from "@/types/deck";
import { getArchetypeProfile } from "@/lib/ai/archetype-profiles";
import { EnergyTypeIcon } from "@/components/cards/EnergyTypeIcon";

function DistributionBars({
  distribution,
  showTypeIcon = false,
}: {
  distribution: Record<string, number>;
  showTypeIcon?: boolean;
}) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p className="text-sm text-ink-muted">None</p>;
  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <ul className="space-y-1">
      {entries.map(([key, value]) => (
        <li key={key} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate flex items-center gap-1.5">
            {showTypeIcon && <EnergyTypeIcon type={key} size={16} />}
            {key}
          </span>
          <div className="flex-1 h-2 rounded-full bg-surface-muted-2 overflow-hidden">
            <div
              className="h-full bg-chart rounded-full"
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right tabular-nums text-ink-secondary">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function NumericDistributionBars({ distribution }: { distribution: Record<number, number> }) {
  const entries = Object.entries(distribution)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return <p className="text-sm text-ink-muted">None</p>;
  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <ul className="space-y-1">
      {entries.map(([cost, value]) => (
        <li key={cost} className="flex items-center gap-2 text-sm">
          <span className="w-10 shrink-0 tabular-nums">{cost}⚡</span>
          <div className="flex-1 h-2 rounded-full bg-surface-muted-2 overflow-hidden">
            <div className="h-full bg-chart rounded-full" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="w-6 text-right tabular-nums text-ink-secondary">{value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Composition count against the archetype's target range — the range
 * itself is drawn as a shaded band, the actual count as a solid bar on
 * top, so "in range" is visible at a glance rather than only readable
 * from the numbers. Reuses the same profile `computeDeckQuality` scores
 * against, just rendered here rather than only surfaced as a pass/fail
 * check in the quality panel.
 */
function CompositionBar({
  label,
  value,
  range,
}: {
  label: string;
  value: number;
  range: [number, number];
}) {
  const inRange = value >= range[0] && value <= range[1];
  const windowMax = Math.max(range[1] * 1.25, value * 1.1, 1);
  const valuePct = Math.min(100, (value / windowMax) * 100);
  const rangeStartPct = (range[0] / windowMax) * 100;
  const rangeEndPct = (range[1] / windowMax) * 100;

  return (
    <li>
      <div className="flex items-center justify-between gap-2 mb-1 text-sm">
        <span>{label}</span>
        <span className={`tabular-nums ${inRange ? "text-success-text" : "text-warning-text"}`}>
          {value} <span className="text-ink-muted">(target {range[0]}–{range[1]})</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface-muted-2 overflow-hidden">
        <div
          className="absolute inset-y-0 bg-line-strong/50"
          style={{ left: `${rangeStartPct}%`, width: `${Math.max(0, rangeEndPct - rangeStartPct)}%` }}
          aria-hidden="true"
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${inRange ? "bg-success-text" : "bg-warning-text"}`}
          style={{ width: `${valuePct}%` }}
        />
      </div>
    </li>
  );
}

export function DeckStatisticsPanel({
  stats,
  archetype = null,
}: {
  stats: DeckStatistics;
  archetype?: StrategyArchetype | null;
}) {
  const isEstimated = (field: string) => stats.estimatedFields.includes(field);
  const profile = getArchetypeProfile(archetype);

  return (
    <div className="space-y-5">
      <ul className="space-y-2.5">
        <CompositionBar label="Pokémon" value={stats.totalPokemon} range={profile.pokemonRange} />
        <CompositionBar label="Trainer" value={stats.totalTrainer} range={profile.trainerRange} />
        <CompositionBar label="Energy" value={stats.totalEnergy} range={profile.energyRange} />
      </ul>

      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          <strong>{stats.averageRetreatCost.toFixed(1)}</strong> avg retreat cost
        </span>
        {stats.formatIllegalCount > 0 && (
          <span className="text-warning-text">
            <strong>{stats.formatIllegalCount}</strong> format-illegal
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold text-ink-secondary mb-2">Pokémon types</h3>
          <DistributionBars distribution={stats.pokemonTypeDistribution} showTypeIcon />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-secondary mb-2">Energy types</h3>
          <DistributionBars distribution={stats.energyTypeDistribution} showTypeIcon />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-secondary mb-2">Evolution stage</h3>
          <DistributionBars
            distribution={{
              Basic: stats.evolutionStageDistribution.basic,
              "Stage 1": stats.evolutionStageDistribution.stage1,
              "Stage 2": stats.evolutionStageDistribution.stage2,
              Other: stats.evolutionStageDistribution.other,
            }}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-secondary mb-2">Attack energy cost</h3>
          <NumericDistributionBars distribution={stats.attackEnergyCostDistribution} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-ink-secondary border-t border-line pt-3">
        <span>
          <strong>{stats.drawSupportCount}</strong> draw support
          {isEstimated("drawSupportCount") && <span className="text-ink-muted"> (estimate)</span>}
        </span>
        <span>
          <strong>{stats.searchSupportCount}</strong> search support
          {isEstimated("searchSupportCount") && <span className="text-ink-muted"> (estimate)</span>}
        </span>
      </div>
    </div>
  );
}
