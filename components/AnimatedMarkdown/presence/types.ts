/**
 * Streamdown Phase 2: Human Presence Layer
 * Defines configuration and types for simulating human-like typing behavior.
 */

export type PresenceIntensity = "subtle" | "normal" | "expressive";

export interface PresenceConfig {
  /** Overall intensity of human-like behaviors */
  intensity: PresenceIntensity;

  /** Enable variable typing speed (slows for complex words) */
  variableSpeed: boolean;

  /** Enable micro-pauses before punctuation and structural elements */
  contextualPauses: boolean;

  /** Enable cursor hesitation and movement simulation */
  cursorHesitation: boolean;

  /** Base typing speed in characters per second (cps) */
  baseSpeed: number;

  /** Variance factor for speed (0.0 - 1.0) */
  speedVariance: number;
}

export const PRESET_CONFIGS: Record<PresenceIntensity, PresenceConfig> = {
  subtle: {
    intensity: "subtle",
    variableSpeed: true,
    contextualPauses: false,
    cursorHesitation: false,
    baseSpeed: 45,
    speedVariance: 0.1,
  },
  normal: {
    intensity: "normal",
    variableSpeed: true,
    contextualPauses: true,
    cursorHesitation: true,
    baseSpeed: 35,
    speedVariance: 0.3,
  },
  expressive: {
    intensity: "expressive",
    variableSpeed: true,
    contextualPauses: true,
    cursorHesitation: true,
    baseSpeed: 25,
    speedVariance: 0.6,
  },
};

export interface TypingContext {
  currentChar: string;
  previousChar: string;
  nextChar: string;
  wordSoFar: string;
  isStartOfLine: boolean;
  isEndOfSentence: boolean;
  surroundingText: string;
}
