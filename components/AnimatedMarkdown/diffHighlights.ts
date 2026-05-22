export type DiffHighlightKind = "add" | "remove";

export type DiffHighlight = {
  id: string;
  kind: DiffHighlightKind;
  text: string;
  createdAt: number;
};

export const DIFF_HIGHLIGHT_DURATION_MS = 30_000;

let highlightIdCounter = 0;

export function createDiffHighlight(
  kind: DiffHighlightKind,
  text: string,
): DiffHighlight {
  highlightIdCounter += 1;

  return {
    id: `diff-${highlightIdCounter}`,
    kind,
    text,
    createdAt: Date.now(),
  };
}

export function pruneExpiredHighlights(
  highlights: DiffHighlight[],
  now = Date.now(),
): DiffHighlight[] {
  return highlights.filter(
    (highlight) => now - highlight.createdAt < DIFF_HIGHLIGHT_DURATION_MS,
  );
}

/**
 * Wraps completed diff regions in transient highlight spans for settled markdown.
 * Processes from end to start so indices stay stable.
 */
export function applyDiffHighlightsToText(
  text: string,
  highlights: DiffHighlight[],
): string {
  if (highlights.length === 0 || text === "") {
    return text;
  }

  let result = text;

  for (const highlight of highlights) {
    if (!highlight.text) {
      continue;
    }

    const className =
      highlight.kind === "add"
        ? "animated-markdown-diff-add"
        : "animated-markdown-diff-remove";
    const marker = `<span class="${className}" data-diff-id="${highlight.id}">`;
    let searchFrom = 0;

    while (searchFrom < result.length) {
      const index = result.indexOf(highlight.text, searchFrom);

      if (index === -1) {
        break;
      }

      const before = result.slice(0, index);
      const after = result.slice(index + highlight.text.length);

      result = `${before}${marker}${highlight.text}</span>${after}`;
      searchFrom = index + marker.length + highlight.text.length + "</span>".length;
      break;
    }
  }

  return result;
}
