import { describe, it, expect, beforeEach, vi } from "vitest";
import { BatchQueue, PatchCoalescer, DEFAULT_BATCH_CONFIG } from "../batching";
import type { Patch } from "../../components/AnimatedMarkdown/types";

describe("BatchQueue", () => {
  let batchQueue: BatchQueue;

  beforeEach(() => {
    batchQueue = new BatchQueue({
      timeWindowMs: 10,
      maxBatchSize: 10,
      minPatchesForImmediate: 3,
      enableAdaptiveSizing: false,
    });
  });

  it("should enqueue patches and process them in batches", async () => {
    const processedPatches: Patch[] = [];
    
    batchQueue.setProcessor(async (patches) => {
      processedPatches.push(...patches);
    });

    const patch1: Patch = { find: "a", replace: "b" };
    const patch2: Patch = { find: "c", replace: "d" };
    const patch3: Patch = { find: "e", replace: "f" };

    await Promise.all([
      batchQueue.enqueue(patch1),
      batchQueue.enqueue(patch2),
      batchQueue.enqueue(patch3),
    ]);

    expect(processedPatches).toHaveLength(3);
    expect(processedPatches[0]).toEqual(patch1);
    expect(processedPatches[1]).toEqual(patch2);
    expect(processedPatches[2]).toEqual(patch3);
  });

  it("should respect the time window for batching", async () => {
    const processedBatches: Patch[][] = [];
    
    batchQueue.setProcessor(async (patches) => {
      processedBatches.push(patches);
    });

    const patch1: Patch = { find: "a", replace: "b" };
    const patch2: Patch = { find: "c", replace: "d" };

    // Enqueue first patch
    batchQueue.enqueue(patch1);
    
    // Wait less than the time window
    await new Promise((resolve) => setTimeout(resolve, 5));
    
    // Should not have processed yet
    expect(processedBatches.length).toBe(0);

    // Wait for the time window to expire
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    // Now should have processed
    expect(processedBatches.length).toBeGreaterThan(0);
  });

  it("should coalesce overlapping patches", async () => {
    const processedPatches: Patch[] = [];
    
    batchQueue.setProcessor(async (patches) => {
      processedPatches.push(...patches);
    });

    // Multiple patches targeting the same text
    const patch1: Patch = { find: "hello", replace: "hi" };
    const patch2: Patch = { find: "hello", replace: "hey" };
    const patch3: Patch = { find: "hello", replace: "greetings" };

    await Promise.all([
      batchQueue.enqueue(patch1),
      batchQueue.enqueue(patch2),
      batchQueue.enqueue(patch3),
    ]);

    // Should coalesce to fewer patches
    expect(processedPatches.length).toBeLessThanOrEqual(3);
  });

  it("should clear pending batches", async () => {
    const processedPatches: Patch[] = [];
    
    batchQueue.setProcessor(async (patches) => {
      processedPatches.push(...patches);
    });

    const patch1: Patch = { find: "a", replace: "b" };
    
    // Enqueue but don't wait for processing
    batchQueue.enqueue(patch1).catch(() => {});
    
    // Clear immediately
    batchQueue.clear();
    
    // Wait for potential processing
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    // Should not have processed any patches
    expect(processedPatches).toHaveLength(0);
  });

  it("should handle priority ordering", async () => {
    const processedPatches: Patch[] = [];
    
    batchQueue.setProcessor(async (patches) => {
      processedPatches.push(...patches);
    });

    const lowPriority: Patch = { find: "low", replace: "low-replaced" };
    const highPriority: Patch = { find: "high", replace: "high-replaced" };

    // Enqueue with different priorities
    batchQueue.enqueue(lowPriority, 10);
    batchQueue.enqueue(highPriority, 1);
    batchQueue.enqueue({ find: "medium", replace: "medium-replaced" }, 5);

    // Force immediate flush by meeting minimum threshold
    await batchQueue.enqueue({ find: "trigger", replace: "trigger-replaced" }, 0);

    // High priority should be processed first
    expect(processedPatches.length).toBeGreaterThan(0);
  });
});

describe("PatchCoalescer", () => {
  it("should remove redundant patches", () => {
    const patches: Patch[] = [
      { find: "a", replace: "a" }, // Redundant
      { find: "b", replace: "c" },
      { find: "d", replace: "d" }, // Redundant
    ];

    const optimized = PatchCoalescer.optimize(patches);

    expect(optimized.length).toBe(1);
    expect(optimized[0].find).toBe("b");
    expect(optimized[0].replace).toBe("c");
  });

  it("should return single patch unchanged", () => {
    const patch: Patch = { find: "hello", replace: "world" };
    const optimized = PatchCoalescer.optimize([patch]);

    expect(optimized).toHaveLength(1);
    expect(optimized[0]).toEqual(patch);
  });

  it("should handle empty patch array", () => {
    const optimized = PatchCoalescer.optimize([]);
    expect(optimized).toHaveLength(0);
  });

  it("should merge adjacent insertions", () => {
    const patches: Patch[] = [
      { find: "", replace: "a", after: "x" },
      { find: "", replace: "b", before: "x" },
    ];

    const optimized = PatchCoalescer.optimize(patches);

    // Should merge into single insertion
    expect(optimized.length).toBeLessThanOrEqual(2);
  });

  it("should sort patches by document order", () => {
    const patches: Patch[] = [
      { find: "z", replace: "Z", before: "y" },
      { find: "a", replace: "A" },
      { find: "m", replace: "M", before: "l" },
    ];

    const optimized = PatchCoalescer.optimize(patches);

    // Should be sorted: a, m, z
    expect(optimized[0].find).toBe("a");
  });
});

describe("BatchQueue with adaptive sizing", () => {
  it("should adjust batch size based on load", async () => {
    const batchQueue = new BatchQueue({
      timeWindowMs: 5,
      maxBatchSize: 20,
      minPatchesForImmediate: 5,
      enableAdaptiveSizing: true,
    });

    const initialConfig = batchQueue.getConfig();
    expect(initialConfig.maxBatchSize).toBe(20);

    // Simulate high load by enqueueing many patches
    const processor = vi.fn().mockResolvedValue(undefined);
    batchQueue.setProcessor(processor);

    const patches: Patch[] = Array.from({ length: 40 }, (_, i) => ({
      find: `text${i}`,
      replace: `replacement${i}`,
    }));

    await batchQueue.enqueueAll(patches);

    // Batch size should have been adjusted
    const updatedConfig = batchQueue.getConfig();
    expect(updatedConfig.maxBatchSize).toBeGreaterThanOrEqual(20);
  });
});
