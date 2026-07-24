import Link from "next/link";
import { notFound } from "next/navigation";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";
import { getLocalCard, upsertCard } from "@/lib/cards/local-card-repository";
import type { Card } from "@/types/card";

async function loadCard(id: string): Promise<Card | null> {
  const local = await getLocalCard(id);
  if (local) return local;

  // Not in the local mirror yet — live-fetch as a fallback and write it
  // back locally, same pattern as the /api/cards/[id] route.
  try {
    const card = await pokemonTcgApiProvider.getCard(id);
    if (!card) return null;
    await upsertCard(card);
    return card;
  } catch (error) {
    if (error instanceof PokemonTcgApiError) return null;
    throw error;
  }
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await loadCard(id);

  if (!card) notFound();

  return (
    <div className="space-y-4">
      <Link href="/cards" className="text-sm text-neutral-500 hover:underline">
        ← Back to catalogue
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        <div>
          {card.imageLarge ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image
            <img src={card.imageLarge} alt={card.name} className="w-full rounded-lg" />
          ) : (
            <div className="aspect-[63/88] w-full rounded-lg bg-neutral-100 flex items-center justify-center text-sm text-neutral-400">
              No image available
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">{card.name}</h1>
            <p className="text-neutral-500">
              {card.setName} · {card.number} {card.hp ? `· HP ${card.hp}` : ""}
            </p>
            {card.price && card.price.market !== null && (
              <p className="text-sm text-neutral-600 mt-1">
                ${card.price.market.toFixed(2)}
                {card.price.low !== null && card.price.high !== null && (
                  <span className="text-neutral-400">
                    {" "}
                    (${card.price.low.toFixed(2)}–${card.price.high.toFixed(2)})
                  </span>
                )}
                <span className="text-neutral-400"> · {card.price.variant}</span>
                {card.price.url && (
                  <>
                    {" · "}
                    <a
                      href={card.price.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View on TCGplayer
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {(["standard", "expanded", "unlimited"] as const).map((format) => {
              const label = `${format[0]?.toUpperCase() ?? ""}${format.slice(1)}`;
              return (
                <span
                  key={format}
                  className={`rounded-full px-2.5 py-1 ${
                    card.legalities[format] === "legal"
                      ? "bg-green-50 text-green-700"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {label}: {card.legalities[format] === "legal" ? "Legal" : "Not legal"}
                </span>
              );
            })}
          </div>

          {card.abilities.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Abilities</h2>
              {card.abilities.map((a) => (
                <div key={a.name} className="mb-2">
                  <p className="text-sm font-medium">
                    {a.type}: {a.name}
                  </p>
                  <p className="text-sm text-neutral-600">{a.text}</p>
                </div>
              ))}
            </section>
          )}

          {card.attacks.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Attacks</h2>
              {card.attacks.map((a) => (
                <div key={a.name} className="mb-2">
                  <p className="text-sm font-medium">
                    {a.name} {a.damage && `— ${a.damage}`}{" "}
                    <span className="text-neutral-400 font-normal">
                      ({a.convertedEnergyCost} energy)
                    </span>
                  </p>
                  {a.text && <p className="text-sm text-neutral-600">{a.text}</p>}
                </div>
              ))}
            </section>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {card.weaknesses.length > 0 && (
              <div>
                <h2 className="font-medium mb-1">Weakness</h2>
                {card.weaknesses.map((w) => (
                  <p key={w.type}>
                    {w.type} {w.value}
                  </p>
                ))}
              </div>
            )}
            {card.resistances.length > 0 && (
              <div>
                <h2 className="font-medium mb-1">Resistance</h2>
                {card.resistances.map((r) => (
                  <p key={r.type}>
                    {r.type} {r.value}
                  </p>
                ))}
              </div>
            )}
          </div>

          {card.retreatCost.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">Retreat cost:</span> {card.convertedRetreatCost}
            </p>
          )}

          {card.rules.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Rules</h2>
              {card.rules.map((rule, i) => (
                <p key={i} className="text-sm text-neutral-600">
                  {rule}
                </p>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
