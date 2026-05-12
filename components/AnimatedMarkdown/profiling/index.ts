/**
 * Profiling utilities for the streaming markdown engine.
 */

export type {
  PerformanceMetrics,
  BenchmarkConfig,
  MetricAnalysis,
  PerformanceReport,
} from "./PerformanceMonitor";

export {
  PerformanceMonitor,
  BENCHMARK_CONFIGS,
  getGlobalMonitor,
  resetGlobalMonitor,
} from "./PerformanceMonitor";
