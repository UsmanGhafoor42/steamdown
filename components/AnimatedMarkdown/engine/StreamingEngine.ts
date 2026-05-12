import type { Patch, PatchSet } from "../types";

/**
 * Lifecycle phases for behavior layers in the streaming engine.
 */
export type LayerPhase =
  | "idle"
  | "pre-process"
  | "processing"
  | "post-process"
  | "render"
  | "complete";

/**
 * Context object passed to behavior layers during execution.
 */
export type LayerContext = {
  /** Current document text */
  text: string;
  /** Current animation phase */
  phase: string;
  /** Stream identifier (for multi-stream support) */
  streamId?: string;
  /** Timestamp when processing started */
  timestamp: number;
  /** Metadata about the current operation */
  metadata: Record<string, unknown>;
};

/**
 * Result object returned by behavior layer hooks.
 */
export type LayerResult = {
  /** Modified text (if any) */
  text?: string;
  /** Modified patches (if any) */
  patches?: Patch[];
  /** Additional metadata to merge into context */
  metadata?: Record<string, unknown>;
  /** Signal to skip remaining layers */
  shouldStop?: boolean;
  /** Signal to retry the operation */
  shouldRetry?: boolean;
};

/**
 * Behavior Layer Interface
 * 
 * Layers can intercept and modify the streaming pipeline at various stages.
 * They enable pluggable behavior for features like:
 * - Content transformation
 * - Rate limiting
 * - Multi-stream coordination
 * - Custom animations
 * - Telemetry/logging
 */
export interface BehaviorLayer {
  /** Unique identifier for this layer */
  readonly id: string;
  
  /** Priority order (lower numbers execute first) */
  readonly priority: number;
  
  /** Called before processing begins */
  onPreProcess?(context: LayerContext): Promise<LayerResult | void>;
  
  /** Called during patch processing */
  onProcess?(context: LayerContext, patches: Patch[]): Promise<LayerResult | void>;
  
  /** Called after all patches are processed */
  onPostProcess?(context: LayerContext): Promise<LayerResult | void>;
  
  /** Called before rendering */
  onRender?(context: LayerContext): Promise<LayerResult | void>;
  
  /** Called when operation completes */
  onComplete?(context: LayerContext): Promise<LayerResult | void>;
  
  /** Called when layer is registered with the engine */
  onRegister?(engine: StreamingEngine): void;
  
  /** Called when layer is unregistered */
  onUnregister?(): void;
}

/**
 * Internal layer wrapper with registration state.
 */
type RegisteredLayer = {
  layer: BehaviorLayer;
  isActive: boolean;
  registeredAt: number;
};

/**
 * Streaming Engine - Core coordinator for the markdown streaming pipeline.
 * 
 * Manages behavior layer execution, stream coordination, and provides
 * the foundation for multi-stream architecture.
 */
export class StreamingEngine {
  private layers: Map<string, RegisteredLayer> = new Map();
  private streamRegistry: Map<string, StreamState> = new Map();
  private isProcessing: boolean = false;
  private processingQueue: Array<() => Promise<void>> = [];

  /**
   * Register a behavior layer with the engine.
   */
  registerLayer(layer: BehaviorLayer): void {
    if (this.layers.has(layer.id)) {
      console.warn(`[StreamingEngine] Layer "${layer.id}" already registered.`);
      return;
    }

    const registered: RegisteredLayer = {
      layer,
      isActive: true,
      registeredAt: Date.now(),
    };

    this.layers.set(layer.id, registered);
    
    // Sort layers by priority
    this.sortLayers();
    
    // Notify layer of registration
    layer.onRegister?.(this);
    
    console.log(`[StreamingEngine] Layer "${layer.id}" registered (priority: ${layer.priority})`);
  }

  /**
   * Unregister a behavior layer.
   */
  unregisterLayer(layerId: string): void {
    const registered = this.layers.get(layerId);
    
    if (!registered) {
      console.warn(`[StreamingEngine] Layer "${layerId}" not found.`);
      return;
    }

    registered.layer.onUnregister?.();
    registered.isActive = false;
    this.layers.delete(layerId);
    
    console.log(`[StreamingEngine] Layer "${layerId}" unregistered.`);
  }

  /**
   * Enable or disable a layer without unregistering it.
   */
  setLayerActive(layerId: string, active: boolean): void {
    const registered = this.layers.get(layerId);
    
    if (!registered) {
      console.warn(`[StreamingEngine] Layer "${layerId}" not found.`);
      return;
    }

    registered.isActive = active;
    console.log(`[StreamingEngine] Layer "${layerId}" ${active ? "enabled" : "disabled"}.`);
  }

  /**
   * Get all active layers sorted by priority.
   */
  getActiveLayers(): BehaviorLayer[] {
    return Array.from(this.layers.values())
      .filter((l) => l.isActive)
      .map((l) => l.layer);
  }

  /**
   * Execute a processing pipeline through all active layers.
   */
  async process(context: LayerContext, patches: Patch[]): Promise<{
    text: string;
    patches: Patch[];
    metadata: Record<string, unknown>;
  }> {
    if (this.isProcessing) {
      // Queue for later execution
      return new Promise((resolve, reject) => {
        this.processingQueue.push(async () => {
          try {
            const result = await this.executePipeline(context, patches);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    this.isProcessing = true;
    
    try {
      return await this.executePipeline(context, patches);
    } finally {
      this.isProcessing = false;
      
      // Process queued operations
      if (this.processingQueue.length > 0) {
        const next = this.processingQueue.shift();
        if (next) {
          setTimeout(() => next(), 0);
        }
      }
    }
  }

  /**
   * Execute the full layer pipeline.
   */
  private async executePipeline(
    context: LayerContext,
    patches: Patch[]
  ): Promise<{
    text: string;
    patches: Patch[];
    metadata: Record<string, unknown>;
  }> {
    const activeLayers = this.getActiveLayers();
    let currentText = context.text;
    let currentPatches = [...patches];
    let currentMetadata = { ...context.metadata };

    // Pre-process phase
    for (const layer of activeLayers) {
      if (layer.onPreProcess) {
        const result = await layer.onPreProcess({
          ...context,
          text: currentText,
          metadata: currentMetadata,
        });

        if (result) {
          if (result.text !== undefined) currentText = result.text;
          if (result.patches !== undefined) currentPatches = result.patches;
          if (result.metadata) currentMetadata = { ...currentMetadata, ...result.metadata };
          if (result.shouldStop) break;
        }
      }
    }

    // Process phase
    for (const layer of activeLayers) {
      if (layer.onProcess) {
        const result = await layer.onProcess(
          {
            ...context,
            text: currentText,
            metadata: currentMetadata,
          },
          currentPatches
        );

        if (result) {
          if (result.text !== undefined) currentText = result.text;
          if (result.patches !== undefined) currentPatches = result.patches;
          if (result.metadata) currentMetadata = { ...currentMetadata, ...result.metadata };
          if (result.shouldStop) break;
        }
      }
    }

    // Post-process phase
    for (const layer of activeLayers) {
      if (layer.onPostProcess) {
        const result = await layer.onPostProcess({
          ...context,
          text: currentText,
          metadata: currentMetadata,
        });

        if (result) {
          if (result.text !== undefined) currentText = result.text;
          if (result.metadata) currentMetadata = { ...currentMetadata, ...result.metadata };
          if (result.shouldStop) break;
        }
      }
    }

    return {
      text: currentText,
      patches: currentPatches,
      metadata: currentMetadata,
    };
  }

  /**
   * Register a new stream with the engine.
   */
  registerStream(streamId: string, initialState: Partial<StreamState> = {}): void {
    if (this.streamRegistry.has(streamId)) {
      console.warn(`[StreamingEngine] Stream "${streamId}" already registered.`);
      return;
    }

    this.streamRegistry.set(streamId, {
      id: streamId,
      isActive: true,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      patchCount: 0,
      ...initialState,
    });

    console.log(`[StreamingEngine] Stream "${streamId}" registered.`);
  }

  /**
   * Unregister a stream.
   */
  unregisterStream(streamId: string): void {
    this.streamRegistry.delete(streamId);
    console.log(`[StreamingEngine] Stream "${streamId}" unregistered.`);
  }

  /**
   * Update stream activity timestamp.
   */
  touchStream(streamId: string): void {
    const stream = this.streamRegistry.get(streamId);
    if (stream) {
      stream.lastActivityAt = Date.now();
    }
  }

  /**
   * Get stream state.
   */
  getStream(streamId: string): StreamState | undefined {
    return this.streamRegistry.get(streamId);
  }

  /**
   * Get all active streams.
   */
  getActiveStreams(): StreamState[] {
    return Array.from(this.streamRegistry.values()).filter((s) => s.isActive);
  }

  /**
   * Sort layers by priority.
   */
  private sortLayers(): void {
    // Maps maintain insertion order, so we need to re-insert in sorted order
    const sorted = Array.from(this.layers.entries()).sort(
      ([, a], [, b]) => a.layer.priority - b.layer.priority
    );
    
    this.layers.clear();
    for (const [id, layer] of sorted) {
      this.layers.set(id, layer);
    }
  }

  /**
   * Clear all layers and streams.
   */
  clear(): void {
    for (const [, registered] of this.layers) {
      registered.layer.onUnregister?.();
    }
    this.layers.clear();
    this.streamRegistry.clear();
    this.processingQueue = [];
    this.isProcessing = false;
  }
}

/**
 * Stream state for multi-stream coordination.
 */
export type StreamState = {
  id: string;
  isActive: boolean;
  createdAt: number;
  lastActivityAt: number;
  patchCount: number;
  metadata?: Record<string, unknown>;
};

// Singleton instance for global access (optional)
let globalEngineInstance: StreamingEngine | null = null;

export function getGlobalEngine(): StreamingEngine {
  if (!globalEngineInstance) {
    globalEngineInstance = new StreamingEngine();
  }
  return globalEngineInstance;
}

export function resetGlobalEngine(): void {
  globalEngineInstance?.clear();
  globalEngineInstance = null;
}
