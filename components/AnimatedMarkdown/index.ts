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
  TypeSpeed,
} from "./types";
export { useHumanPresence } from "./presence/useHumanPresence";
export { PresenceManager } from "./presence/PresenceManager";
export { PRESET_CONFIGS } from "./presence/types";
export {
  applyDiffHighlightsToText,
  createDiffHighlight,
  DIFF_HIGHLIGHT_DURATION_MS,
  type DiffHighlight,
  type DiffHighlightKind,
} from "./diffHighlights";
export { diffToPatches, expandPatchForAnimation } from "./diffToPatches";
export { defaultAnimationConstants } from "./useAnimation";
