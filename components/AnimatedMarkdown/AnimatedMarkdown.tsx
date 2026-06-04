"use client";

import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import { Streamdown } from "streamdown";
import type {
  AnimatedMarkdownHandle,
  AnimatedMarkdownProps,
  PresenceConfig,
  PresenceIntensity,
} from "./types";
import { useAnimationEngine } from "./useAnimation";
import {
  applyDiffHighlightsToText,
  wrapLiveDiffMarkup,
} from "./diffHighlights";
import { useHumanPresence } from "./presence/useHumanPresence";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Zero-width space used as an invisible caret position marker. */
const CARET_MARKER = "\u200B\u200B";
const STREAMDOWN_ALLOWED_TAGS: Record<string, string[]> = {
  // Streamdown sanitize uses HAST property names (`className`) but we keep
  // raw HTML names too (`class`, `data-diff-id`) for compatibility.
  span: ["className", "class", "dataDiffId", "data-diff-id"],
};

const MarkdownChunk = memo(function MarkdownChunk({
  text,
  className,
  isStreaming,
}: {
  text: string;
  className: string;
  isStreaming?: boolean;
}) {
  if (text === "") {
    return null;
  }

  return (
    <Streamdown
      className={className}
      lineNumbers={false}
      mode={isStreaming ? "streaming" : "static"}
      parseIncompleteMarkdown={isStreaming}
      skipHtml={false}
      remarkRehypeOptions={{ allowDangerousHtml: true }}
      allowedTags={STREAMDOWN_ALLOWED_TAGS}
    >
      {text}
    </Streamdown>
  );
});

/**
 * Walk text nodes under `root` to find the double zero-width space marker.
 * Returns the text node and offset, or null.
 */
function findMarkerInDom(
  root: HTMLElement,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const idx = textNode.data.indexOf(CARET_MARKER);
    if (idx !== -1) {
      return { node: textNode, offset: idx };
    }
  }
  return null;
}

function getInsertionPoint(marker: { node: Text; offset: number }) {
  const markerPrefix = marker.node.data.slice(0, marker.offset);
  const visiblePrefix = markerPrefix.replaceAll("\u200B", "");

  if (visiblePrefix.length > 0) {
    return { node: marker.node, offset: marker.offset };
  }

  // Keep caret on the active edit node when marker starts a text node.
  // Falling back to the previous text node can make the caret appear stuck
  // on the line above during list/line-boundary edits.
  return {
    node: marker.node,
    offset: marker.offset + CARET_MARKER.length,
  };
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function wrapSelectionMarkup(text: string) {
  if (!text) {
    return text;
  }

  return `<span class="animated-markdown-selection">${escapeHtml(text)}</span>`;
}

function canUseInlineMarkup(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("\n")) {
    return false;
  }

  // Avoid wrapping markdown block syntax with inline spans.
  return !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~)/.test(trimmed);
}

function getActiveDeleteDisplay(
  phase: string,
  activeDeleteText: string,
  liveDiffKind: "add" | "remove" | "rewrite" | null,
  selectedDeleteCount: number,
) {
  if (!activeDeleteText) {
    return activeDeleteText;
  }

  if (phase === "selecting") {
    if (!canUseInlineMarkup(activeDeleteText)) {
      return activeDeleteText;
    }

    const units = Array.from(activeDeleteText);
    const count = Math.max(0, Math.min(selectedDeleteCount, units.length));
    const unselectedText = escapeHtml(units.slice(0, units.length - count).join(""));
    const selectedText = units.slice(units.length - count).join("");
    if (!selectedText) {
      return unselectedText;
    }
    return `${unselectedText}${wrapSelectionMarkup(selectedText)}`;
  }

  if (phase === "deleting") {
    if (!canUseInlineMarkup(activeDeleteText)) {
      return activeDeleteText;
    }

    const kind = liveDiffKind === "rewrite" ? "rewrite" : "remove";
    return wrapLiveDiffMarkup(activeDeleteText, kind);
  }

  return activeDeleteText;
}

function getInsertionCaretRect(marker: { node: Text; offset: number }) {
  const range = document.createRange();
  const insertionPoint = getInsertionPoint(marker);

  range.setStart(insertionPoint.node, insertionPoint.offset);
  range.collapse(true);
  const probe = document.createElement("span");
  const parent = marker.node.parentNode;

  probe.setAttribute("aria-hidden", "true");
  probe.setAttribute("data-animated-markdown-caret-probe", "true");
  probe.style.display = "inline-block";
  probe.style.width = "0";
  probe.style.height = "1em";
  probe.style.margin = "0";
  probe.style.padding = "0";
  probe.style.overflow = "hidden";
  probe.style.pointerEvents = "none";

  range.insertNode(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  parent?.normalize();

  return rect;
}

const HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
};

export type { PresenceConfig, PresenceIntensity };

export const AnimatedMarkdown = forwardRef<
  AnimatedMarkdownHandle,
  AnimatedMarkdownProps
>(function AnimatedMarkdown(
  {
    baseText,
    versionKey,
    caretColor = "currentColor",
    restoreCaretColor = "color-mix(in srgb, currentColor 55%, transparent)",
    className,
    proseClassName,
    scrollMode = "window",
    forceReducedMotion = false,
    animationConstants,
    onAnimationComplete,
    presenceIntensity = "normal",
    presenceConfig,
    highVisibilityMode = false,
  },
  ref,
) {
  // Initialize Human Presence Hook
  const {
    getDelay,
    getCursorHesitation,
    applyCursorJitter,
    expandPatches,
    getSelectionPauseMs,
    isThinkingEnabled,
  } = useHumanPresence({
    intensity: presenceIntensity,
    config: presenceConfig,
  });

  const {
    state,
    handle,
    caretRef,
    activeBeforeRef,
    activeDeleteRef,
    activeAfterRef,
    containerRef,
  } = useAnimationEngine({
    baseText,
    versionKey,
    caretColor,
    restoreCaretColor,
    scrollMode,
    forceReducedMotion,
    animationConstants,
    onAnimationComplete,
    humanPresence: {
      getDelay,
      getCursorHesitation,
      applyCursorJitter,
      expandPatches,
      getSelectionPauseMs,
      isThinkingEnabled,
    },
  });

  useImperativeHandle(ref, () => handle, [handle]);

  const streamdownClasses = joinClasses(
    "prose max-w-none dark:prose-invert",
    proseClassName,
  );

  const activeDeleteDisplay = getActiveDeleteDisplay(
    state.phase,
    state.activeDeleteText,
    state.liveDiffKind,
    state.selectedDeleteCount,
  );

  const activeBeforeDisplay =
    state.phase === "typing" &&
    state.activeBeforeText &&
    canUseInlineMarkup(state.activeBeforeText)
      ? wrapLiveDiffMarkup(state.activeBeforeText, "add")
      : state.activeBeforeText;

  const composedText =
    state.mode === "split"
      ? state.beforeText +
        activeBeforeDisplay +
        CARET_MARKER +
        activeDeleteDisplay +
        state.activeAfterText +
        state.afterText
      : "";

  const highlightedSettledText = applyDiffHighlightsToText(
    state.settledText,
    state.diffHighlights,
    state.diffFadeOut,
  );

  const showCaret =
    state.caretVisible &&
    state.cursorState !== "idle" &&
    state.cursorState !== "completed";
  const isBlockSelecting =
    state.phase === "selecting" &&
    state.selectedDeleteCount > 0 &&
    state.activeDeleteText.includes("\n");

  // Set initial text content on hidden spans imperatively so React
  // never manages their children (preventing re-render resets).
  useLayoutEffect(() => {
    if (state.mode !== "split") return;
    if (activeBeforeRef.current)
      activeBeforeRef.current.textContent = state.activeBeforeText;
    if (activeDeleteRef.current)
      activeDeleteRef.current.textContent = state.activeDeleteText;
    if (activeAfterRef.current)
      activeAfterRef.current.textContent = state.activeAfterText;
  }, [
    state.mode,
    state.activeBeforeText,
    state.activeDeleteText,
    state.activeAfterText,
    activeBeforeRef,
    activeDeleteRef,
    activeAfterRef,
  ]);

  useLayoutEffect(() => {
    if (state.mode !== "split") return;
    if (!showCaret && state.phase !== "scrolling") return;

    let frameId = 0;

    const positionCaret = () => {
      const contentEl = containerRef.current?.querySelector<HTMLElement>(
        '[data-animated-markdown-content="true"]',
      );
      const caret = caretRef.current;
      if (!contentEl || !caret) return;

      const marker = findMarkerInDom(contentEl);
      if (!marker) return;

      const markerRect = getInsertionCaretRect(marker);
      const containerRect = contentEl.getBoundingClientRect();
      const jitteredPos = applyCursorJitter(
        markerRect.left - containerRect.left,
        markerRect.top - containerRect.top,
      );

      caret.style.left = `${jitteredPos.x}px`;
      caret.style.top = `${jitteredPos.y}px`;
      caret.style.height = `${markerRect.height}px`;
    };

    frameId = requestAnimationFrame(positionCaret);
    return () => cancelAnimationFrame(frameId);
  }, [
    composedText,
    state.mode,
    state.caretVisible,
    state.cursorState,
    state.phase,
    applyCursorJitter,
    caretRef,
    containerRef,
  ]);

  const displayText =
    state.mode === "split" ? composedText : highlightedSettledText;
  const useStreamingMarkdown = state.mode === "split";
  const caretAnimation =
    (state.isThinking || state.cursorState === "thinking") && showCaret
      ? "animated-markdown-caret-thinking 1200ms ease-in-out infinite"
      : showCaret
        ? "animated-markdown-caret-blink 900ms steps(2, start) infinite"
        : "none";

  return (
    <div
      ref={containerRef}
      aria-busy={state.isAnimating}
      className={joinClasses(
        "animated-markdown-root",
        highVisibilityMode ? "animated-markdown-high-visibility" : undefined,
        className,
      )}
      data-operation={state.activeOperation ?? "idle"}
      data-phase={state.phase}
      data-cursor-state={state.cursorState}
      data-thinking={state.isThinking ? "true" : "false"}
      style={
        {
          "--animated-markdown-caret-animation": caretAnimation,
          "--animated-markdown-caret-color": state.caretColor,
          "--animated-markdown-caret-opacity": showCaret ? 1 : 0,
        } as CSSProperties
      }
    >
      {/* Always rendered markdown — never raw text */}
      <div
        data-animated-markdown-content="true"
        className={isBlockSelecting ? "animated-markdown-block-selection" : undefined}
        style={{ position: "relative" }}
      >
        <MarkdownChunk
          className={streamdownClasses}
          isStreaming={useStreamingMarkdown}
          text={displayText}
        />

        {/* Absolutely-positioned caret inside rendered content */}
        {state.mode === "split" && showCaret && (
          <span
            ref={caretRef}
            aria-hidden="true"
            className={joinClasses(
              "animated-markdown-caret",
              state.cursorState === "thinking" || state.isThinking
                ? "animated-markdown-caret-thinking"
                : state.cursorState === "selecting"
                  ? "animated-markdown-caret-selecting"
                  : undefined,
            )}
            style={{ position: "absolute" }}
          />
        )}
      </div>

      {state.mode === "split" && (
        <div aria-label="Animated markdown patch region" style={HIDDEN_STYLE}>
          <span ref={activeBeforeRef} />
          <span ref={activeDeleteRef} />
          <span ref={activeAfterRef} />
        </div>
      )}
    </div>
  );
});

AnimatedMarkdown.displayName = "AnimatedMarkdown";
