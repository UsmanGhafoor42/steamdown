export type ScrollFocalOptions = {
  viewportHeight?: number;
  /** Vertical focal line as ratio of viewport (0.5 = center) */
  focalRatio?: number;
  comfortTopRatio?: number;
  comfortBottomRatio?: number;
  maxDurationMs?: number;
  behavior?: ScrollBehavior;
  waitForStableFrames?: number;
};

const DEFAULT_FOCAL: Required<
  Pick<
    ScrollFocalOptions,
    | "focalRatio"
    | "comfortTopRatio"
    | "comfortBottomRatio"
    | "maxDurationMs"
    | "waitForStableFrames"
  >
> = {
  focalRatio: 0.5,
  comfortTopRatio: 0.2,
  comfortBottomRatio: 0.8,
  maxDurationMs: 400,
  waitForStableFrames: 3,
};

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Waits until a measured rect stops changing between frames.
 */
export async function waitForStableRect(
  measure: () => DOMRect | null,
  stableFrames = 3,
): Promise<DOMRect | null> {
  let last: DOMRect | null = null;
  let stableCount = 0;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await nextFrame();
    const current = measure();

    if (!current) {
      return null;
    }

    if (
      last &&
      Math.abs(last.top - current.top) < 0.5 &&
      Math.abs(last.height - current.height) < 0.5
    ) {
      stableCount += 1;
      if (stableCount >= stableFrames) {
        return current;
      }
    } else {
      stableCount = 0;
    }

    last = current;
  }

  return last;
}

export function isRectInComfortZone(
  rect: DOMRect,
  viewportHeight: number,
  topRatio = DEFAULT_FOCAL.comfortTopRatio,
  bottomRatio = DEFAULT_FOCAL.comfortBottomRatio,
): boolean {
  const comfortTop = viewportHeight * topRatio;
  const comfortBottom = viewportHeight * bottomRatio;
  return rect.top >= comfortTop && rect.bottom <= comfortBottom;
}

/**
 * Focus-driven window scroll — anchors the edit region to the focal line.
 */
export async function scrollWindowToFocalPoint(
  rect: DOMRect,
  options: ScrollFocalOptions = {},
): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const viewportHeight = options.viewportHeight ?? window.innerHeight;
  const focalRatio = options.focalRatio ?? DEFAULT_FOCAL.focalRatio;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_FOCAL.maxDurationMs;
  const behavior = options.behavior ?? "smooth";

  if (
    isRectInComfortZone(
      rect,
      viewportHeight,
      options.comfortTopRatio,
      options.comfortBottomRatio,
    )
  ) {
    return false;
  }

  const targetTop = window.scrollY + rect.top - viewportHeight * focalRatio;
  const distance = targetTop - window.scrollY;

  if (Math.abs(distance) > viewportHeight) {
    window.scrollTo({
      top: window.scrollY + distance / 2,
      behavior,
    });
    await new Promise((r) => setTimeout(r, maxDurationMs / 2));
  }

  window.scrollTo({ top: targetTop, behavior });
  await new Promise((r) => setTimeout(r, maxDurationMs));
  return true;
}

/**
 * Scroll to an element anchor before the active patch animates (predictive).
 */
export async function scrollToElementAnchor(
  element: HTMLElement | null,
  options: ScrollFocalOptions = {},
): Promise<boolean> {
  if (!element) {
    return false;
  }

  const stableFrames =
    options.waitForStableFrames ?? DEFAULT_FOCAL.waitForStableFrames;
  const rect = await waitForStableRect(
    () => element.getBoundingClientRect(),
    stableFrames,
  );

  if (!rect) {
    return false;
  }

  return scrollWindowToFocalPoint(rect, options);
}
