import { describe, expect, it } from "vitest";
import { normalizeQuotes, toIlikeSearchTerm, takeLegal, takeLegalDistinctByName } from "@/lib/ai/candidate-cards";
import type { Card } from "@/types/card";

function makeCard(id: string, legalities: Partial<Card["legalities"]>, name = "Test Card"): Card {
  return {
    id,
    provider: "tcgdex",
    number: "1",
    setId: "set1",
    setName: "Set One",
    imageSmall: "",
    imageLarge: "",
    name,
    supertype: "Trainer",
    subtypes: [],
    types: [],
    hp: null,
    evolvesFrom: null,
    evolvesTo: [],
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    rules: [],
    rarity: null,
    legalities: { standard: "not_legal", expanded: "not_legal", unlimited: "not_legal", ...legalities },
    price: null,
  };
}

describe("normalizeQuotes", () => {
  it("converts a curly right single quote (U+2019) to a straight apostrophe", () => {
    expect(normalizeQuotes("Professor\u2019s Research")).toBe("Professor's Research");
  });

  it("leaves an already-straight apostrophe unchanged", () => {
    expect(normalizeQuotes("Professor's Research")).toBe("Professor's Research");
  });

  it("makes a straight- and curly-apostrophe name compare equal once normalized", () => {
    const straight = normalizeQuotes("Boss's Orders").toLowerCase();
    const curly = normalizeQuotes("Boss\u2019s Orders").toLowerCase();
    expect(straight).toBe(curly);
  });

  it("leaves names without any apostrophe untouched", () => {
    expect(normalizeQuotes("Ultra Ball")).toBe("Ultra Ball");
  });
});

describe("toIlikeSearchTerm", () => {
  it("replaces a straight apostrophe with the Postgres single-character wildcard", () => {
    expect(toIlikeSearchTerm("Professor's Research")).toBe("Professor_s Research");
  });

  it("replaces every apostrophe when a name has more than one", () => {
    expect(toIlikeSearchTerm("'s 's")).toBe("_s _s");
  });

  it("leaves names without any apostrophe untouched", () => {
    expect(toIlikeSearchTerm("Ultra Ball")).toBe("Ultra Ball");
  });
});

describe("takeLegal", () => {
  it("skips an illegal card even when it sorts first, and finds a legal one further down", () => {
    // Real reported bug: results are ordered newest-first, and the
    // single most-recent printing of a staple name is sometimes a promo
    // without Standard legality — the old code sliced to N results
    // BEFORE checking legality, so a search could come back entirely
    // illegal even though a legal reprint existed a few positions later.
    const cards = [
      makeCard("promo-newest", { standard: "not_legal" }),
      makeCard("reprint-older", { standard: "legal" }),
    ];
    expect(takeLegal(cards, "standard", 1)).toEqual([cards[1]]);
  });

  it("returns an empty array when nothing in the list is legal", () => {
    const cards = [makeCard("a", { standard: "not_legal" }), makeCard("b", { standard: "not_legal" })];
    expect(takeLegal(cards, "standard", 5)).toEqual([]);
  });

  it("respects the cap even when more legal cards exist than requested", () => {
    const cards = [
      makeCard("a", { standard: "legal" }),
      makeCard("b", { standard: "legal" }),
      makeCard("c", { standard: "legal" }),
    ];
    expect(takeLegal(cards, "standard", 2)).toHaveLength(2);
  });

  it("treats every card as legal when format is \"all\"", () => {
    const cards = [makeCard("a", { standard: "not_legal" })];
    expect(takeLegal(cards, "all", 1)).toEqual(cards);
  });
});

describe("takeLegalDistinctByName", () => {
  it("counts only one printing of the same card name toward the cap, even with multiple legal printings", () => {
    // Real reported bug: a generated deck kept reusing the same handful
    // of Supporters every time. Traced to a real candidate-gathering log
    // showing "Gwynn" three times in one role-classified bucket — three
    // different printings of the identical card were each independently
    // counted toward a small per-bucket cap, wasting most of the bucket
    // on redundant names instead of genuinely different strategic
    // options.
    const cards = [
      makeCard("gwynn-set1", { standard: "legal" }, "Gwynn"),
      makeCard("gwynn-set2", { standard: "legal" }, "Gwynn"),
      makeCard("gwynn-set3", { standard: "legal" }, "Gwynn"),
      makeCard("judge-set1", { standard: "legal" }, "Judge"),
    ];
    const result = takeLegalDistinctByName(cards, "standard", 3);
    expect(result.map((c) => c.name)).toEqual(["Gwynn", "Judge"]);
  });

  it("keeps the first (most recent, since results are newest-first) printing of a repeated name", () => {
    const cards = [
      makeCard("newest", { standard: "legal" }, "Gwynn"),
      makeCard("older", { standard: "legal" }, "Gwynn"),
    ];
    const result = takeLegalDistinctByName(cards, "standard", 5);
    expect(result).toEqual([cards[0]]);
  });

  it("is case/quote-insensitive the same way normalizeCardName is, not a raw string match", () => {
    const cards = [
      makeCard("a", { standard: "legal" }, "boss's orders"),
      makeCard("b", { standard: "legal" }, "Boss's Orders"),
    ];
    const result = takeLegalDistinctByName(cards, "standard", 5);
    expect(result).toHaveLength(1);
  });

  it("still filters out illegal cards before considering names at all", () => {
    const cards = [makeCard("a", { standard: "not_legal" }, "Gwynn"), makeCard("b", { standard: "legal" }, "Judge")];
    const result = takeLegalDistinctByName(cards, "standard", 5);
    expect(result.map((c) => c.name)).toEqual(["Judge"]);
  });

  it("respects the cap on distinct names, not on raw card count", () => {
    const cards = [
      makeCard("a", { standard: "legal" }, "A"),
      makeCard("b", { standard: "legal" }, "B"),
      makeCard("c", { standard: "legal" }, "C"),
    ];
    expect(takeLegalDistinctByName(cards, "standard", 2)).toHaveLength(2);
  });
});
