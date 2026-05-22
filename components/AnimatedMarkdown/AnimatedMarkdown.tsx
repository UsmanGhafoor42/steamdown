// "use client";

// import {
//   forwardRef,
//   memo,
//   useImperativeHandle,
//   useLayoutEffect,
//   type CSSProperties,
// } from "react";
// import { Streamdown } from "streamdown";
// import type { AnimatedMarkdownHandle, AnimatedMarkdownProps } from "./types";
// import { useAnimationEngine } from "./useAnimation";

// function joinClasses(...classes: Array<string | undefined>) {
//   return classes.filter(Boolean).join(" ");
// }

// /** Zero-width space used as an invisible caret position marker. */
// const CARET_MARKER = "\u200B\u200B";

// const MarkdownChunk = memo(function MarkdownChunk({
//   text,
//   className,
//   isStreaming,
// }: {
//   text: string;
//   className: string;
//   isStreaming?: boolean;
// }) {
//   if (text === "") {
//     return null;
//   }

//   return (
//     <Streamdown
//       className={className}
//       lineNumbers={false}
//       mode={isStreaming ? "streaming" : "static"}
//       parseIncompleteMarkdown={isStreaming}
//     >
//       {text}
//     </Streamdown>
//   );
// });

// /**
//  * Walk text nodes under `root` to find the double zero-width space marker.
//  * Returns the text node and offset, or null.
//  */
// function findMarkerInDom(
//   root: HTMLElement,
// ): { node: Text; offset: number } | null {
//   const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
//   let textNode: Text | null;
//   while ((textNode = walker.nextNode() as Text | null)) {
//     const idx = textNode.data.indexOf(CARET_MARKER);
//     if (idx !== -1) {
//       return { node: textNode, offset: idx };
//     }
//   }
//   return null;
// }

// function getInsertionCaretRect(marker: { node: Text; offset: number }) {
//   const range = document.createRange();
//   const insertionOffset = marker.offset + CARET_MARKER.length;

//   range.setStart(marker.node, insertionOffset);
//   range.collapse(true);
//   const probe = document.createElement("span");
//   const parent = marker.node.parentNode;

//   probe.setAttribute("aria-hidden", "true");
//   probe.setAttribute("data-animated-markdown-caret-probe", "true");
//   probe.style.display = "inline-block";
//   probe.style.width = "0";
//   probe.style.height = "1em";
//   probe.style.margin = "0";
//   probe.style.padding = "0";
//   probe.style.overflow = "hidden";
//   probe.style.pointerEvents = "none";

//   range.insertNode(probe);
//   const rect = probe.getBoundingClientRect();
//   probe.remove();
//   parent?.normalize();

//   return rect;
// }

// const HIDDEN_STYLE: CSSProperties = {
//   position: "absolute",
//   width: 0,
//   height: 0,
//   overflow: "hidden",
//   opacity: 0,
//   pointerEvents: "none",
// };

// export const AnimatedMarkdown = forwardRef<
//   AnimatedMarkdownHandle,
//   AnimatedMarkdownProps
// >(function AnimatedMarkdown(
//   {
//     baseText,
//     versionKey,
//     caretColor = "currentColor",
//     restoreCaretColor = "color-mix(in srgb, currentColor 55%, transparent)",
//     className,
//     proseClassName,
//     typeSpeed = "normal",
//     speedMultiplier = 1,
//     forceReducedMotion = false,
//     animationConstants,
//     onAnimationComplete,
//   },
//   ref,
// ) {
//   const {
//     state,
//     handle,
//     caretRef,
//     activeBeforeRef,
//     activeDeleteRef,
//     activeAfterRef,
//     containerRef,
//   } = useAnimationEngine({
//     baseText,
//     versionKey,
//     caretColor,
//     restoreCaretColor,
//     typeSpeed,
//     speedMultiplier,
//     forceReducedMotion,
//     animationConstants,
//     onAnimationComplete,
//   });

//   useImperativeHandle(ref, () => handle, [handle]);

//   const streamdownClasses = joinClasses(
//     "prose max-w-none dark:prose-invert",
//     proseClassName,
//   );

//   // const composedText =
//   //   state.mode === "split"
//   //     ? state.beforeText +
//   //       state.activeBeforeText +
//   //       CARET_MARKER +
//   //       state.activeDeleteText +
//   //       state.activeAfterText +
//   //       state.afterText
//   //     : "";
//   const composedText =
//     state.mode === "split"
//       ? state.beforeText +
//         state.activeBeforeText +
//         CARET_MARKER +
//         state.activeDeleteText +
//         state.activeAfterText +
//         state.afterText
//       : "";

//   // Set initial text content on hidden spans imperatively so React
//   // never manages their children (preventing re-render resets).
//   useLayoutEffect(() => {
//     if (state.mode !== "split") return;
//     if (activeBeforeRef.current)
//       activeBeforeRef.current.textContent = state.activeBeforeText;
//     if (activeDeleteRef.current)
//       activeDeleteRef.current.textContent = state.activeDeleteText;
//     if (activeAfterRef.current)
//       activeAfterRef.current.textContent = state.activeAfterText;
//   }, [
//     state.mode,
//     state.activeBeforeText,
//     state.activeDeleteText,
//     state.activeAfterText,
//     activeBeforeRef,
//     activeDeleteRef,
//     activeAfterRef,
//   ]);

//   // ── Caret overlay positioning ────────────────────────────────────
//   // After the rendered markdown updates, find the marker in the DOM
//   // and position the absolutely-placed caret element there.

//   // useLayoutEffect(() => {
//   //   if (state.mode !== "split" || !state.caretVisible) return;

//   //   const contentEl = containerRef.current?.querySelector<HTMLElement>(
//   //     '[data-animated-markdown-content="true"]',
//   //   );
//   //   const caret = caretRef.current;
//   //   if (!contentEl || !caret) return;

//   //   const marker = findMarkerInDom(contentEl);
//   //   if (!marker) return;

//   //   const markerRect = getInsertionCaretRect(marker);
//   //   if (!markerRect) return;

//   //   const containerRect = contentEl.getBoundingClientRect();
//   //   const markerHeight = markerRect.height > 0 ? `${markerRect.height}px` : "";

//   //   caret.style.position = "absolute";
//   //   // Use the collapsed insertion point rather than the marker span width.
//   //   // That keeps the caret pinned to the live edit location even when the
//   //   // hidden marker crosses wrapped lines or browsers assign it glyph width.
//   //   caret.style.left = `${markerRect.left - containerRect.left}px`;
//   //   caret.style.top = `${markerRect.top - containerRect.top}px`;
//   //   caret.style.height = markerHeight;
//   // }, [composedText, state.mode, state.caretVisible, caretRef, containerRef]);

//   useLayoutEffect(() => {
//     if (state.mode !== "split" || !state.caretVisible) return;

//     const frame = requestAnimationFrame(() => {
//       const contentEl = containerRef.current?.querySelector<HTMLElement>(
//         '[data-animated-markdown-content="true"]',
//       );

//       const caret = caretRef.current;

//       if (!contentEl || !caret) return;

//       const marker = findMarkerInDom(contentEl);

//       if (!marker) return;

//       const markerRect = getInsertionCaretRect(marker);

//       const containerRect = contentEl.getBoundingClientRect();

//       caret.style.left = `${markerRect.left - containerRect.left}px`;
//       caret.style.top = `${markerRect.top - containerRect.top}px`;
//       caret.style.height = `${markerRect.height}px`;
//     });

//     return () => cancelAnimationFrame(frame);
//   }, [composedText, state.mode, state.caretVisible]);

//   // The text passed to MarkdownChunk: during split mode we include the
//   // zero-width marker so the layout effect can locate it for caret positioning.
//   // Zero-width spaces are invisible so they don't affect the rendered output.
//   const displayText = state.mode === "split" ? composedText : state.settledText;
//   const useStreamingMarkdown = state.mode === "split";

//   return (
//     <div
//       ref={containerRef}
//       aria-busy={state.isAnimating}
//       className={joinClasses("animated-markdown-root", className)}
//       data-operation={state.activeOperation ?? "idle"}
//       data-phase={state.phase}
//       style={
//         {
//           "--animated-markdown-caret-animation": state.caretVisible
//             ? "animated-markdown-caret-blink 900ms steps(2, start) infinite"
//             : "none",
//           "--animated-markdown-caret-color": state.caretColor,
//           "--animated-markdown-caret-opacity": state.caretVisible ? 1 : 0,
//         } as CSSProperties
//       }
//     >
//       {/* Always rendered markdown — never raw text */}
//       <div
//         data-animated-markdown-content="true"
//         style={{ position: "relative" }}
//       >
//         <MarkdownChunk
//           className={streamdownClasses}
//           isStreaming={useStreamingMarkdown}
//           text={displayText}
//         />

//         {/* Absolutely-positioned caret inside rendered content */}
//         {state.mode === "split" && (
//           <span
//             ref={caretRef}
//             aria-hidden="true"
//             className="animated-markdown-caret"
//             style={{ position: "absolute" }}
//           />
//         )}
//       </div>

//       {/* Hidden region — animation engine manipulates these via DOM ops.
//           No React children so re-renders don't reset imperative mutations. */}
//       {state.mode === "split" && (
//         <div aria-hidden="true" style={HIDDEN_STYLE}>
//           <span ref={activeBeforeRef} />
//           <span ref={activeDeleteRef} />
//           <span ref={activeAfterRef} />
//         </div>
//       )}
//     </div>
//   );
// });

// AnimatedMarkdown.displayName = "AnimatedMarkdown";



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
import { applyDiffHighlightsToText } from "./diffHighlights";
import { useHumanPresence } from "./presence/useHumanPresence";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Zero-width space used as an invisible caret position marker. */
const CARET_MARKER = "\u200B\u200B";

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

function getPreviousTextNode(node: Text): Text | null {
  let current: Node | null = node;

  while (current) {
    current = current.previousSibling;
    if (current?.nodeType === Node.TEXT_NODE) {
      return current as Text;
    }

    if (current instanceof HTMLElement) {
      const walker = document.createTreeWalker(current, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) {
        last = textNode;
      }
      if (last) {
        return last;
      }
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

  const previousText = getPreviousTextNode(marker.node);

  if (previousText && previousText.length > 0) {
    return { node: previousText, offset: previousText.length };
  }

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
    typeSpeed = "normal",
    speedMultiplier = 1,
    forceReducedMotion = false,
    animationConstants,
    onAnimationComplete,
    // Phase 2 Props
    presenceIntensity = "normal",
    presenceConfig,
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
    typeSpeed,
    speedMultiplier,
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

  const activeDeleteDisplay =
    state.phase === "selecting" && state.activeDeleteText
      ? wrapSelectionMarkup(state.activeDeleteText)
      : state.activeDeleteText;

  const composedText =
    state.mode === "split"
      ? state.beforeText +
        state.activeBeforeText +
        CARET_MARKER +
        activeDeleteDisplay +
        state.activeAfterText +
        state.afterText
      : "";

  const highlightedSettledText = applyDiffHighlightsToText(
    state.settledText,
    state.diffHighlights,
  );

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
    if (!state.caretVisible && state.phase !== "scrolling") return;

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
    state.phase,
    applyCursorJitter,
    caretRef,
    containerRef,
  ]);

  const displayText =
    state.mode === "split" ? composedText : highlightedSettledText;
  const useStreamingMarkdown = state.mode === "split";
  const caretAnimation =
    state.isThinking && state.caretVisible
      ? "animated-markdown-caret-thinking 1200ms ease-in-out infinite"
      : state.caretVisible
        ? "animated-markdown-caret-blink 900ms steps(2, start) infinite"
        : "none";

  return (
    <div
      ref={containerRef}
      aria-busy={state.isAnimating}
      className={joinClasses("animated-markdown-root", className)}
      data-operation={state.activeOperation ?? "idle"}
      data-phase={state.phase}
      data-thinking={state.isThinking ? "true" : "false"}
      style={
        {
          "--animated-markdown-caret-animation": caretAnimation,
          "--animated-markdown-caret-color": state.caretColor,
          "--animated-markdown-caret-opacity":
            state.caretVisible || state.phase === "scrolling" ? 1 : 0,
        } as CSSProperties
      }
    >
      {/* Always rendered markdown — never raw text */}
      <div
        data-animated-markdown-content="true"
        style={{ position: "relative" }}
      >
        <MarkdownChunk
          className={streamdownClasses}
          isStreaming={useStreamingMarkdown}
          text={displayText}
        />

        {/* Absolutely-positioned caret inside rendered content */}
        {state.mode === "split" && (
          <span
            ref={caretRef}
            aria-hidden="true"
            className={joinClasses(
              "animated-markdown-caret",
              state.isThinking ? "animated-markdown-caret-thinking" : undefined,
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
