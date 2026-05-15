import {
  PresenceConfig,
  PRESET_CONFIGS,
  TypingContext,
  PresenceIntensity,
} from "@/components/AnimatedMarkdown/presence/types";
import { TypingRhythmEngine } from "@/components/AnimatedMarkdown/presence/TypingRhythmEngine";
import { ContextualPauseEngine } from "@/components/AnimatedMarkdown/presence/ContextualPauseEngine";
import { CursorHesitationEngine } from "@/components/AnimatedMarkdown/presence/CursorHesitationEngine";

/**
 * Central manager for all Human Presence Layer features.
 * Coordinates typing rhythm, pauses, and cursor behavior.
 */
export class PresenceManager {
  private config: PresenceConfig;
  private rhythmEngine: TypingRhythmEngine;
  private pauseEngine: ContextualPauseEngine;
  private cursorEngine: CursorHesitationEngine;

  constructor(intensity: PresenceIntensity = "normal") {
    this.config = { ...PRESET_CONFIGS[intensity] };

    this.rhythmEngine = new TypingRhythmEngine(this.config);
    this.pauseEngine = new ContextualPauseEngine(this.config);
    this.cursorEngine = new CursorHesitationEngine(this.config);
  }

  /**
   * Update configuration dynamically at runtime.
   */
  public setConfig(partial: Partial<PresenceConfig> | PresenceIntensity): void {
    if (typeof partial === "string") {
      this.config = { ...PRESET_CONFIGS[partial] };
    } else {
      this.config = { ...this.config, ...partial };
    }

    this.rhythmEngine.updateConfig(this.config);
    this.pauseEngine.updateConfig(this.config);
    this.cursorEngine.updateConfig(this.config);
  }

  /**
   * Get the delay for the next character based on full context.
   */
  public getNextCharDelay(context: TypingContext): number {
    const rhythmDelay = this.rhythmEngine.calculateDelay(context);
    const pauseDelay = this.pauseEngine.getPauseDuration(
      context.surroundingText,
      context.nextChar,
    );

    return rhythmDelay + pauseDelay;
  }

  /**
   * Get cursor hesitation delay based on movement distance.
   */
  public getCursorHesitation(distancePixels: number): number {
    return this.cursorEngine.getHesitationDistance(distancePixels);
  }

  /**
   * Apply jitter to cursor coordinates.
   */
  public applyCursorJitter(x: number, y: number): { x: number; y: number } {
    return this.cursorEngine.applyJitter(x, y);
  }
}
