import type { Patch } from "../types";

/**
 * Viewport state for virtualization.
 */
export type ViewportState = {
  /** Top scroll position in pixels */
  scrollTop: number;
  /** Bottom scroll position in pixels */
  scrollBottom: number;
  /** Viewport height in pixels */
  viewportHeight: number;
  /** Total document height in pixels */
  totalHeight: number;
  /** Is user currently scrolling */
  isScrolling: boolean;
};

/**
 * Content window boundaries for virtualized rendering.
 */
export type ContentWindow = {
  /** Start index of visible content */
  startIndex: number;
  /** End index of visible content */
  endIndex: number;
  /** Buffer zone before visible content */
  preBuffer: number;
  /** Buffer zone after visible content */
  postBuffer: number;
  /** Total items in the content */
  totalItems: number;
};

/**
 * Virtualization configuration.
 */
export type VirtualizationConfig = {
  /** Number of items to render before visible area */
  preRenderBuffer: number;
  /** Number of items to render after visible area */
  postRenderBuffer: number;
  /** Minimum number of items to always render */
  minVisibleItems: number;
  /** Enable scroll-based updates */
  enableScrollUpdates: boolean;
  /** Debounce time for scroll events in ms */
  scrollDebounceMs: number;
};

/**
 * Default virtualization configuration.
 */
export const DEFAULT_VIRTUALIZATION_CONFIG: VirtualizationConfig = {
  preRenderBuffer: 5,
  postRenderBuffer: 10,
  minVisibleItems: 20,
  enableScrollUpdates: true,
  scrollDebounceMs: 16,
};

/**
 * Viewport Observer - Tracks visibility and scroll position.
 */
export class ViewportObserver {
  private observer: IntersectionObserver | null = null;
  private observedElements: Map<Element, string> = new Map();
  private visibleElements: Set<string> = new Set();
  private viewportState: ViewportState = {
    scrollTop: 0,
    scrollBottom: 0,
    viewportHeight: 0,
    totalHeight: 0,
    isScrolling: false,
  };
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private config: VirtualizationConfig;
  private callbacks: Set<(state: ViewportState) => void> = new Set();
  private elementRefs: Map<string, Element> = new Map();

  constructor(config: Partial<VirtualizationConfig> = {}) {
    this.config = { ...DEFAULT_VIRTUALIZATION_CONFIG, ...config };
  }

  /**
   * Initialize the viewport observer.
   */
  initialize(containerElement: HTMLElement): void {
    if (this.observer) {
      this.destroy();
    }

    // Create intersection observer
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        root: containerElement,
        rootMargin: "0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    // Listen to scroll events
    containerElement.addEventListener(
      "scroll",
      () => this.handleScroll(containerElement),
      {
        passive: true,
      },
    );

    // Initial viewport state
    this.updateViewportState(containerElement);
  }

  /**
   * Observe an element for visibility changes.
   */
  observe(element: Element, id: string): void {
    if (!this.observer) {
      console.warn(
        "[ViewportObserver] Not initialized. Call initialize() first.",
      );
      return;
    }

    this.observer.observe(element);
    this.observedElements.set(element, id);
    this.elementRefs.set(id, element);
  }

  /**
   * Stop observing an element.
   */
  unobserve(element: Element): void {
    if (!this.observer) {
      return;
    }

    this.observer.unobserve(element);
    const id = this.observedElements.get(element);
    if (id) {
      this.visibleElements.delete(id);
      this.observedElements.delete(element);
      this.elementRefs.delete(id);
    }
  }

  /**
   * Unobserve all elements.
   */
  unobserveAll(): void {
    for (const element of this.observedElements.keys()) {
      this.unobserve(element);
    }
  }

  /**
   * Check if an element is currently visible.
   */
  isVisible(id: string): boolean {
    return this.visibleElements.has(id);
  }

  /**
   * Get all visible element IDs.
   */
  getVisibleElements(): string[] {
    return Array.from(this.visibleElements);
  }

  /**
   * Get current viewport state.
   */
  getState(): ViewportState {
    return { ...this.viewportState };
  }

  /**
   * Subscribe to viewport state changes.
   */
  subscribe(callback: (state: ViewportState) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Calculate the content window for virtualized rendering.
   */
  calculateContentWindow(
    totalItems: number,
    itemHeight: number,
  ): ContentWindow {
    const { scrollTop, viewportHeight } = this.viewportState;

    // Calculate visible range
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(viewportHeight / itemHeight);
    const visibleEnd = Math.min(visibleStart + visibleCount, totalItems);

    // Apply buffers
    const startIndex = Math.max(0, visibleStart - this.config.preRenderBuffer);
    const endIndex = Math.min(
      totalItems,
      visibleEnd + this.config.postRenderBuffer,
    );

    // Ensure minimum visible items
    if (endIndex - startIndex < this.config.minVisibleItems) {
      const needed = this.config.minVisibleItems - (endIndex - startIndex);
      const expandedEnd = Math.min(totalItems, endIndex + needed);
      return {
        startIndex,
        endIndex: expandedEnd,
        preBuffer: this.config.preRenderBuffer,
        postBuffer: this.config.postRenderBuffer,
        totalItems,
      };
    }

    return {
      startIndex,
      endIndex,
      preBuffer: this.config.preRenderBuffer,
      postBuffer: this.config.postRenderBuffer,
      totalItems,
    };
  }

  /**
   * Handle intersection observer callbacks.
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const id = this.observedElements.get(entry.target);
      if (!id) continue;

      if (entry.isIntersecting) {
        this.visibleElements.add(id);
      } else {
        this.visibleElements.delete(id);
      }
    }
  }

  /**
   * Handle scroll events with debouncing.
   */
  private handleScroll(container: HTMLElement): void {
    if (!this.config.enableScrollUpdates) {
      return;
    }

    // Update scrolling state
    this.viewportState.isScrolling = true;

    // Clear existing timeout
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Update viewport state
    this.updateViewportState(container);

    // Notify subscribers
    this.notifySubscribers();

    // Set debounce timeout to mark scrolling as ended
    this.scrollTimeout = setTimeout(() => {
      this.viewportState.isScrolling = false;
      this.notifySubscribers();
      this.scrollTimeout = null;
    }, this.config.scrollDebounceMs);
  }

  /**
   * Update viewport state from container element.
   */
  private updateViewportState(container: HTMLElement): void {
    this.viewportState = {
      scrollTop: container.scrollTop,
      scrollBottom: container.scrollTop + container.clientHeight,
      viewportHeight: container.clientHeight,
      totalHeight: container.scrollHeight,
      isScrolling: this.viewportState.isScrolling,
    };
  }

  /**
   * Notify all subscribers of state change.
   */
  private notifySubscribers(): void {
    for (const callback of this.callbacks) {
      try {
        callback({ ...this.viewportState });
      } catch (error) {
        console.error(
          "[ViewportObserver] Error in subscriber callback:",
          error,
        );
      }
    }
  }

  /**
   * Destroy the observer and clean up.
   */
  destroy(): void {
    this.unobserveAll();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }

    this.callbacks.clear();
    this.visibleElements.clear();
  }
}

/**
 * Content Window Manager - Manages virtualized content rendering.
 */
export class ContentWindowManager {
  private viewportObserver: ViewportObserver;
  private config: VirtualizationConfig;
  private chunkedContent: string[] = [];
  private estimatedItemHeight: number = 24; // Default line height in pixels

  constructor(
    viewportObserver?: ViewportObserver,
    config: Partial<VirtualizationConfig> = {},
  ) {
    this.viewportObserver = viewportObserver ?? new ViewportObserver(config);
    this.config = { ...DEFAULT_VIRTUALIZATION_CONFIG, ...config };
  }

  /**
   * Split content into chunks for virtualized rendering.
   */
  chunkContent(content: string, chunkSize: number = 100): string[] {
    // Split by lines or paragraphs
    const lines = content.split("\n");
    const chunks: string[] = [];

    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize).join("\n"));
    }

    this.chunkedContent = chunks;
    return chunks;
  }

  /**
   * Get the content window for current viewport.
   */
  getContentWindow(): ContentWindow {
    return this.viewportObserver.calculateContentWindow(
      this.chunkedContent.length,
      this.estimatedItemHeight,
    );
  }

  /**
   * Get visible content chunks.
   */
  getVisibleContent(): string[] {
    const window = this.getContentWindow();
    return this.chunkedContent.slice(window.startIndex, window.endIndex);
  }

  /**
   * Get total content height estimate.
   */
  getTotalHeight(): number {
    return this.chunkedContent.length * this.estimatedItemHeight;
  }

  /**
   * Update estimated item height based on actual measurements.
   */
  updateItemHeight(measuredHeight: number): void {
    this.estimatedItemHeight = measuredHeight;
  }

  /**
   * Get the viewport observer instance.
   */
  getObserver(): ViewportObserver {
    return this.viewportObserver;
  }

  /**
   * Reset content and recalculate.
   */
  reset(): void {
    this.chunkedContent = [];
  }
}

// Singleton instance for global access
let globalViewportInstance: ViewportObserver | null = null;

export function getGlobalViewportObserver(): ViewportObserver {
  if (!globalViewportInstance) {
    globalViewportInstance = new ViewportObserver();
  }
  return globalViewportInstance;
}

export function resetGlobalViewportObserver(): void {
  globalViewportInstance?.destroy();
  globalViewportInstance = null;
}
