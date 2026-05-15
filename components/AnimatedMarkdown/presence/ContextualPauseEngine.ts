import { PresenceConfig } from "@/components/AnimatedMarkdown/presence/types";

/**
 * Manages intelligent micro-pauses for structural elements.
 * Simulates the "thinking" time a human takes before starting a new thought.
 */
export class ContextualPauseEngine {
  private config: PresenceConfig;

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  public updateConfig(config: Partial<PresenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Determines if a pause is needed and returns the duration in ms.
   * Returns 0 if no pause is needed.
   */
  public getPauseDuration(textChunk: string, nextChar: string): number {
    if (!this.config.contextualPauses) {
      return 0;
    }

    const trimmed = textChunk.trim();
    const basePause = 150; // Base micro-pause in ms

    // 1. Before Headings (#, ##, etc.)
    if (nextChar === "#" || trimmed.match(/^#+\s$/)) {
      return basePause * 3;
    }

    // 2. Before List items (-, *, 1.)
    if (["-", "*", "+"].includes(nextChar) && trimmed === "") {
      return basePause * 1.5;
    }
    if (trimmed.match(/^\d+\.$/)) {
      return basePause * 1.5;
    }

    // 3. Before Blockquotes (>)
    if (nextChar === ">" && trimmed === "") {
      return basePause * 2;
    }

    // 4. After heavy punctuation (end of paragraph/thought)
    if (textChunk.endsWith("\n\n")) {
      return basePause * 4;
    }

    // 5. Before code blocks (```)
    if (
      trimmed.endsWith("```") ||
      (nextChar === "`" && trimmed.endsWith("`"))
    ) {
      return basePause * 2.5;
    }

    return 0;
  }
}
