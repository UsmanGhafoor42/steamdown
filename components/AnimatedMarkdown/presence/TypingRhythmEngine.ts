import {
  PresenceConfig,
  TypingContext,
} from "@/components/AnimatedMarkdown/presence/types";

/**
 * Calculates dynamic delay based on context to simulate human typing rhythm.
 * Humans slow down for complex words, proper nouns, and before punctuation.
 */
export class TypingRhythmEngine {
  private config: PresenceConfig;

  // Common words humans type fast (muscle memory)
  private commonWords = new Set([
    "the",
    "be",
    "to",
    "of",
    "and",
    "a",
    "in",
    "that",
    "have",
    "it",
    "for",
    "not",
    "on",
    "with",
    "he",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "his",
    "by",
    "from",
    "they",
    "we",
    "say",
    "her",
    "she",
    "or",
  ]);

  // Complex patterns that cause hesitation
  private complexPatterns = [
    /^[A-Z][a-z]+[A-Z]/, // CamelCase
    /[0-9]{4,}/, // Long numbers
    /https?:\/\//, // URLs
    /[^\w\s]/, // Special characters
  ];

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  public updateConfig(config: Partial<PresenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculate delay for the next character in milliseconds.
   */
  public calculateDelay(context: TypingContext): number {
    if (!this.config.variableSpeed) {
      return 1000 / this.config.baseSpeed;
    }

    const baseDelay = 1000 / this.config.baseSpeed;
    let modifier = 1.0;

    // 1. Check for complex patterns (slow down)
    if (this.isComplexToken(context.wordSoFar + context.currentChar)) {
      modifier *= 1.8;
    }

    // 2. Check for common words (speed up)
    if (this.commonWords.has(context.wordSoFar.toLowerCase())) {
      modifier *= 0.7;
    }

    // 3. End of sentence pause
    if (context.isEndOfSentence) {
      modifier *= 2.5;
    }

    // 4. Start of line hesitation
    if (context.isStartOfLine) {
      modifier *= 1.3;
    }

    // 5. Apply variance based on intensity
    const varianceFactor = this.config.speedVariance;
    const randomVariance =
      1 + (Math.random() * varianceFactor * 2 - varianceFactor);

    modifier *= randomVariance;

    return Math.max(10, baseDelay * modifier);
  }

  private isComplexToken(token: string): boolean {
    return this.complexPatterns.some((pattern) => pattern.test(token));
  }
}
