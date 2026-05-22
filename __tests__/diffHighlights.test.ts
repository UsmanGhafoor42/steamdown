import { describe, expect, test } from "vitest";
import {
  applyDiffHighlightsToText,
  createDiffHighlight,
  pruneExpiredHighlights,
  DIFF_HIGHLIGHT_DURATION_MS,
} from "@/components/AnimatedMarkdown/diffHighlights";

describe("diffHighlights", () => {
  test("wraps additions and removals with highlight spans", () => {
    const text = "Alpha beta gamma";
    const highlights = [
      createDiffHighlight("remove", "beta"),
      createDiffHighlight("add", "gamma"),
    ];

    const result = applyDiffHighlightsToText(text, highlights);

    expect(result).toContain('class="animated-markdown-diff-remove"');
    expect(result).toContain('class="animated-markdown-diff-add"');
    expect(result).toContain("beta");
    expect(result).toContain("gamma");
  });

  test("prunes highlights after the fade window", () => {
    const highlight = createDiffHighlight("add", "delta");
    const now = highlight.createdAt + DIFF_HIGHLIGHT_DURATION_MS + 1;

    expect(pruneExpiredHighlights([highlight], now)).toEqual([]);
  });
});
