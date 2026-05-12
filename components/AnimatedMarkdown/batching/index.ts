/**
 * Smart diff batching system for reducing DOM mutations.
 */

export type { BatchConfig, CoalescedResult } from "./BatchQueue";

export {
  BatchQueue,
  PatchCoalescer,
  DEFAULT_BATCH_CONFIG,
} from "./BatchQueue";
