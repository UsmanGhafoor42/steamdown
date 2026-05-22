/**
 * Streamdown Phase 2–3: Human Presence Layer
 */

export type PresenceIntensity =
  | "subtle"
  | "normal"
  | "expressive"
  | "minimal"
  | "conversational";

export interface PresenceConfig {
  intensity: PresenceIntensity;
  variableSpeed: boolean;
  contextualPauses: boolean;
  cursorHesitation: boolean;
  selectionSimulation: boolean;
  rewritePatterns: boolean;
  thinkingIndicator: boolean;
  baseSpeed: number;
  speedVariance: number;
}

const CORE_PRESETS = {
  subtle: {
    intensity: "subtle" as const,
    variableSpeed: true,
    contextualPauses: false,
    cursorHesitation: false,
    selectionSimulation: false,
    rewritePatterns: false,
    thinkingIndicator: false,
    baseSpeed: 45,
    speedVariance: 0.1,
  },
  normal: {
    intensity: "normal" as const,
    variableSpeed: true,
    contextualPauses: true,
    cursorHesitation: true,
    selectionSimulation: true,
    rewritePatterns: true,
    thinkingIndicator: true,
    baseSpeed: 35,
    speedVariance: 0.3,
  },
  expressive: {
    intensity: "expressive" as const,
    variableSpeed: true,
    contextualPauses: true,
    cursorHesitation: true,
    selectionSimulation: true,
    rewritePatterns: true,
    thinkingIndicator: true,
    baseSpeed: 25,
    speedVariance: 0.6,
  },
} satisfies Record<"subtle" | "normal" | "expressive", PresenceConfig>;

export const PRESET_CONFIGS: Record<PresenceIntensity, PresenceConfig> = {
  ...CORE_PRESETS,
  minimal: CORE_PRESETS.subtle,
  conversational: CORE_PRESETS.normal,
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
