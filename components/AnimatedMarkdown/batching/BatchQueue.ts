import type { Patch } from "../types";

/**
 * Batch configuration options.
 */
export type BatchConfig = {
  /** Time window in milliseconds for collecting patches */
  timeWindowMs: number;
  /** Maximum number of patches per batch */
  maxBatchSize: number;
  /** Minimum patches to trigger immediate processing */
  minPatchesForImmediate: number;
  /** Enable adaptive sizing based on load */
  enableAdaptiveSizing: boolean;
};

/**
 * Default batch configuration.
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  timeWindowMs: 16, // ~1 frame at 60fps
  maxBatchSize: 50,
  minPatchesForImmediate: 1,
  enableAdaptiveSizing: true,
};

/**
 * Batch item containing patches and metadata.
 */
type BatchItem = {
  patches: Patch[];
  timestamp: number;
  priority: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

/**
 * Result of patch coalescing operation.
 */
export type CoalescedResult = {
  patches: Patch[];
  skippedCount: number;
  mergedCount: number;
};

/**
 * Batch Queue Manager - Collects and processes patches in batches.
 */
export class BatchQueue {
  private config: BatchConfig;
  private queue: BatchItem[] = [];
  private pendingBatch: BatchItem[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing: boolean = false;
  private processCallback: ((patches: Patch[]) => Promise<void>) | null = null;
  private currentBatchSize: number = DEFAULT_BATCH_CONFIG.maxBatchSize;
  private recentLoadHistory: number[] = [];

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.currentBatchSize = this.config.maxBatchSize;
  }

  /**
   * Set the callback for processing batches.
   */
  setProcessor(callback: (patches: Patch[]) => Promise<void>): void {
    this.processCallback = callback;
  }

  /**
   * Add a patch to the batch queue.
   */
  enqueue(patch: Patch, priority: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const item: BatchItem = {
        patches: [patch],
        timestamp: Date.now(),
        priority,
        resolve,
        reject,
      };

      this.queue.push(item);

      // Check if we should process immediately
      if (this.queue.length >= this.config.minPatchesForImmediate) {
        this.flush();
      } else if (!this.batchTimer) {
        // Start batching window
        this.batchTimer = setTimeout(() => this.flush(), this.config.timeWindowMs);
      }
    });
  }

  /**
   * Add multiple patches to the batch queue.
   */
  enqueueAll(patches: Patch[], priority: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const item: BatchItem = {
        patches,
        timestamp: Date.now(),
        priority,
        resolve,
        reject,
      };

      this.queue.push(item);

      // Check if we should process immediately
      if (this.getTotalPatchCount() >= this.config.minPatchesForImmediate) {
        this.flush();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flush(), this.config.timeWindowMs);
      }
    });
  }

  /**
   * Flush the current batch and process immediately.
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Move queued items to pending batch
    this.pendingBatch = [...this.queue];
    this.queue = [];

    // Sort by priority
    this.pendingBatch.sort((a, b) => a.priority - b.priority);

    // Coalesce all patches
    const allPatches = this.pendingBatch.flatMap((item) => item.patches);
    const coalesced = this.coalescePatches(allPatches);

    // Update adaptive batch size
    if (this.config.enableAdaptiveSizing) {
      this.updateAdaptiveBatchSize(allPatches.length);
    }

    // Process the batch
    this.isProcessing = true;

    try {
      if (this.processCallback && coalesced.patches.length > 0) {
        await this.processCallback(coalesced.patches);
      }

      // Resolve all promises
      for (const item of this.pendingBatch) {
        item.resolve();
      }
    } catch (error) {
      // Reject all promises
      for (const item of this.pendingBatch) {
        item.reject(error as Error);
      }
    } finally {
      this.isProcessing = false;
      this.pendingBatch = [];

      // Process any new items that arrived during processing
      if (this.queue.length > 0) {
        setTimeout(() => this.flush(), 0);
      }
    }
  }

  /**
   * Clear all pending batches.
   */
  clear(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    for (const item of this.queue) {
      item.reject(new Error("Batch cleared"));
    }

    for (const item of this.pendingBatch) {
      item.reject(new Error("Batch cleared"));
    }

    this.queue = [];
    this.pendingBatch = [];
  }

  /**
   * Get the current queue length.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get total patch count in queue.
   */
  getTotalPatchCount(): number {
    return this.queue.reduce((sum, item) => sum + item.patches.length, 0);
  }

  /**
   * Coalesce overlapping and redundant patches.
   */
  private coalescePatches(patches: Patch[]): CoalescedResult {
    if (patches.length === 0) {
      return { patches: [], skippedCount: 0, mergedCount: 0 };
    }

    const result: Patch[] = [];
    let skippedCount = 0;
    let mergedCount = 0;

    // Group patches by their target region
    const patchGroups = new Map<string, Patch[]>();

    for (const patch of patches) {
      // Create a key based on the find text and context
      const key = `${patch.before ?? ""}|${patch.find}|${patch.after ?? ""}`;
      
      if (!patchGroups.has(key)) {
        patchGroups.set(key, []);
      }
      patchGroups.get(key)!.push(patch);
    }

    // Process each group
    for (const [, group] of patchGroups) {
      if (group.length === 1) {
        result.push(group[0]);
        continue;
      }

      // Merge patches in the same group
      const merged = this.mergePatches(group);
      if (merged) {
        result.push(merged);
        mergedCount += group.length - 1;
      } else {
        // Keep only the last patch if merging fails
        result.push(group[group.length - 1]);
        skippedCount += group.length - 1;
      }
    }

    return {
      patches: result,
      skippedCount,
      mergedCount,
    };
  }

  /**
   * Merge multiple patches targeting the same region.
   */
  private mergePatches(patches: Patch[]): Patch | null {
    if (patches.length === 0) {
      return null;
    }

    if (patches.length === 1) {
      return patches[0];
    }

    // Apply patches sequentially to get the final replacement
    let currentReplace = patches[0].replace;

    for (let i = 1; i < patches.length; i++) {
      // If patches have the same find text, the later one overrides
      if (patches[i].find === patches[0].find) {
        currentReplace = patches[i].replace;
      }
    }

    return {
      find: patches[0].find,
      replace: currentReplace,
      before: patches[0].before,
      after: patches[0].after,
    };
  }

  /**
   * Update batch size based on recent load.
   */
  private updateAdaptiveBatchSize(currentLoad: number): void {
    this.recentLoadHistory.push(currentLoad);

    // Keep only recent history
    if (this.recentLoadHistory.length > 10) {
      this.recentLoadHistory.shift();
    }

    const avgLoad =
      this.recentLoadHistory.reduce((a, b) => a + b, 0) /
      this.recentLoadHistory.length;

    // Adjust batch size based on load
    if (avgLoad > 30) {
      // High load - increase batch size
      this.currentBatchSize = Math.min(
        this.config.maxBatchSize,
        Math.floor(this.currentBatchSize * 1.2)
      );
    } else if (avgLoad < 10) {
      // Low load - decrease batch size for better responsiveness
      this.currentBatchSize = Math.max(
        5,
        Math.floor(this.currentBatchSize * 0.9)
      );
    }
  }

  /**
   * Get current batch configuration.
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Update batch configuration.
   */
  updateConfig(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.maxBatchSize !== undefined) {
      this.currentBatchSize = config.maxBatchSize;
    }
  }
}

/**
 * Patch Coalescer - Optimizes patch sequences for minimal DOM churn.
 */
export class PatchCoalescer {
  /**
   * Optimize a sequence of patches for efficient application.
   */
  static optimize(patches: Patch[]): Patch[] {
    if (patches.length <= 1) {
      return patches;
    }

    // Remove redundant patches (find === replace)
    let optimized = patches.filter((p) => p.find !== p.replace);

    // Merge adjacent insertions
    optimized = this.mergeAdjacentInsertions(optimized);

    // Merge adjacent deletions
    optimized = this.mergeAdjacentDeletions(optimized);

    // Sort by document order
    optimized = this.sortByDocumentOrder(optimized);

    return optimized;
  }

  /**
   * Merge adjacent insertion patches.
   */
  private static mergeAdjacentInsertions(patches: Patch[]): Patch[] {
    const result: Patch[] = [];
    let currentInsert: Patch | null = null;

    for (const patch of patches) {
      if (patch.find === "") {
        // This is an insertion
        if (currentInsert === null) {
          currentInsert = { ...patch };
        } else {
          // Check if adjacent
          if (this.arePatchesAdjacent(currentInsert, patch)) {
            currentInsert.replace += patch.replace;
            if (patch.after) {
              currentInsert.after = patch.after;
            }
          } else {
            result.push(currentInsert);
            currentInsert = { ...patch };
          }
        }
      } else {
        if (currentInsert !== null) {
          result.push(currentInsert);
          currentInsert = null;
        }
        result.push(patch);
      }
    }

    if (currentInsert !== null) {
      result.push(currentInsert);
    }

    return result;
  }

  /**
   * Merge adjacent deletion patches.
   */
  private static mergeAdjacentDeletions(patches: Patch[]): Patch[] {
    const result: Patch[] = [];
    let currentDelete: Patch | null = null;

    for (const patch of patches) {
      if (patch.replace === "" && patch.find !== "") {
        // This is a deletion
        if (currentDelete === null) {
          currentDelete = { ...patch };
        } else {
          // Check if adjacent
          if (this.arePatchesAdjacent(currentDelete, patch)) {
            currentDelete.find += patch.find;
            currentDelete.replace = "";
            if (patch.after) {
              currentDelete.after = patch.after;
            }
          } else {
            result.push(currentDelete);
            currentDelete = { ...patch };
          }
        }
      } else {
        if (currentDelete !== null) {
          result.push(currentDelete);
          currentDelete = null;
        }
        result.push(patch);
      }
    }

    if (currentDelete !== null) {
      result.push(currentDelete);
    }

    return result;
  }

  /**
   * Check if two patches are adjacent in the document.
   */
  private static arePatchesAdjacent(a: Patch, b: Patch): boolean {
    // Simple heuristic: check if context matches
    if (a.after && b.before) {
      return a.after === b.before;
    }
    return false;
  }

  /**
   * Sort patches by their position in the document.
   */
  private static sortByDocumentOrder(patches: Patch[]): Patch[] {
    // Create a sortable representation
    const withPosition = patches.map((patch, index) => ({
      patch,
      index,
      // Use context to estimate position
      positionKey: `${patch.before ?? ""}${patch.find}`,
    }));

    // Sort by estimated position, preserving original order for ties
    withPosition.sort((a, b) => {
      const cmp = a.positionKey.localeCompare(b.positionKey);
      return cmp !== 0 ? cmp : a.index - b.index;
    });

    return withPosition.map((item) => item.patch);
  }
}
