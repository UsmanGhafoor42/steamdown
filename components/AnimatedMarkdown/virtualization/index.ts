/**
 * Virtualization groundwork for large document rendering.
 */

export type {
  ViewportState,
  ContentWindow,
  VirtualizationConfig,
} from "./ViewportObserver";

export {
  ViewportObserver,
  ContentWindowManager,
  DEFAULT_VIRTUALIZATION_CONFIG,
  getGlobalViewportObserver,
  resetGlobalViewportObserver,
} from "./ViewportObserver";
