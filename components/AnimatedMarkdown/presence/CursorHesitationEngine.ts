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
  private lastPositionKey: string | null = null;
  private cachedJitterOffset = { x: 0, y: 0 };

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  public updateConfig(config: Partial<PresenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getHesitationDistance(distancePixels: number): number {
    if (!this.config.cursorHesitation) {
      return 0;
    }

    if (distancePixels > 200) {
      return 80 + Math.random() * 40;
    }

    if (distancePixels > 50) {
      return 30 + Math.random() * 20;
    }

    return Math.random() * 10;
  }

  /** Single jitter offset per cursor movement — avoids frame-by-frame vibration. */
  public applyJitter(
    targetX: number,
    targetY: number,
  ): { x: number; y: number } {
    if (!this.config.cursorHesitation) {
      return { x: targetX, y: targetY };
    }

    const positionKey = `${Math.round(targetX)}:${Math.round(targetY)}`;

    if (positionKey !== this.lastPositionKey) {
      const jitterRange = this.config.intensity === "expressive" ? 3 : 1.5;
      this.cachedJitterOffset = {
        x: Math.random() * jitterRange * 2 - jitterRange,
        y: Math.random() * jitterRange * 2 - jitterRange,
      };
      this.lastPositionKey = positionKey;
    }

    return {
      x: targetX + this.cachedJitterOffset.x,
      y: targetY + this.cachedJitterOffset.y,
    };
  }
}
