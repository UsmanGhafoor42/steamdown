import type { Patch } from "../types";

/**
 * Performance metrics collected during streaming operations.
 */
export type PerformanceMetrics = {
  /** Frames per second during animation */
  fps: number;
  /** Frame timing history in milliseconds */
  frameTimes: number[];
  /** Time to apply patches in milliseconds */
  patchApplicationTime: number;
  /** Total DOM mutations performed */
  domMutationCount: number;
  /** Characters processed per second */
  throughput: number;
  /** Input to render latency in milliseconds */
  latency: number;
  /** Memory usage snapshot (if available) */
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  };
};

/**
 * Benchmark configuration for different document sizes.
 */
export type BenchmarkConfig = {
  name: string;
  minChars: number;
  maxChars: number;
  iterations: number;
};

/**
 * Default benchmark configurations.
 */
export const BENCHMARK_CONFIGS: Record<string, BenchmarkConfig> = {
  small: {
    name: "Small Document",
    minChars: 100,
    maxChars: 500,
    iterations: 10,
  },
  medium: {
    name: "Medium Document",
    minChars: 500,
    maxChars: 2000,
    iterations: 10,
  },
  large: {
    name: "Large Document",
    minChars: 2000,
    maxChars: 10000,
    iterations: 5,
  },
  "extra-large": {
    name: "Extra Large Document",
    minChars: 10000,
    maxChars: 50000,
    iterations: 3,
  },
};

/**
 * Performance Monitor - Collects and analyzes performance metrics.
 */
export class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastFrameTime: number = 0;
  private mutationCount: number = 0;
  private markers: Map<string, number> = new Map();
  private measures: Map<string, { start: number; end: number }> = new Map();
  private isMonitoring: boolean = false;
  private rafId: number | null = null;

  /**
   * Start monitoring performance.
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.frameTimes = [];
    this.lastFrameTime = performance.now();
    this.mutationCount = 0;
    this.markers.clear();
    this.measures.clear();

    this.trackFrame();
  }

  /**
   * Stop monitoring and return collected metrics.
   */
  stop(): PerformanceMetrics {
    this.isMonitoring = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    return this.getMetrics();
  }

  /**
   * Record a DOM mutation.
   */
  recordMutation(count: number = 1): void {
    this.mutationCount += count;
  }

  /**
   * Mark a point in time for later measurement.
   */
  mark(label: string): void {
    this.markers.set(label, performance.now());
  }

  /**
   * Measure duration between two marks or explicit timestamps.
   */
  measure(label: string, startMark?: string, endMark?: string): void {
    const startTime = startMark
      ? this.markers.get(startMark) ?? performance.now()
      : performance.now();
    const endTime = endMark
      ? this.markers.get(endMark) ?? performance.now()
      : performance.now();

    this.measures.set(label, { start: startTime, end: endTime });
  }

  /**
   * Get the duration of a specific measure.
   */
  getMeasureDuration(label: string): number | null {
    const measure = this.measures.get(label);
    return measure ? measure.end - measure.start : null;
  }

  /**
   * Get current performance metrics.
   */
  getMetrics(): PerformanceMetrics {
    const fps = this.calculateFPS();
    const avgFrameTime =
      this.frameTimes.length > 0
        ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
        : 0;

    // Calculate throughput (chars/sec) based on patch application
    const patchTime = this.getMeasureDuration("patch-application") ?? 0;
    const throughput = patchTime > 0 ? 1000 / patchTime : 0;

    // Calculate latency
    const latency = this.getMeasureDuration("input-to-render") ?? 0;

    // Get memory usage if available
    let memoryUsage: PerformanceMetrics["memoryUsage"];
    if (typeof performance !== "undefined" && "memory" in performance) {
      const perfMemory = performance.memory as {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
      };
      memoryUsage = {
        usedJSHeapSize: perfMemory.usedJSHeapSize,
        totalJSHeapSize: perfMemory.totalJSHeapSize,
      };
    }

    return {
      fps,
      frameTimes: [...this.frameTimes],
      patchApplicationTime: patchTime,
      domMutationCount: this.mutationCount,
      throughput,
      latency,
      memoryUsage,
    };
  }

  /**
   * Reset all collected metrics.
   */
  reset(): void {
    this.frameTimes = [];
    this.lastFrameTime = performance.now();
    this.mutationCount = 0;
    this.markers.clear();
    this.measures.clear();
  }

  /**
   * Export metrics as JSON for analysis.
   */
  exportJSON(): string {
    const metrics = this.getMetrics();
    return JSON.stringify(
      {
        ...metrics,
        exportedAt: new Date().toISOString(),
        measures: Object.fromEntries(this.measures),
      },
      null,
      2
    );
  }

  /**
   * Create a performance report with analysis.
   */
  createReport(): PerformanceReport {
    const metrics = this.getMetrics();
    const analysis = this.analyzeMetrics(metrics);

    return {
      timestamp: new Date().toISOString(),
      metrics,
      analysis,
      recommendations: this.generateRecommendations(analysis),
    };
  }

  /**
   * Track frame timing using requestAnimationFrame.
   */
  private trackFrame(): void {
    if (!this.isMonitoring) {
      return;
    }

    const now = performance.now();
    const frameTime = now - this.lastFrameTime;

    if (frameTime > 0 && frameTime < 1000) {
      // Filter out unrealistic frame times
      this.frameTimes.push(frameTime);

      // Keep only recent frame times (last 60 frames)
      if (this.frameTimes.length > 60) {
        this.frameTimes.shift();
      }
    }

    this.lastFrameTime = now;
    this.rafId = requestAnimationFrame(() => this.trackFrame());
  }

  /**
   * Calculate FPS from frame times.
   */
  private calculateFPS(): number {
    if (this.frameTimes.length === 0) {
      return 0;
    }

    const avgFrameTime =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }

  /**
   * Analyze collected metrics.
   */
  private analyzeMetrics(metrics: PerformanceMetrics): MetricAnalysis {
    const frameTimeAvg =
      metrics.frameTimes.length > 0
        ? metrics.frameTimes.reduce((a, b) => a + b, 0) / metrics.frameTimes.length
        : 0;
    const frameTimeMin = Math.min(...metrics.frameTimes, Infinity);
    const frameTimeMax = Math.max(...metrics.frameTimes, 0);
    const frameTimeStdDev = this.calculateStdDev(metrics.frameTimes);

    return {
      frameTime: {
        average: frameTimeAvg,
        min: frameTimeMin === Infinity ? 0 : frameTimeMin,
        max: frameTimeMax,
        standardDeviation: frameTimeStdDev,
      },
      fpsStable: metrics.fps >= 55,
      mutationEfficiency: metrics.domMutationCount > 0 ? "moderate" : "excellent",
      latencyRating: this.rateLatency(metrics.latency),
      throughputRating: this.rateThroughput(metrics.throughput),
    };
  }

  /**
   * Calculate standard deviation.
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Rate latency performance.
   */
  private rateLatency(latency: number): "excellent" | "good" | "fair" | "poor" {
    if (latency < 16) return "excellent";
    if (latency < 50) return "good";
    if (latency < 100) return "fair";
    return "poor";
  }

  /**
   * Rate throughput performance.
   */
  private rateThroughput(throughput: number): "excellent" | "good" | "fair" | "poor" {
    if (throughput > 100) return "excellent";
    if (throughput > 50) return "good";
    if (throughput > 20) return "fair";
    return "poor";
  }

  /**
   * Generate recommendations based on analysis.
   */
  private generateRecommendations(analysis: MetricAnalysis): string[] {
    const recommendations: string[] = [];

    if (!analysis.fpsStable) {
      recommendations.push(
        "FPS is below target (60). Consider enabling diff batching or reducing animation complexity."
      );
    }

    if (analysis.frameTime.standardDeviation > 10) {
      recommendations.push(
        "High frame time variance detected. Consider implementing smart diff batching."
      );
    }

    if (analysis.latencyRating === "poor") {
      recommendations.push(
        "High input-to-render latency. Optimize patch application pipeline."
      );
    }

    if (analysis.mutationEfficiency === "moderate") {
      recommendations.push(
        "Consider virtualization for large documents to reduce DOM mutations."
      );
    }

    return recommendations;
  }
}

/**
 * Analysis results for performance metrics.
 */
export type MetricAnalysis = {
  frameTime: {
    average: number;
    min: number;
    max: number;
    standardDeviation: number;
  };
  fpsStable: boolean;
  mutationEfficiency: "excellent" | "moderate" | "poor";
  latencyRating: "excellent" | "good" | "fair" | "poor";
  throughputRating: "excellent" | "good" | "fair" | "poor";
};

/**
 * Complete performance report with analysis and recommendations.
 */
export type PerformanceReport = {
  timestamp: string;
  metrics: PerformanceMetrics;
  analysis: MetricAnalysis;
  recommendations: string[];
};

// Singleton instance for global access
let globalMonitorInstance: PerformanceMonitor | null = null;

export function getGlobalMonitor(): PerformanceMonitor {
  if (!globalMonitorInstance) {
    globalMonitorInstance = new PerformanceMonitor();
  }
  return globalMonitorInstance;
}

export function resetGlobalMonitor(): void {
  globalMonitorInstance?.stop();
  globalMonitorInstance = null;
}
