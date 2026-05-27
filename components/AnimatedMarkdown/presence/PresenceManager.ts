import {
  PresenceConfig,
  PRESET_CONFIGS,
  TypingContext,
  PresenceIntensity,
} from "@/components/AnimatedMarkdown/presence/types";
import { TypingRhythmEngine } from "@/components/AnimatedMarkdown/presence/TypingRhythmEngine";
import { ContextualPauseEngine } from "@/components/AnimatedMarkdown/presence/ContextualPauseEngine";
import { CursorHesitationEngine } from "@/components/AnimatedMarkdown/presence/CursorHesitationEngine";
import { RewritePatternEngine } from "@/components/AnimatedMarkdown/presence/RewritePatternEngine";
import type { Patch } from "@/components/AnimatedMarkdown/types";

export class PresenceManager {
  private config: PresenceConfig;
  private rhythmEngine: TypingRhythmEngine;
  private pauseEngine: ContextualPauseEngine;
  private cursorEngine: CursorHesitationEngine;
  private rewriteEngine: RewritePatternEngine;

  constructor(intensity: PresenceIntensity = "normal") {
    this.config = {
      ...PRESET_CONFIGS[
        intensity === "minimal"
          ? "subtle"
          : intensity === "conversational"
            ? "normal"
            : intensity
      ],
    };

    this.rhythmEngine = new TypingRhythmEngine(this.config);
    this.pauseEngine = new ContextualPauseEngine(this.config);
    this.cursorEngine = new CursorHesitationEngine(this.config);
    this.rewriteEngine = new RewritePatternEngine(this.config);
  }

  public setConfig(partial: Partial<PresenceConfig> | PresenceIntensity): void {
    if (typeof partial === "string") {
      this.config = {
        ...PRESET_CONFIGS[
          partial === "minimal"
            ? "subtle"
            : partial === "conversational"
              ? "normal"
              : partial
        ],
      };
    } else {
      this.config = { ...this.config, ...partial };
    }

    this.rhythmEngine.updateConfig(this.config);
    this.pauseEngine.updateConfig(this.config);
    this.cursorEngine.updateConfig(this.config);
    this.rewriteEngine.updateConfig(this.config);
  }

  public getNextCharDelay(context: TypingContext): number {
    const rhythmDelay = this.rhythmEngine.calculateDelay(context);
    const pauseDelay = this.pauseEngine.getPauseDuration(
      context.surroundingText,
      context.nextChar,
    );

    return rhythmDelay + pauseDelay;
  }

  public getCursorHesitation(distancePixels: number): number {
    return this.cursorEngine.getHesitationDistance(distancePixels);
  }

  public applyCursorJitter(x: number, y: number): { x: number; y: number } {
    return this.cursorEngine.applyJitter(x, y);
  }

  public expandPatchesForRewrite(patches: Patch[]): Patch[] {
    if (!this.config.rewritePatterns) {
      return patches;
    }

    return patches.flatMap((patch) => this.rewriteEngine.decomposePatch(patch));
  }

  public getSelectionPauseMs(): number {
    if (!this.config.selectionSimulation) {
      return 0;
    }

    return this.config.intensity === "expressive" ? 520 : 380;
  }

  public isThinkingIndicatorEnabled(): boolean {
    return this.config.thinkingIndicator;
  }
}
