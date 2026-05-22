import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AnimatedMarkdown } from "@/components/AnimatedMarkdown/AnimatedMarkdown";
import {
  BASE_STRATEGY_DOC,
  BASE_STRATEGY_DOC_V2,
  LONG_MARKDOWN_15KB,
  PATCH_SET_1,
  PATCH_SET_2,
  PATCH_SET_3,
  PATCH_SET_4,
  PATCH_SET_6,
  SEED_MARKDOWN,
} from "@/components/AnimatedMarkdown/fixtures";
import type {
  AnimatedMarkdownHandle,
  AnimationEvent,
} from "@/components/AnimatedMarkdown/types";

function createAnimationTestClock() {
  let now = 0;
  let nextId = 1;
  const frames = new Map<number, FrameRequestCallback>();

  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });

  const flushFrame = async () => {
    const callbacks = Array.from(frames.values());
    frames.clear();
    now += 16;

    await act(async () => {
      for (const callback of callbacks) {
        callback(now);
      }
    });
  };

  return {
    pendingFrames() {
      return frames.size;
    },
    async flushFrames(count = 1) {
      for (let index = 0; index < count; index += 1) {
        await flushFrame();
      }
    },
    async flushAll(maxCycles = 200) {
      for (let cycle = 0; cycle < maxCycles; cycle += 1) {
        if (vi.getTimerCount() > 0) {
          await act(async () => {
            await vi.runOnlyPendingTimersAsync();
          });
        }

        while (frames.size > 0) {
          await flushFrame();
        }

        await act(async () => {
          await Promise.resolve();
        });

        if (vi.getTimerCount() === 0 && frames.size === 0) {
          break;
        }
      }
    },
  };
}

function getFastAnimationConstants() {
  return {
    caretFadeMs: 0,
    preEditPauseMs: 0,
    zeroPauseMs: 0,
    interPatchBeatMs: 0,
    offscreenInterPatchBeatMs: 0,
    scrollMaxMs: 10,
    typeStartMs: 1,
    typeEndMs: 1,
    deleteMsPerChar: 1,
    minDeleteTotalMs: 1,
    maxDeleteTotalMs: 1,
  } as const;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: 1000,
  });
  window.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    if (typeof options === "number") {
      window.scrollY = options;
      return;
    }

    if (options?.top !== undefined) {
      window.scrollY = Number(options.top);
    }
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AnimatedMarkdown imperative queue", () => {
  test("play and restore resolve in queue order", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        forceReducedMotion
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    await act(async () => {
      await ref.current?.play(PATCH_SET_2);
      await ref.current?.restore(BASE_STRATEGY_DOC);
    });

    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);
    expect(events.map((event) => event.type)).toEqual(["edit", "restore"]);
    expect(events.every((event) => !event.cancelled)).toBe(true);
  });

  test("cancelAll rejects the current operation and emits a cancelled event", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let cancellation: unknown;
    const promise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      cancellation = error;
    });

    await act(async () => {
      ref.current?.cancelAll();
      await promise;
    });

    expect(cancellation).toBeInstanceOf(Error);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "edit", cancelled: true });
  });

  test("versionKey changes reject active work and snap to the new base text", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();
    const { rerender } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        versionKey="v1"
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let cancellation: unknown;
    const promise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      cancellation = error;
    });

    await act(async () => {
      rerender(
        <AnimatedMarkdown
          ref={ref}
          baseText={BASE_STRATEGY_DOC_V2}
          versionKey="v2"
          onAnimationComplete={(event) => events.push(event)}
        />,
      );
    });

    await promise;

    expect(cancellation).toBeInstanceOf(Error);
    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC_V2);
    expect(events.some((event) => event.cancelled)).toBe(true);
  });

  test("changing caretColor does not reset or cancel active work", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();
    const { rerender } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        caretColor="#2563eb"
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let cancellation: unknown;
    const promise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      cancellation = error;
    });

    await act(async () => {
      rerender(
        <AnimatedMarkdown
          ref={ref}
          baseText={BASE_STRATEGY_DOC}
          caretColor="#dc2626"
          onAnimationComplete={(event) => events.push(event)}
        />,
      );
      ref.current?.skipCurrent();
      await promise;
    });

    expect(cancellation).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "edit", cancelled: false });
  });

  test("cancelQueued rejects queued work while the current operation can finish", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let currentCancellation: unknown;
    let queuedCancellation: unknown;
    const currentPromise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      currentCancellation = error;
    });
    const queuedPromise = ref.current?.play(PATCH_SET_2).catch((error: unknown) => {
      queuedCancellation = error;
    });

    await act(async () => {
      ref.current?.cancelQueued();
      ref.current?.skipCurrent();
      await Promise.all([currentPromise, queuedPromise]);
    });

    expect(currentCancellation).toBeUndefined();
    expect(queuedCancellation).toBeInstanceOf(Error);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "edit", cancelled: true });
    expect(events[1]).toMatchObject({ type: "edit", cancelled: false });
  });

  test("skipCurrent resolves current work and continues into queued restore", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    const playPromise = ref.current?.play(PATCH_SET_2);
    const restorePromise = ref.current?.restore(BASE_STRATEGY_DOC);

    await act(async () => {
      ref.current?.skipCurrent();
      await Promise.all([playPromise, restorePromise]);
    });

    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual(["edit", "restore"]);
    expect(events.every((event) => !event.cancelled)).toBe(true);
  });

  test("versionKey change with identical text still cancels active work", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();
    const { rerender } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        versionKey="v3"
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let cancellation: unknown;
    const promise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      cancellation = error;
    });

    await act(async () => {
      rerender(
        <AnimatedMarkdown
          ref={ref}
          baseText={BASE_STRATEGY_DOC}
          versionKey="v4"
          onAnimationComplete={(event) => events.push(event)}
        />,
      );
    });

    await promise;

    expect(cancellation).toBeInstanceOf(Error);
    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);
    expect(events.some((event) => event.cancelled)).toBe(true);
  });

  test("baseText reset cancels current and queued operations together", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();
    const { rerender } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        versionKey="v1"
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let currentCancellation: unknown;
    let queuedCancellation: unknown;
    const currentPromise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      currentCancellation = error;
    });
    const queuedPromise = ref.current?.restore(BASE_STRATEGY_DOC).catch((error: unknown) => {
      queuedCancellation = error;
    });

    await act(async () => {
      rerender(
        <AnimatedMarkdown
          ref={ref}
          baseText={BASE_STRATEGY_DOC_V2}
          versionKey="v2"
          onAnimationComplete={(event) => events.push(event)}
        />,
      );
    });

    await Promise.all([currentPromise, queuedPromise]);

    expect(currentCancellation).toBeInstanceOf(Error);
    expect(queuedCancellation).toBeInstanceOf(Error);
    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC_V2);
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.cancelled)).toBe(true);
  });

  test("reduced motion applies play and restore instantly without the active patch region", async () => {
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        forceReducedMotion
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    await act(async () => {
      await ref.current?.play(PATCH_SET_3);
      await ref.current?.restore(BASE_STRATEGY_DOC);
    });

    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Animated markdown patch region")).toBeNull();
    expect(events.map((event) => event.type)).toEqual(["edit", "restore"]);
  });

  test("scenario 4 settles to the expanded risk section without warnings", async () => {
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        forceReducedMotion
      />,
    );

    expect(ref.current).not.toBeNull();

    await act(async () => {
      await ref.current?.play(PATCH_SET_4);
    });

    expect(console.warn).not.toHaveBeenCalled();
    expect(ref.current?.getText()).toContain("### Daily limits");
    expect(screen.getByText("Daily limits")).toBeTruthy();
    expect(screen.getByText("Weekly drawdown cap: 5%")).toBeTruthy();
  });

  test("valid demo scenarios do not emit warnings", async () => {
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText=""
        versionKey="empty"
        forceReducedMotion
      />,
    );

    expect(ref.current).not.toBeNull();

    await act(async () => {
      await ref.current?.play(PATCH_SET_1);
    });

    expect(ref.current?.getText()).toBe(SEED_MARKDOWN);

    await act(async () => {
      await ref.current?.restore(BASE_STRATEGY_DOC);
    });

    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);

    await act(async () => {
      await ref.current?.play(PATCH_SET_2);
      await ref.current?.restore(BASE_STRATEGY_DOC);
      await ref.current?.play(PATCH_SET_3);
      await ref.current?.restore(BASE_STRATEGY_DOC);
      await ref.current?.play(PATCH_SET_4);
      await ref.current?.restore(BASE_STRATEGY_DOC);
      await ref.current?.play(PATCH_SET_6);
      await ref.current?.restore(BASE_STRATEGY_DOC);
    });

    expect(console.warn).not.toHaveBeenCalled();
    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);
  });

  test("invalid patches warn and leave the current text unchanged", async () => {
    const ref = createRef<AnimatedMarkdownHandle>();

    render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        forceReducedMotion
      />,
    );

    expect(ref.current).not.toBeNull();

    await act(async () => {
      await ref.current?.play({
        label: "Broken patch",
        patches: [
          {
            find: "This text does not exist",
            replace: "Replacement",
          },
        ],
      });
    });

    expect(console.warn).toHaveBeenCalled();
    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC);
  });

  test("skipCurrent after a real delete frame snaps current work and continues queued restore", async () => {
    const clock = createAnimationTestClock();
    const ref = createRef<AnimatedMarkdownHandle>();
    const events: AnimationEvent[] = [];
    const insertionPatchSet = {
      label: "Type into empty",
      patches: [{ find: "", replace: "Draft plan" }],
    };

    const { unmount } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText=""
        animationConstants={getFastAnimationConstants()}
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let playCancellation: unknown;
    let restoreCancellation: unknown;
    let playResolved = false;
    let restoreResolved = false;

    let playPromise: Promise<void> | undefined;
    let restorePromise: Promise<void> | undefined;

    await act(async () => {
      playPromise = ref.current
        ?.play(insertionPatchSet)
        .then(() => {
          playResolved = true;
        })
        .catch((error: unknown) => {
          playCancellation = error;
        });
      restorePromise = ref.current
        ?.restore("")
        .then(() => {
          restoreResolved = true;
        })
        .catch((error: unknown) => {
          restoreCancellation = error;
        });
    });

    await clock.flushFrames(2);
    const animatedRoot = document.querySelector<HTMLElement>(
      ".animated-markdown-root",
    );

    for (let index = 0; index < 12; index += 1) {
      if (animatedRoot?.dataset.phase === "typing") {
        break;
      }

      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await clock.flushFrames(1);
    }

    expect(animatedRoot?.dataset.phase).toBe("typing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await clock.flushFrames(1);

    const patchRegion = screen.getByLabelText("Animated markdown patch region");

    expect(patchRegion).toBeTruthy();
    expect(patchRegion.textContent).toContain("D");

    await act(async () => {
      ref.current?.skipCurrent();
    });
    await clock.flushAll();
    await Promise.all([playPromise, restorePromise]);
    await clock.flushAll();

    expect(playCancellation).toBeUndefined();
    expect(restoreCancellation).toBeUndefined();
    expect(playResolved).toBe(true);
    expect(restoreResolved).toBe(true);
    expect(ref.current?.getText()).toBe("");
    expect(events.map((event) => event.type)).toEqual(["edit", "restore"]);
    expect(events.every((event) => !event.cancelled)).toBe(true);
    await act(async () => {
      ref.current?.cancelAll();
      unmount();
    });
  });

  test("baseText reset during split mode clears the active region and cancels work cleanly", async () => {
    const clock = createAnimationTestClock();
    const events: AnimationEvent[] = [];
    const ref = createRef<AnimatedMarkdownHandle>();
    const { rerender, unmount } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        versionKey="v1"
        animationConstants={getFastAnimationConstants()}
        onAnimationComplete={(event) => events.push(event)}
      />,
    );

    expect(ref.current).not.toBeNull();

    let cancellation: unknown;
    const promise = ref.current?.play(PATCH_SET_3).catch((error: unknown) => {
      cancellation = error;
    });

    await clock.flushFrames(2);
    expect(screen.getByLabelText("Animated markdown patch region")).toBeTruthy();

    await act(async () => {
      rerender(
        <AnimatedMarkdown
          ref={ref}
          baseText={BASE_STRATEGY_DOC_V2}
          versionKey="v2"
          animationConstants={getFastAnimationConstants()}
          onAnimationComplete={(event) => events.push(event)}
        />,
      );
    });
    await promise;
    await clock.flushAll();

    expect(cancellation).toBeInstanceOf(Error);
    expect(screen.queryByLabelText("Animated markdown patch region")).toBeNull();
    expect(ref.current?.getText()).toBe(BASE_STRATEGY_DOC_V2);
    expect(events.some((event) => event.cancelled)).toBe(true);
    await act(async () => {
      ref.current?.cancelAll();
      unmount();
    });
  });

  test("does not scroll when the caret is already inside the comfort zone", async () => {
    const clock = createAnimationTestClock();
    const ref = createRef<AnimatedMarkdownHandle>();
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function mockRect(this: Element) {
        if (
          this instanceof HTMLElement &&
          this.classList.contains("animated-markdown-caret")
        ) {
          return {
            top: 320,
            bottom: 340,
            left: 0,
            right: 0,
            width: 2,
            height: 20,
            x: 0,
            y: 320,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const { unmount } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={BASE_STRATEGY_DOC}
        animationConstants={getFastAnimationConstants()}
      />,
    );

    await act(async () => {
      void ref.current?.play(PATCH_SET_2);
    });
    await clock.flushAll();

    expect(window.scrollTo).not.toHaveBeenCalled();
    rectSpy.mockRestore();
    await act(async () => {
      ref.current?.cancelAll();
      unmount();
    });
  });

  test("splits long off-screen scrolls into two eased segments", async () => {
    const clock = createAnimationTestClock();
    const ref = createRef<AnimatedMarkdownHandle>();
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function mockRect(this: Element) {
        if (
          this instanceof HTMLElement &&
          this.classList.contains("animated-markdown-caret")
        ) {
          return {
            top: 2500,
            bottom: 2520,
            left: 0,
            right: 0,
            width: 2,
            height: 20,
            x: 0,
            y: 2500,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const { unmount } = render(
      <AnimatedMarkdown
        ref={ref}
        baseText={LONG_MARKDOWN_15KB}
        versionKey="stress15k"
        animationConstants={getFastAnimationConstants()}
      />,
    );

    const promise = ref.current?.play({
      label: "Long jump",
      patches: [
        {
          find: "- Stop loss: -5% from entry [S11]",
          replace: "- Stop loss: -3% from entry [S11]",
        },
      ],
    });
    await clock.flushAll();
    await promise;
    await clock.flushAll();

    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenNthCalledWith(1, {
      top: 1000,
      behavior: "smooth",
    });
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, {
      top: 2000,
      behavior: "smooth",
    });
    rectSpy.mockRestore();
    await act(async () => {
      ref.current?.cancelAll();
      unmount();
    });
  });
});
