export type DiffHighlightKind = "add" | "remove" | "rewrite";

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
  fadeOut: boolean = false,
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
        : highlight.kind === "rewrite"
          ? "animated-markdown-diff-rewrite"
          : "animated-markdown-diff-remove";
    const fadeClass = fadeOut ? " animated-markdown-diff-fadeout" : "";
    const marker = `<span class="${className}${fadeClass}" data-diff-id="${highlight.id}">`;
    let searchFrom = 0;

    while (searchFrom < result.length) {
      const index = result.indexOf(highlight.text, searchFrom);

      if (index === -1) {
        break;
      }

      const before = result.slice(0, index);
      const after = result.slice(index + highlight.text.length);

      result = `${before}${marker}${highlight.text}</span>${after}`;
      searchFrom =
        index + marker.length + highlight.text.length + "</span>".length;
      break;
    }
  }

  return result;
}

const LIVE_DIFF_CLASS: Record<"add" | "remove" | "rewrite", string> = {
  add: "animated-markdown-diff-add",
  remove: "animated-markdown-diff-remove",
  rewrite: "animated-markdown-diff-rewrite",
};

/** Inline highlight for the active streaming region (not yet settled). */
export function wrapLiveDiffMarkup(
  text: string,
  kind: "add" | "remove" | "rewrite",
): string {
  if (!text) {
    return text;
  }

  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<span class="${LIVE_DIFF_CLASS[kind]} animated-markdown-diff-live">${escaped}</span>`;
}

export function classifyPatchDiff(
  findText: string,
  replaceText: string,
): "add" | "remove" | "rewrite" {
  if (!findText && replaceText) {
    return "add";
  }

  if (findText && !replaceText) {
    return "remove";
  }

  if (findText && replaceText && findText !== replaceText) {
    return "rewrite";
  }

  return "add";
}
