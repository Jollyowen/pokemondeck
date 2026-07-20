import type { DeckStatistics } from "@/types/deck";

function DistributionBars({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p className="text-sm text-neutral-400">None</p>;
  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <ul className="space-y-1">
      {entries.map(([key, value]) => (
        <li key={key} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate">{key}</span>
          <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full bg-neutral-700 rounded-full"
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right tabular-nums text-neutral-500">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function NumericDistributionBars({ distribution }: { distribution: Record<number, number> }) {
  const entries = Object.entries(distribution)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return <p className="text-sm text-neutral-400">None</p>;
  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <ul className="space-y-1">
      {entries.map(([cost, value]) => (
        <li key={cost} className="flex items-center gap-2 text-sm">
          <span className="w-10 shrink-0 tabular-nums">{cost}⚡</span>
          <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div className="h-full bg-neutral-700 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="w-6 text-right tabular-nums text-neutral-500">{value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DeckStatisticsPanel({ stats }: { stats: DeckStatistics }) {
  const isEstimated = (field: string) => stats.estimatedFields.includes(field);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          <strong>{stats.totalPokemon}</strong> Pokémon
        </span>
        <span>
          <strong>{stats.totalTrainer}</strong> Trainer
        </span>
        <span>
          <strong>{stats.totalEnergy}</strong> Energy
        </span>
        <span>
          <strong>{stats.averageRetreatCost.toFixed(1)}</strong> avg retreat cost
        </span>
        {stats.formatIllegalCount > 0 && (
          <span className="text-amber-700">
            <strong>{stats.formatIllegalCount}</strong> format-illegal
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Pokémon types</h3>
          <DistributionBars distribution={stats.pokemonTypeDistribution} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Energy types</h3>
          <DistributionBars distribution={stats.energyTypeDistribution} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Evolution stage</h3>
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
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Attack energy cost</h3>
          <NumericDistributionBars distribution={stats.attackEnergyCostDistribution} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-neutral-600 border-t border-neutral-200 pt-3">
        <span>
          <strong>{stats.drawSupportCount}</strong> draw support
          {isEstimated("drawSupportCount") && <span className="text-neutral-400"> (estimate)</span>}
        </span>
        <span>
          <strong>{stats.searchSupportCount}</strong> search support
          {isEstimated("searchSupportCount") && <span className="text-neutral-400"> (estimate)</span>}
        </span>
      </div>
    </div>
  );
}
