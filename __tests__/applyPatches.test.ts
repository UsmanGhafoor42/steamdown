import { describe, expect, test } from "vitest";
import {
  applyPatch,
  applyPatches,
  applyPatchesInDocumentOrder,
  findPatchRange,
} from "@/components/AnimatedMarkdown/applyPatches";
import {
  diffToPatches,
  expandPatchForAnimation,
} from "@/components/AnimatedMarkdown/diffToPatches";
import {
  BASE_STRATEGY_DOC,
  PATCH_SET_4,
  PATCH_SET_3,
  PATCH_SET_6,
  SEED_MARKDOWN,
} from "@/components/AnimatedMarkdown/fixtures";

describe("applyPatch", () => {
  test("replaces the first matching string", () => {
    expect(
      applyPatch("Stop loss: -5% from entry", {
        find: "-5%",
        replace: "-3%",
      }),
    ).toBe("Stop loss: -3% from entry");
  });

  test("returns the original text when the match is missing", () => {
    expect(
      applyPatch("No matching text", {
        find: "Stop loss",
        replace: "Risk limit",
      }),
    ).toBe("No matching text");
  });

  test("inserts at the beginning when find is empty and no anchors are set", () => {
    expect(
      applyPatch("Body", {
        find: "",
        replace: "Title\n\n",
      }),
    ).toBe("Title\n\nBody");
  });

  test("creates an initial document from an empty string", () => {
    expect(
      applyPatches("", [
        {
          find: "",
          replace: SEED_MARKDOWN,
        },
      ]),
    ).toBe(SEED_MARKDOWN);
  });

  test("inserts after a before anchor", () => {
    expect(
      applyPatch("## Entry Rules\n\n- Signal", {
        find: "",
        replace: "- Liquidity\n",
        before: "## Entry Rules\n\n",
      }),
    ).toBe("## Entry Rules\n\n- Liquidity\n- Signal");
  });

  test("uses before and after to disambiguate repeated matches", () => {
    expect(
      applyPatch("A: risk 5%\nB: risk 5%\nC: risk 5%", {
        find: "risk 5%",
        replace: "risk 3%",
        before: "B: ",
        after: "\n",
      }),
    ).toBe("A: risk 5%\nB: risk 3%\nC: risk 5%");
  });

  test("supports pure deletion without leaving the deleted bullet behind", () => {
    const patched = applyPatches(BASE_STRATEGY_DOC, PATCH_SET_6.patches);

    expect(patched).not.toContain("- NVDA\n");
    expect(patched).toContain("- MSFT\n- GOOGL");
  });

  test("uses before and after together to disambiguate empty-string insertions", () => {
    expect(
      applyPatch("## Risk Management\n- Daily loss limit: 2%\n## Risk Management", {
        find: "",
        replace: "\n- Weekly drawdown cap: 5%",
        before: "- Daily loss limit: 2%",
        after: "\n## Risk Management",
      }),
    ).toBe(
      "## Risk Management\n- Daily loss limit: 2%\n- Weekly drawdown cap: 5%\n## Risk Management",
    );
  });
});

describe("applyPatches", () => {
  test("applies patches in order", () => {
    expect(
      applyPatches("Buy tech\nStop loss: -5%", [
        {
          find: "Buy tech",
          replace: "Buy liquid growth",
        },
        {
          find: "-5%",
          replace: "-3%",
        },
      ]),
    ).toBe("Buy liquid growth\nStop loss: -3%");
  });
});

describe("diffToPatches", () => {
  test("round trips an empty document to the seeded markdown", () => {
    const patches = diffToPatches("", SEED_MARKDOWN);

    expect(applyPatches("", patches)).toBe(SEED_MARKDOWN);
  });

  test("round trips a multi-patch edit back to the base document", () => {
    const edited = applyPatchesInDocumentOrder(BASE_STRATEGY_DOC, PATCH_SET_3.patches);
    const restorePatches = diffToPatches(edited, BASE_STRATEGY_DOC);

    expect(applyPatches(edited, restorePatches)).toBe(BASE_STRATEGY_DOC);
  });

  test("round trips a block-straddling edit back to the base document", () => {
    const edited = applyPatches(BASE_STRATEGY_DOC, PATCH_SET_4.patches);
    const restorePatches = diffToPatches(edited, BASE_STRATEGY_DOC);

    expect(applyPatches(edited, restorePatches)).toBe(BASE_STRATEGY_DOC);
  });
});

describe("expandPatchForAnimation", () => {
  test("splits a block patch into smaller animation patches without changing the result", () => {
    const expanded = expandPatchForAnimation(BASE_STRATEGY_DOC, PATCH_SET_4.patches[0]);

    expect(expanded.length).toBeGreaterThan(1);
    expect(applyPatches(BASE_STRATEGY_DOC, expanded)).toBe(
      applyPatches(BASE_STRATEGY_DOC, PATCH_SET_4.patches),
    );
  });
});

describe("findPatchRange", () => {
  test("returns start and end positions for animation", () => {
    expect(
      findPatchRange("Take profit: +15% from entry", {
        find: "+15%",
        replace: "+12%",
      }),
    ).toMatchObject({
      start: 13,
      end: 17,
    });
  });
});
