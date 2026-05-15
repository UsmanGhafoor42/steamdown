import { PresenceConfig } from "@/components/AnimatedMarkdown/presence/types";

export interface CursorState {
  x: number;
  y: number;
  isMoving: boolean;
  targetX?: number;
  targetY?: number;
}

/**
 * Simulates realistic cursor movement and hesitation before committing text.
 */
export class CursorHesitationEngine {
  private config: PresenceConfig;
  private currentState: CursorState = { x: 0, y: 0, isMoving: false };

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  public updateConfig(config: Partial<PresenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculates the delay before the cursor "commits" to typing the next character.
   * Simulates the eye-hand coordination lag.
   */
  public getHesitationDistance(distancePixels: number): number {
    if (!this.config.cursorHesitation) {
      return 0;
    }

    // Longer distances cause more hesitation (looking for the key/position)
    if (distancePixels > 200) {
      return 80 + Math.random() * 40;
    } else if (distancePixels > 50) {
      return 30 + Math.random() * 20;
    }

    // Tiny movements might still have micro-jitters
    return Math.random() * 10;
  }

  /**
   * Generates a slight "overshoot" or "jitter" in cursor position
   * to mimic non-robotic movement.
   */
  public applyJitter(
    targetX: number,
    targetY: number,
  ): { x: number; y: number } {
    if (!this.config.cursorHesitation) {
      return { x: targetX, y: targetY };
    }

    const jitterRange = this.config.intensity === "expressive" ? 4 : 2;
    const jitterX = Math.random() * jitterRange * 2 - jitterRange;
    const jitterY = Math.random() * jitterRange * 2 - jitterRange;

    return {
      x: targetX + jitterX,
      y: targetY + jitterY,
    };
  }
}
