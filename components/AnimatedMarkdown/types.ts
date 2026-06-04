export type Patch = {
  find: string;
  replace: string;
  before?: string;
  after?: string;
};

export type PatchSet = {
  label?: string;
  patches: Patch[];
};

export type AnimationEvent =
  | { type: "edit"; patchSet: PatchSet; cancelled: boolean }
  | { type: "restore"; targetText: string; cancelled: boolean };

export type AnimationConstants = {
  caretFadeMs: number;
  preEditPauseMs: number;
  zeroPauseMs: number;
  interPatchBeatMs: number;
  offscreenInterPatchBeatMs: number;
  scrollMaxMs: number;
  typeStartMs: number;
  typeEndMs: number;
  deleteMsPerChar: number;
  minDeleteTotalMs: number;
  maxDeleteTotalMs: number;
};

export type PresenceIntensity =
  | "subtle"
  | "normal"
  | "expressive"
  | "minimal"
  | "conversational";

export type PresenceConfig = {
  intensity: PresenceIntensity;
  variableSpeed: boolean;
  contextualPauses: boolean;
  cursorHesitation: boolean;
  selectionSimulation: boolean;
  rewritePatterns: boolean;
  thinkingIndicator: boolean;
  baseSpeed: number;
  speedVariance: number;
};

export type AnimatedMarkdownProps = {
  /**
   * Authoritative settled state. Changing this cancels all in-flight and queued
   * work, then snaps to the new markdown with no animation.
   */
  baseText: string;
  versionKey?: string | number;
  caretColor?: string;
  restoreCaretColor?: string;
  className?: string;
  proseClassName?: string;
  /** Where auto-scroll is applied during active edits. */
  scrollMode?: "window" | "container";
  forceReducedMotion?: boolean;
  animationConstants?: Partial<AnimationConstants>;
  onAnimationComplete?: (event: AnimationEvent) => void;
  presenceIntensity?: PresenceIntensity;
  presenceConfig?: Partial<PresenceConfig>;
  /** Stronger diff/selection visuals for demos */
  highVisibilityMode?: boolean;
};

export type AnimatedMarkdownHandle = {
  play(patchSet: PatchSet): Promise<void>;
  restore(targetText: string): Promise<void>;
  skipCurrent(): void;
  cancelQueued(): void;
  cancelAll(): void;
  getText(): string;
};
