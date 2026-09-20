import { describe, expect, it } from "vitest";
import { normalizeQuotes, toIlikeSearchTerm } from "@/lib/ai/candidate-cards";

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
