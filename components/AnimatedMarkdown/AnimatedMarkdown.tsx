"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Streamdown } from "streamdown";
import type {
  AnimatedMarkdownHandle,
  AnimatedMarkdownProps,
} from "./types";
import { useAnimationEngine } from "./useAnimation";

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

const HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
};

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
  },
  ref,
) {
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
  });

  useImperativeHandle(ref, () => handle, [handle]);

  const streamdownClasses = joinClasses(
    "prose max-w-none dark:prose-invert",
    proseClassName,
  );

  // ── Composed-text tracking for "split" mode ──────────────────────
  // The animation engine manipulates hidden spans via direct DOM ops.
  // A MutationObserver watches for character-level changes and recomposes
  // the full markdown text (with a caret marker) so MarkdownChunk can
  // render it — the user never sees raw markdown syntax.
  const [composedText, setComposedText] = useState("");
  const hiddenRegionRef = useRef<HTMLDivElement | null>(null);
  const renderedContentRef = useRef<HTMLDivElement | null>(null);

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

  /** Read hidden spans and build full text with caret marker. */
  const readComposed = useCallback(() => {
    const before = activeBeforeRef.current?.textContent ?? "";
    const del = activeDeleteRef.current?.textContent ?? "";
    const after = activeAfterRef.current?.textContent ?? "";
    return (
      state.beforeText + before + CARET_MARKER + del + after + state.afterText
    );
  }, [state.beforeText, state.afterText, activeBeforeRef, activeDeleteRef, activeAfterRef]);

  // MutationObserver watches the hidden spans for character-level mutations
  // from the animation engine's appendCharacter / deleteLastCharacter calls.
  useEffect(() => {
    if (state.mode !== "split") {
      setComposedText("");
      return;
    }

    const region = hiddenRegionRef.current;
    if (!region) return;

    // Initial composition
    setComposedText(readComposed());

    const observer = new MutationObserver(() => {
      const next = readComposed();
      setComposedText((prev) => (prev === next ? prev : next));
    });

    observer.observe(region, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [state.mode, readComposed]);

  // ── Caret overlay positioning ────────────────────────────────────
  // After the rendered markdown updates, find the marker in the DOM
  // and position the absolutely-placed caret element there.
  useLayoutEffect(() => {
    if (state.mode !== "split" || !state.caretVisible) return;

    const contentEl = renderedContentRef.current;
    const caret = caretRef.current;
    if (!contentEl || !caret) return;

    const marker = findMarkerInDom(contentEl);
    if (!marker) return;

    const range = document.createRange();
    range.setStart(marker.node, marker.offset);
    range.setEnd(marker.node, marker.offset + CARET_MARKER.length);

    // jsdom doesn't implement Range.getBoundingClientRect
    if (typeof range.getBoundingClientRect !== "function") return;

    const markerRect = range.getBoundingClientRect();
    const containerRect = contentEl.getBoundingClientRect();
    const markerHeight =
      markerRect.height > 0 ? `${markerRect.height}px` : "";

    caret.style.position = "absolute";
    // Anchor the overlay to the insertion point at the end of the hidden
    // marker, not its leading edge. Some browsers report a non-zero width
    // for zero-width characters, which can otherwise place the caret one
    // visible character early.
    caret.style.left = `${markerRect.right - containerRect.left}px`;
    caret.style.top = `${markerRect.top - containerRect.top}px`;
    caret.style.height = markerHeight;
  }, [composedText, state.mode, state.caretVisible, caretRef]);

  // The text passed to MarkdownChunk: during split mode we include the
  // zero-width marker so the layout effect can locate it for caret positioning.
  // Zero-width spaces are invisible so they don't affect the rendered output.
  const displayText =
    state.mode === "split" ? composedText : state.settledText;
  const useStreamingMarkdown = state.mode === "split";

  return (
    <div
      ref={containerRef}
      aria-busy={state.isAnimating}
      className={joinClasses("animated-markdown-root", className)}
      data-operation={state.activeOperation ?? "idle"}
      data-phase={state.phase}
      style={
        {
          "--animated-markdown-caret-animation": state.caretVisible
            ? "animated-markdown-caret-blink 900ms steps(2, start) infinite"
            : "none",
          "--animated-markdown-caret-color": state.caretColor,
          "--animated-markdown-caret-opacity": state.caretVisible ? 1 : 0,
        } as CSSProperties
      }
    >
      {/* Always rendered markdown — never raw text */}
      <div ref={renderedContentRef} style={{ position: "relative" }}>
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
            className="animated-markdown-caret"
            style={{ position: "absolute" }}
          />
        )}
      </div>

      {/* Hidden region — animation engine manipulates these via DOM ops.
          No React children so re-renders don't reset imperative mutations. */}
      {state.mode === "split" && (
        <div ref={hiddenRegionRef} aria-hidden="true" style={HIDDEN_STYLE}>
          <span ref={activeBeforeRef} />
          <span ref={activeDeleteRef} />
          <span ref={activeAfterRef} />
        </div>
      )}
    </div>
  );
});

AnimatedMarkdown.displayName = "AnimatedMarkdown";
