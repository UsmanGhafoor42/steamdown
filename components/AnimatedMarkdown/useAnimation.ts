import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  applyPatch,
  applyPatches,
  findPatchRange,
  sortPatchesInDocumentOrder,
} from "./applyPatches";
import { diffToPatches, expandPatchForAnimation } from "./diffToPatches";
import {
  classifyPatchDiff,
  createDiffHighlight,
  pruneExpiredHighlights,
  type DiffHighlight,
  type DiffHighlightKind,
} from "./diffHighlights";
import { CursorStateMachine } from "./presence/CursorStateMachine";
import type { CursorLifecycleState } from "./presence/CursorStateMachine";
import type { TypingContext } from "./presence/types";
import {
  scrollWindowToFocalPoint,
  waitForStableRect,
  isRectInComfortZone,
} from "./viewport";
import { BatchQueue } from "./batching";
import type {
  AnimatedMarkdownHandle,
  AnimationConstants,
  AnimationEvent,
  Patch,
  PatchSet,
  TypeSpeed,
} from "./types";

type OperationType = "edit" | "restore";
type RenderMode = "markdown" | "split";
type AnimationPhase =
  | "idle"
  | "scrolling"
  | "pausing"
  | "selecting"
  | "deleting"
  | "typing"
  | "settled";

type QueuedOperation = {
  id: number;
  type: OperationType;
  patchSet?: PatchSet;
  targetText?: string;
  resolve: () => void;
  reject: (error: Error) => void;
  settled: boolean;
};

type RunningOperation = QueuedOperation & {
  patches: Patch[];
  finalText: string;
};

type SplitSegments = {
  beforeText: string;
  activeBeforeText: string;
  activeDeleteText: string;
  activeAfterText: string;
  afterText: string;
};

export type AnimationDebugInfo = {
  cursorState: CursorLifecycleState;
  lastScrollTarget: number | null;
  patchLabel: string | null;
};

export type AnimationState = SplitSegments & {
  settledText: string;
  caretColor: string;
  caretVisible: boolean;
  isAnimating: boolean;
  isThinking: boolean;
  cursorState: CursorLifecycleState;
  editContextLabel: string | null;
  mode: RenderMode;
  phase: AnimationPhase;
  activeOperation: OperationType | null;
  diffHighlights: DiffHighlight[];
  diffFadeOut: boolean;
  liveDiffKind: DiffHighlightKind | null;
  selectedDeleteCount: number;
  debugInfo: AnimationDebugInfo | null;
};

type HumanPresenceCallbacks = {
  getDelay: (context: TypingContext) => number;
  getCursorHesitation: (distance: number) => number;
  applyCursorJitter: (x: number, y: number) => { x: number; y: number };
  expandPatches?: (patches: Patch[]) => Patch[];
  getSelectionPauseMs?: () => number;
  isThinkingEnabled?: () => boolean;
};

type UseAnimationOptions = {
  baseText: string;
  versionKey?: string | number;
  caretColor: string;
  restoreCaretColor: string;
  typeSpeed: TypeSpeed;
  speedMultiplier: 0.5 | 1 | 2;
  scrollMode: "window" | "container";
  forceReducedMotion: boolean;
  animationConstants?: Partial<AnimationConstants>;
  onAnimationComplete?: (event: AnimationEvent) => void;
  humanPresence?: HumanPresenceCallbacks;
  showDebugOverlay?: boolean;
};

const EMPTY_SEGMENTS: SplitSegments = {
  beforeText: "",
  activeBeforeText: "",
  activeDeleteText: "",
  activeAfterText: "",
  afterText: "",
};

const DEFAULT_CONSTANTS: AnimationConstants = {
  caretFadeMs: 300,
  preEditPauseMs: 300,
  zeroPauseMs: 150,
  interPatchBeatMs: 150,
  offscreenInterPatchBeatMs: 300,
  scrollMaxMs: 400,
  typeStartMs: 80,
  typeEndMs: 17,
  deleteMsPerChar: 15,
  minDeleteTotalMs: 180,
  maxDeleteTotalMs: 500,
};

const SPEED_FACTORS: Record<TypeSpeed, number> = {
  slow: 1.35,
  normal: 1,
  fast: 0.65,
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export class AnimationCancelledError extends Error {
  constructor(message = "Animation cancelled") {
    super(message);
    this.name = "AnimationCancelledError";
  }
}

function getReducedMotionPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function makeEvent(
  operation: QueuedOperation,
  cancelled: boolean,
): AnimationEvent {
  if (operation.type === "edit") {
    return {
      type: "edit",
      patchSet: operation.patchSet ?? { patches: [] },
      cancelled,
    };
  }

  return {
    type: "restore",
    targetText: operation.targetText ?? "",
    cancelled,
  };
}

function buildTypingContext(
  replaceText: string,
  index: number,
  surroundingText: string,
): TypingContext {
  const currentChar = replaceText[index] ?? "";
  const previousChar = index > 0 ? replaceText[index - 1] : "";
  const nextChar = replaceText[index + 1] ?? "";
  const wordMatch = replaceText.slice(0, index + 1).match(/[\w'-]+$/);
  const wordSoFar = wordMatch?.[0] ?? "";

  return {
    currentChar,
    previousChar,
    nextChar,
    wordSoFar,
    isStartOfLine: index === 0 || replaceText[index - 1] === "\n",
    isEndOfSentence: [".", "!", "?"].includes(previousChar),
    surroundingText,
  };
}

function getInitialState(baseText: string, caretColor: string): AnimationState {
  return {
    ...EMPTY_SEGMENTS,
    settledText: baseText,
    caretColor,
    caretVisible: false,
    isAnimating: false,
    isThinking: false,
    cursorState: "idle",
    editContextLabel: null,
    mode: "markdown",
    phase: "idle",
    activeOperation: null,
    diffHighlights: [],
    diffFadeOut: false,
    liveDiffKind: null,
    selectedDeleteCount: 0,
    debugInfo: null,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function splitGraphemes(text: string) {
  if (text === "") {
    return [];
  }

  if (!graphemeSegmenter) {
    return Array.from(text);
  }

  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

function getExpandedRegion(text: string, start: number, end: number) {
  if (text.length === 0) {
    return { start: 0, end: 0 };
  }

  const previousBreak = text.lastIndexOf("\n\n", start);
  const nextBreak = text.indexOf("\n\n", end);

  return {
    start: previousBreak === -1 ? 0 : previousBreak + 2,
    end: nextBreak === -1 ? text.length : nextBreak,
  };
}

function getElementText(ref: RefObject<HTMLSpanElement | null>) {
  return ref.current?.textContent ?? "";
}

function ensureTextNode(element: HTMLSpanElement) {
  const firstChild = element.firstChild;

  if (firstChild?.nodeType === Node.TEXT_NODE) {
    return firstChild as Text;
  }

  const textNode = document.createTextNode(element.textContent ?? "");
  element.replaceChildren(textNode);
  return textNode;
}

function appendCharacter(
  ref: RefObject<HTMLSpanElement | null>,
  character: string,
) {
  if (!ref.current) {
    return;
  }

  ensureTextNode(ref.current).appendData(character);
}

function deleteLastCharacter(
  ref: RefObject<HTMLSpanElement | null>,
  segmentLength: number,
) {
  if (!ref.current) {
    return;
  }

  const textNode = ensureTextNode(ref.current);

  if (textNode.length > 0) {
    textNode.deleteData(textNode.length - segmentLength, segmentLength);
  }
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

function warnMissingPatch(operation: QueuedOperation, patch: Patch) {
  console.warn("[AnimatedMarkdown] Skipping unresolved patch.", {
    operation: operation.type,
    label: operation.patchSet?.label,
    targetText: operation.targetText,
    patch,
  });
}

function collectHighlightFragments(text: string): string[] {
  const fragments: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("```")) {
      continue;
    }

    // Strip common markdown structural prefixes so we only wrap visible content.
    const candidate = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();

    if (candidate.length < 2 || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    fragments.push(candidate);
  }

  return fragments;
}

export function useAnimationEngine({
  baseText,
  versionKey,
  caretColor,
  restoreCaretColor,
  typeSpeed,
  speedMultiplier,
  scrollMode,
  forceReducedMotion,
  animationConstants,
  onAnimationComplete,
  humanPresence,
  showDebugOverlay = false,
}: UseAnimationOptions) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const constants = useMemo(
    () => ({ ...DEFAULT_CONSTANTS, ...animationConstants }),
    [animationConstants],
  );
  const [state, setState] = useState<AnimationState>(() =>
    getInitialState(baseText, caretColor),
  );
  const textRef = useRef(baseText);
  const modeRef = useRef<RenderMode>("markdown");
  const segmentsRef = useRef<SplitSegments>(EMPTY_SEGMENTS);
  const queueRef = useRef<QueuedOperation[]>([]);
  const currentOperationRef = useRef<RunningOperation | null>(null);
  const operationIdRef = useRef(0);
  const rafIdsRef = useRef(new Set<number>());
  const timerIdsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const wakeupsRef = useRef(new Set<() => void>());
  const scrollInFlightRef = useRef(false);
  const caretColorRef = useRef(caretColor);
  const restoreCaretColorRef = useRef(restoreCaretColor);
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const activeBeforeRef = useRef<HTMLSpanElement | null>(null);
  const activeDeleteRef = useRef<HTMLSpanElement | null>(null);
  const activeAfterRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const humanPresenceRef = useRef(humanPresence);
  const diffHighlightsRef = useRef<DiffHighlight[]>([]);
  const diffFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diffCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorMachineRef = useRef(new CursorStateMachine());
  const lastScrollTargetRef = useRef<number | null>(null);
  const showDebugOverlayRef = useRef(showDebugOverlay);

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    humanPresenceRef.current = humanPresence;
  }, [humanPresence]);

  useEffect(() => {
    showDebugOverlayRef.current = showDebugOverlay;
  }, [showDebugOverlay]);

  useEffect(() => {
    caretColorRef.current = caretColor;
    restoreCaretColorRef.current = restoreCaretColor;
  }, [caretColor, restoreCaretColor]);

  const shouldReduceMotion = useCallback(
    () =>
      forceReducedMotion ||
      prefersReducedMotion ||
      getReducedMotionPreference(),
    [forceReducedMotion, prefersReducedMotion],
  );

  const speedScale = useMemo(
    () => SPEED_FACTORS[typeSpeed] / speedMultiplier,
    [speedMultiplier, typeSpeed],
  );

  const readCurrentText = useCallback(() => {
    if (modeRef.current === "markdown") {
      return textRef.current;
    }

    const segments = segmentsRef.current;

    return (
      segments.beforeText +
      getElementText(activeBeforeRef) +
      getElementText(activeDeleteRef) +
      getElementText(activeAfterRef) +
      segments.afterText
    );
  }, []);

  const updateState = useCallback((nextState: Partial<AnimationState>) => {
    setState((current) => ({
      ...current,
      ...nextState,
    }));
  }, []);

  const clearDiffLifecycleTimers = useCallback(() => {
    if (diffFadeTimerRef.current) {
      clearTimeout(diffFadeTimerRef.current);
      diffFadeTimerRef.current = null;
    }
    if (diffCleanupTimerRef.current) {
      clearTimeout(diffCleanupTimerRef.current);
      diffCleanupTimerRef.current = null;
    }
  }, []);

  const addDiffHighlight = useCallback(
    (kind: DiffHighlightKind, text: string) => {
      if (!text) {
        return;
      }

      const fragments = collectHighlightFragments(text);
      if (fragments.length === 0) {
        return;
      }

      clearDiffLifecycleTimers();
      diffHighlightsRef.current = [
        ...pruneExpiredHighlights(diffHighlightsRef.current),
        ...fragments.map((fragment) => createDiffHighlight(kind, fragment)),
      ];
      updateState({
        diffHighlights: diffHighlightsRef.current,
        diffFadeOut: false,
      });
    },
    [clearDiffLifecycleTimers, updateState],
  );

  const syncCursorState = useCallback(
    (
      phase: AnimationPhase,
      isThinking: boolean,
      patchLabel: string | null = null,
    ) => {
      const mapped = cursorMachineRef.current.mapPhaseToState(phase, isThinking);
      cursorMachineRef.current.transition(mapped);

      if (phase === "settled" || phase === "idle") {
        cursorMachineRef.current.complete();
        cursorMachineRef.current.reset();
      }

      const cursorState = cursorMachineRef.current.getState();
      const debugInfo = showDebugOverlayRef.current
        ? {
            cursorState,
            lastScrollTarget: lastScrollTargetRef.current,
            patchLabel,
          }
        : null;

      updateState({ cursorState, debugInfo });
    },
    [updateState],
  );

  const setMarkdownText = useCallback(
    (nextText: string, nextState: Partial<AnimationState> = {}) => {
      textRef.current = nextText;
      modeRef.current = "markdown";
      segmentsRef.current = EMPTY_SEGMENTS;
      setState((current) => ({
        ...current,
        ...EMPTY_SEGMENTS,
        ...nextState,
        settledText: nextText,
        mode: "markdown",
      }));
    },
    [],
  );

  const setSplitSegments = useCallback(
    (segments: SplitSegments, nextState: Partial<AnimationState> = {}) => {
      modeRef.current = "split";
      segmentsRef.current = segments;
      setState((current) => ({
        ...current,
        ...segments,
        ...nextState,
        mode: "split",
      }));
    },
    [],
  );

  const readDomSegments = useCallback((): SplitSegments => {
    const segments = segmentsRef.current;

    return {
      beforeText: segments.beforeText,
      activeBeforeText: getElementText(activeBeforeRef),
      activeDeleteText: getElementText(activeDeleteRef),
      activeAfterText: getElementText(activeAfterRef),
      afterText: segments.afterText,
    };
  }, []);

  const clearScheduledWork = useCallback(() => {
    for (const frameId of rafIdsRef.current) {
      cancelAnimationFrame(frameId);
    }

    for (const timerId of timerIdsRef.current) {
      clearTimeout(timerId);
    }

    rafIdsRef.current.clear();
    timerIdsRef.current.clear();

    for (const wake of wakeupsRef.current) {
      wake();
    }

    wakeupsRef.current.clear();
    scrollInFlightRef.current = false;
  }, []);

  const delay = useCallback((ms: number) => {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timerId);
        timerIdsRef.current.delete(timerId);
        wakeupsRef.current.delete(wake);
        resolve();
      };
      const timerId = setTimeout(wake, ms);

      timerIdsRef.current.add(timerId);
      wakeupsRef.current.add(wake);
    });
  }, []);

  const nextFrame = useCallback(() => {
    return new Promise<void>((resolve) => {
      const wake = () => {
        cancelAnimationFrame(frameId);
        rafIdsRef.current.delete(frameId);
        wakeupsRef.current.delete(wake);
        resolve();
      };
      const frameId = requestAnimationFrame(wake);

      rafIdsRef.current.add(frameId);
      wakeupsRef.current.add(wake);
    });
  }, []);

  const emitCompletion = useCallback(
    (operation: QueuedOperation, cancelled: boolean) => {
      onAnimationCompleteRef.current?.(makeEvent(operation, cancelled));
    },
    [],
  );

  const rejectOperation = useCallback(
    (operation: QueuedOperation, reason: string) => {
      if (operation.settled) {
        return;
      }

      operation.settled = true;
      operation.reject(new AnimationCancelledError(reason));
      emitCompletion(operation, true);
    },
    [emitCompletion],
  );

  const resolveOperation = useCallback(
    (operation: QueuedOperation) => {
      if (operation.settled) {
        return;
      }

      operation.settled = true;
      operation.resolve();
      emitCompletion(operation, false);
    },
    [emitCompletion],
  );

  const prepareOperation = useCallback(
    (operation: QueuedOperation): RunningOperation => {
      if (operation.type === "restore") {
        const targetText = operation.targetText ?? "";

        return {
          ...operation,
          patches: diffToPatches(readCurrentText(), targetText),
          finalText: targetText,
        };
      }

      const patchSet = operation.patchSet ?? { patches: [] };
      const currentText = readCurrentText();
      const unresolvedPatches = patchSet.patches.filter(
        (patch) => findPatchRange(currentText, patch) === null,
      );

      for (const patch of unresolvedPatches) {
        warnMissingPatch(operation, patch);
      }

      const patches: Patch[] = [];
      let workingText = currentText;

      for (const patch of sortPatchesInDocumentOrder(
        currentText,
        patchSet.patches,
      )) {
        if (findPatchRange(workingText, patch) === null) {
          continue;
        }

        const animationPatches = expandPatchForAnimation(workingText, patch);
        const expandedPatches =
          humanPresenceRef.current?.expandPatches?.(animationPatches) ??
          animationPatches;

        if (expandedPatches.length === 0) {
          continue;
        }

        patches.push(...expandedPatches);
        workingText = applyPatches(workingText, expandedPatches);
      }

      return {
        ...operation,
        patches,
        finalText: workingText,
      };
    },
    [readCurrentText],
  );

  const finishRunningOperation = useCallback(
    (operation: RunningOperation, finalText: string, cancelled: boolean) => {
      currentOperationRef.current = null;
      clearScheduledWork();
      cursorMachineRef.current.complete();
      cursorMachineRef.current.reset();
      setMarkdownText(finalText, {
        caretVisible: false,
        isAnimating: false,
        isThinking: false,
        phase: "settled",
        cursorState: "idle",
        activeOperation: null,
        editContextLabel: null,
        selectedDeleteCount: 0,
        liveDiffKind: null,
        debugInfo: null,
      });

      if (diffHighlightsRef.current.length > 0) {
        clearDiffLifecycleTimers();
        diffFadeTimerRef.current = setTimeout(() => {
          updateState({ diffFadeOut: true });
          diffFadeTimerRef.current = null;
        }, 3000);
        diffCleanupTimerRef.current = setTimeout(() => {
          diffHighlightsRef.current = [];
          updateState({
            diffHighlights: [],
            diffFadeOut: false,
          });
          diffCleanupTimerRef.current = null;
        }, 3600);
      }

      if (cancelled) {
        rejectOperation(operation, "Animation cancelled");
      } else {
        resolveOperation(operation);
      }
    },
    [
      clearDiffLifecycleTimers,
      clearScheduledWork,
      rejectOperation,
      resolveOperation,
      setMarkdownText,
      updateState,
    ],
  );

  const isOperationCurrent = useCallback((operation: RunningOperation) => {
    return currentOperationRef.current?.id === operation.id;
  }, []);

  const measureAndScrollToCaret = useCallback(
    async (operation: RunningOperation) => {
      syncCursorState("scrolling", false);
      updateState({ phase: "scrolling" });

      if (!isOperationCurrent(operation) || shouldReduceMotion()) {
        return false;
      }

      const caret = caretRef.current;

      if (!caret || scrollInFlightRef.current) {
        return false;
      }

      const measureCaret = () => {
        const el = caretRef.current;
        return el ? el.getBoundingClientRect() : null;
      };

      const skipStableWait = constants.scrollMaxMs <= 10;

      const stableRect = skipStableWait
        ? measureCaret()
        : await waitForStableRect(measureCaret);

      if (!stableRect || !isOperationCurrent(operation)) {
        return false;
      }

      const container = containerRef.current;
      const isContainerScroll = scrollMode === "container" && container;
      const viewportHeight = isContainerScroll
        ? container.clientHeight
        : window.innerHeight;

      const zoneRect = isContainerScroll
        ? ({
            ...stableRect,
            top: stableRect.top - container.getBoundingClientRect().top,
            bottom: stableRect.bottom - container.getBoundingClientRect().top,
          } as DOMRect)
        : stableRect;

      if (isRectInComfortZone(zoneRect, viewportHeight)) {
        return false;
      }

      scrollInFlightRef.current = true;
      const targetTop = isContainerScroll
        ? container.scrollTop +
          (stableRect.top - container.getBoundingClientRect().top) -
          viewportHeight * 0.5
        : window.scrollY + stableRect.top - viewportHeight * 0.5;
      lastScrollTargetRef.current = targetTop;

      let didScroll = false;

      if (isContainerScroll) {
        container.scrollTo({
          top: targetTop,
          behavior: shouldReduceMotion() ? "auto" : "smooth",
        });
        await delay(constants.scrollMaxMs);
        didScroll = true;
      } else {
        didScroll = await scrollWindowToFocalPoint(stableRect, {
          viewportHeight,
          focalRatio: 0.5,
          maxDurationMs: constants.scrollMaxMs,
          behavior: shouldReduceMotion() ? "auto" : "smooth",
        });
      }

      scrollInFlightRef.current = false;
      return didScroll;
    },
    [
      constants.scrollMaxMs,
      delay,
      isOperationCurrent,
      scrollMode,
      shouldReduceMotion,
      syncCursorState,
      updateState,
    ],
  );

  const getDeleteDelay = useCallback(
    (length: number) => {
      if (length <= 0) {
        return 0;
      }

      const rawTotal = constants.deleteMsPerChar * speedScale * length;
      const clampedTotal = clamp(
        rawTotal,
        constants.minDeleteTotalMs,
        constants.maxDeleteTotalMs,
      );

      return clampedTotal / length;
    },
    [constants, speedScale],
  );

  const getBaseTypeDelay = useCallback(
    (index: number, length: number) => {
      if (length <= 1) {
        return constants.typeEndMs;
      }

      return lerp(
        constants.typeStartMs,
        constants.typeEndMs,
        index / (length - 1),
      );
    },
    [constants.typeEndMs, constants.typeStartMs],
  );

  const getTypeDelay = useCallback(
    (
      index: number,
      length: number,
      replaceText: string,
      surroundingText: string,
    ) => {
      const baseDelay = getBaseTypeDelay(index, length) * speedScale;
      const presence = humanPresenceRef.current;

      if (!presence) {
        return baseDelay;
      }

      const context = buildTypingContext(replaceText, index, surroundingText);
      const presenceDelay = presence.getDelay(context);
      const hesitationDelay =
        baseDelay <= 5
          ? 0
          : presence.getCursorHesitation(index === 0 ? 120 : 24);
      const referenceDelay = (1000 / 35) * speedScale;
      const presenceMultiplier =
        (presenceDelay + hesitationDelay) / referenceDelay;

      return baseDelay * clamp(presenceMultiplier, 0.55, 2.4);
    },
    [getBaseTypeDelay, speedScale],
  );

  const coalesceHeavyPatches = useCallback(async (patches: Patch[]) => {
    if (patches.length < 8) {
      return patches;
    }

    const queue = new BatchQueue({
      timeWindowMs: 8,
      maxBatchSize: Math.max(20, patches.length),
      minPatchesForImmediate: 1,
      enableAdaptiveSizing: true,
    });
    let coalesced: Patch[] = patches;

    queue.setProcessor(async (nextPatches) => {
      coalesced = nextPatches;
    });

    await queue.enqueueAll(patches, 0);
    queue.clear();
    return coalesced;
  }, []);

  const animatePatch = useCallback(
    async (
      operation: RunningOperation,
      patch: Patch,
      isFirstPatch: boolean,
      isLastPatch: boolean,
    ) => {
      const currentDocument = textRef.current;
      const range = findPatchRange(currentDocument, patch);

      if (!range) {
        warnMissingPatch(operation, patch);
        const nextText = applyPatch(currentDocument, patch);
        textRef.current = nextText;
        return;
      }

      const region = getExpandedRegion(currentDocument, range.start, range.end);
      const regionPrefix = currentDocument.slice(region.start, range.start);
      const regionSuffix = currentDocument.slice(range.end, region.end);
      const findText = currentDocument.slice(range.start, range.end);
      const findUnits = splitGraphemes(findText);
      const replaceUnits = splitGraphemes(patch.replace);
      const liveDiffKind = classifyPatchDiff(findText, patch.replace);
      const patchLabel = operation.patchSet?.label ?? null;
      const segments: SplitSegments = {
        beforeText: currentDocument.slice(0, region.start),
        activeBeforeText: regionPrefix,
        activeDeleteText: findText,
        activeAfterText: regionSuffix,
        afterText: currentDocument.slice(region.end),
      };

      const thinkingEnabled =
        humanPresenceRef.current?.isThinkingEnabled?.() ?? false;

      // Predictive pause BEFORE the visible edit region mounts (feels intentional).
      const usePredictivePause =
        constants.preEditPauseMs > 0 || constants.caretFadeMs > 0;

      if (usePredictivePause && (thinkingEnabled || isFirstPatch)) {
        cursorMachineRef.current.transition("thinking");
        updateState({
          phase: "pausing",
          isThinking: thinkingEnabled,
          cursorState: "thinking",
          editContextLabel: patchLabel,
          caretVisible: false,
          isAnimating: true,
          liveDiffKind: null,
        });
        if (isFirstPatch) {
          await delay(constants.caretFadeMs);
        }
        await delay(constants.preEditPauseMs);
      }

      if (!isOperationCurrent(operation)) {
        return;
      }

      setSplitSegments(segments, {
        activeOperation: operation.type,
        caretColor:
          operation.type === "restore"
            ? restoreCaretColorRef.current
            : caretColorRef.current,
        caretVisible: true,
        isAnimating: true,
        phase: "scrolling",
        isThinking: false,
        editContextLabel: patchLabel,
        liveDiffKind,
        selectedDeleteCount: 0,
      });
      syncCursorState("scrolling", false, patchLabel);

      await nextFrame();
      await nextFrame();

      const didScroll = await measureAndScrollToCaret(operation);

      if (!isOperationCurrent(operation)) {
        return;
      }

      setSplitSegments(readDomSegments(), {
        caretVisible: true,
        phase: "pausing",
        isThinking: false,
        liveDiffKind,
        selectedDeleteCount: 0,
      });
      syncCursorState("pausing", false, patchLabel);

      if (!isOperationCurrent(operation)) {
        return;
      }

      const selectionPause =
        findUnits.length > 0
          ? Math.max(220, humanPresenceRef.current?.getSelectionPauseMs?.() ?? 0)
          : 0;

      if (selectionPause > 0) {
        const selectionStepDelay = Math.max(
          30,
          selectionPause / Math.max(1, findUnits.length),
        );
        for (
          let selectedCount = 1;
          selectedCount <= findUnits.length && isOperationCurrent(operation);
          selectedCount += 1
        ) {
          setSplitSegments(readDomSegments(), {
            phase: "selecting",
            isThinking: false,
            liveDiffKind,
            selectedDeleteCount: selectedCount,
          });
          await delay(selectionStepDelay);
        }
        await delay(120);
        syncCursorState("selecting", false, patchLabel);
      }

      if (!isOperationCurrent(operation)) {
        return;
      }

      setSplitSegments(readDomSegments(), {
        phase: "deleting",
        isThinking: false,
        liveDiffKind,
        selectedDeleteCount: findUnits.length,
      });
      syncCursorState("deleting", false, patchLabel);

      const deleteDelay = getDeleteDelay(findUnits.length);
      if (findUnits.length > 0) {
        await delay(deleteDelay);
        await nextFrame();
        if (activeDeleteRef.current) {
          activeDeleteRef.current.textContent = "";
        }
        setSplitSegments(readDomSegments(), {
          phase: "deleting",
          liveDiffKind,
          selectedDeleteCount: 0,
        });
      }

      if (!isOperationCurrent(operation)) {
        return;
      }

      await delay(constants.zeroPauseMs);

      setSplitSegments(readDomSegments(), {
        phase: "typing",
        isThinking: false,
        liveDiffKind: "add",
        selectedDeleteCount: 0,
      });
      syncCursorState("typing", false, patchLabel);

      const surroundingText =
        segments.beforeText + regionPrefix + patch.replace + regionSuffix;

      for (
        let typedCount = 0;
        typedCount < replaceUnits.length && isOperationCurrent(operation);
        typedCount += 1
      ) {
        await delay(
          getTypeDelay(
            typedCount,
            replaceUnits.length,
            patch.replace,
            surroundingText,
          ),
        );
        await nextFrame();
        appendCharacter(activeBeforeRef, replaceUnits[typedCount]);
        setSplitSegments(readDomSegments(), {
          phase: "typing",
          liveDiffKind: "add",
          selectedDeleteCount: 0,
        });
      }

      textRef.current =
        segments.beforeText +
        regionPrefix +
        patch.replace +
        regionSuffix +
        segments.afterText;

      const settledKind = classifyPatchDiff(findText, patch.replace);
      if (settledKind === "rewrite") {
        addDiffHighlight("rewrite", findText);
        if (patch.replace && patch.replace !== findText) {
          addDiffHighlight("add", patch.replace);
        }
      } else {
        if (findText) {
          addDiffHighlight("remove", findText);
        }
        if (patch.replace) {
          addDiffHighlight("add", patch.replace);
        }
      }

      cursorMachineRef.current.transition("resolving");
      updateState({
        liveDiffKind: null,
        editContextLabel: null,
        selectedDeleteCount: 0,
        cursorState: "resolving",
      });

      if (!isOperationCurrent(operation) || isLastPatch) {
        return;
      }

      await delay(
        didScroll
          ? constants.offscreenInterPatchBeatMs
          : constants.interPatchBeatMs,
      );
    },
    [
      constants.caretFadeMs,
      constants.interPatchBeatMs,
      constants.offscreenInterPatchBeatMs,
      constants.preEditPauseMs,
      constants.zeroPauseMs,
      delay,
      getDeleteDelay,
      getTypeDelay,
      addDiffHighlight,
      isOperationCurrent,
      measureAndScrollToCaret,
      nextFrame,
      readDomSegments,
      setSplitSegments,
      syncCursorState,
      updateState,
    ],
  );

  const startNextOperationRef = useRef<() => void>(() => undefined);

  const runOperation = useCallback(
    async (operation: RunningOperation) => {
      if (shouldReduceMotion() || operation.patches.length === 0) {
        finishRunningOperation(operation, operation.finalText, false);
        startNextOperationRef.current();
        return;
      }

      const patchesToRun = await coalesceHeavyPatches(operation.patches);

      if (!isOperationCurrent(operation)) {
        return;
      }

      setMarkdownText(textRef.current, {
        activeOperation: operation.type,
        caretColor:
          operation.type === "restore"
            ? restoreCaretColorRef.current
            : caretColorRef.current,
        caretVisible: false,
        isAnimating: true,
        phase: "idle",
      });

      for (let index = 0; index < patchesToRun.length; index += 1) {
        if (!isOperationCurrent(operation)) {
          return;
        }

        await animatePatch(
          operation,
          patchesToRun[index],
          index === 0,
          index === patchesToRun.length - 1,
        );
      }

      if (!isOperationCurrent(operation)) {
        return;
      }

      setSplitSegments(readDomSegments(), {
        caretVisible: false,
        phase: "settled",
        selectedDeleteCount: 0,
      });
      await delay(constants.caretFadeMs);

      if (!isOperationCurrent(operation)) {
        return;
      }

      finishRunningOperation(operation, textRef.current, false);
      startNextOperationRef.current();
    },
    [
      animatePatch,
      coalesceHeavyPatches,
      constants.caretFadeMs,
      delay,
      finishRunningOperation,
      isOperationCurrent,
      readDomSegments,
      setMarkdownText,
      setSplitSegments,
      shouldReduceMotion,
    ],
  );

  const startNextOperation = useCallback(() => {
    if (currentOperationRef.current) {
      return;
    }

    const nextOperation = queueRef.current.shift();

    if (!nextOperation) {
      return;
    }

    const runningOperation = prepareOperation(nextOperation);

    currentOperationRef.current = runningOperation;
    void runOperation(runningOperation);
  }, [prepareOperation, runOperation]);

  useEffect(() => {
    startNextOperationRef.current = startNextOperation;
  }, [startNextOperation]);

  const enqueueOperation = useCallback(
    (
      operation: Omit<QueuedOperation, "id" | "resolve" | "reject" | "settled">,
    ) => {
      return new Promise<void>((resolve, reject) => {
        const queuedOperation: QueuedOperation = {
          ...operation,
          id: operationIdRef.current + 1,
          resolve,
          reject,
          settled: false,
        };

        operationIdRef.current = queuedOperation.id;
        queueRef.current.push(queuedOperation);
        startNextOperation();
      });
    },
    [startNextOperation],
  );

  const cancelQueued = useCallback(() => {
    const queuedOperations = queueRef.current.splice(0);

    for (const operation of queuedOperations) {
      rejectOperation(operation, "Queued animation cancelled");
    }
  }, [rejectOperation]);

  const skipCurrent = useCallback(() => {
    const operation = currentOperationRef.current;

    if (!operation) {
      return;
    }

    finishRunningOperation(operation, operation.finalText, false);
    startNextOperation();
  }, [finishRunningOperation, startNextOperation]);

  const cancelAll = useCallback(() => {
    cancelQueued();

    const operation = currentOperationRef.current;

    if (!operation) {
      return;
    }

    finishRunningOperation(operation, operation.finalText, true);
  }, [cancelQueued, finishRunningOperation]);

  const handle = useMemo<AnimatedMarkdownHandle>(
    () => ({
      play(patchSet: PatchSet) {
        return enqueueOperation({
          type: "edit",
          patchSet,
        });
      },
      restore(targetText: string) {
        return enqueueOperation({
          type: "restore",
          targetText,
        });
      },
      skipCurrent,
      cancelQueued,
      cancelAll,
      getText() {
        return readCurrentText();
      },
    }),
    [cancelAll, cancelQueued, enqueueOperation, readCurrentText, skipCurrent],
  );

  useEffect(() => {
    const current = currentOperationRef.current;
    const queued = queueRef.current.splice(0);

    clearScheduledWork();
    clearDiffLifecycleTimers();

    if (current) {
      currentOperationRef.current = null;
      rejectOperation(current, "Version reset cancelled animation");
    }

    for (const operation of queued) {
      rejectOperation(operation, "Version reset cancelled queued animation");
    }

    textRef.current = baseText;
    modeRef.current = "markdown";
    segmentsRef.current = EMPTY_SEGMENTS;
    setState(getInitialState(baseText, caretColorRef.current));
  }, [
    baseText,
    clearDiffLifecycleTimers,
    clearScheduledWork,
    rejectOperation,
    versionKey,
  ]);

  useEffect(() => {
    return () => {
      clearScheduledWork();
      clearDiffLifecycleTimers();
      const current = currentOperationRef.current;
      // Cleanup intentionally observes the latest queue ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const queued = queueRef.current.splice(0);

      if (current) {
        rejectOperation(current, "Component unmounted");
      }

      for (const operation of queued) {
        rejectOperation(operation, "Component unmounted");
      }
    };
  }, [clearDiffLifecycleTimers, clearScheduledWork, rejectOperation]);

  return {
    state,
    handle,
    caretRef: caretRef as RefObject<HTMLSpanElement>,
    activeBeforeRef: activeBeforeRef as RefObject<HTMLSpanElement>,
    activeDeleteRef: activeDeleteRef as RefObject<HTMLSpanElement>,
    activeAfterRef: activeAfterRef as RefObject<HTMLSpanElement>,
    containerRef: containerRef as RefObject<HTMLDivElement>,
  };
}

export { DEFAULT_CONSTANTS as defaultAnimationConstants };
