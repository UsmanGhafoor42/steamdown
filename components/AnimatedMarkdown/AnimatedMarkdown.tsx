"use client";

import {
  forwardRef,
  memo,
  useImperativeHandle,
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

const MarkdownChunk = memo(function MarkdownChunk({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  if (text === "") {
    return null;
  }

  return (
    <Streamdown className={className} lineNumbers={false} mode="static">
      {text}
    </Streamdown>
  );
});

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

  return (
    <div
      ref={containerRef}
      aria-busy={state.isAnimating}
      className={joinClasses("animated-markdown-root", className)}
      data-operation={state.activeOperation ?? "idle"}
      data-phase={state.phase}
      style={
        {
          "--animated-markdown-caret-color": state.caretColor,
          "--animated-markdown-caret-opacity": state.caretVisible ? 1 : 0,
        } as CSSProperties
      }
    >
      {state.mode === "markdown" ? (
        <MarkdownChunk className={streamdownClasses} text={state.settledText} />
      ) : (
        <>
          <MarkdownChunk
            className={streamdownClasses}
            text={state.beforeText}
          />
          <div
            aria-label="Animated markdown patch region"
            role="text"
            className={joinClasses(
              "animated-markdown-active-region",
              streamdownClasses,
            )}
          >
            <span ref={activeBeforeRef}>{state.activeBeforeText}</span>
            <span
              ref={caretRef}
              aria-hidden="true"
              className="animated-markdown-caret"
            />
            <span ref={activeDeleteRef}>{state.activeDeleteText}</span>
            <span ref={activeAfterRef}>{state.activeAfterText}</span>
          </div>
          <MarkdownChunk className={streamdownClasses} text={state.afterText} />
        </>
      )}
    </div>
  );
});

AnimatedMarkdown.displayName = "AnimatedMarkdown";
