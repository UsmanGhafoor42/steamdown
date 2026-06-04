export { AnimatedMarkdown } from "./AnimatedMarkdown";
export { MultiStreamView } from "./MultiStreamView";
export type { StreamSlot } from "./MultiStreamView";
export type {
  AnimatedMarkdownHandle,
  AnimatedMarkdownProps,
  AnimationConstants,
  AnimationEvent,
  Patch,
  PatchSet,
  PresenceConfig,
  PresenceIntensity,
} from "./types";
export { useHumanPresence } from "./presence/useHumanPresence";
export { PresenceManager } from "./presence/PresenceManager";
export { CursorStateMachine } from "./presence/CursorStateMachine";
export type { CursorLifecycleState } from "./presence/CursorStateMachine";
export {
  scrollWindowToFocalPoint,
  waitForStableRect,
  isRectInComfortZone,
} from "./viewport";
export { PRESET_CONFIGS } from "./presence/types";
export {
  applyDiffHighlightsToText,
  classifyPatchDiff,
  createDiffHighlight,
  DIFF_HIGHLIGHT_DURATION_MS,
  wrapLiveDiffMarkup,
  type DiffHighlight,
  type DiffHighlightKind,
} from "./diffHighlights";
export { diffToPatches, expandPatchForAnimation } from "./diffToPatches";
export { defaultAnimationConstants } from "./useAnimation";
