import { useCallback, useMemo, useRef, useEffect } from "react";
import { PresenceManager } from "@/components/AnimatedMarkdown/presence/PresenceManager";
import {
  PresenceConfig,
  PresenceIntensity,
  TypingContext,
} from "@/components/AnimatedMarkdown/presence/types";
import type { Patch } from "@/components/AnimatedMarkdown/types";

interface UseHumanPresenceProps {
  intensity?: PresenceIntensity;
  config?: Partial<PresenceConfig>;
}

export function useHumanPresence({
  intensity = "normal",
  config,
}: UseHumanPresenceProps) {
  const managerRef = useRef<PresenceManager | null>(null);

  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new PresenceManager(intensity);
    } else {
      managerRef.current.setConfig(intensity);
    }

    if (config) {
      managerRef.current.setConfig(config);
    }
  }, [intensity, config]);

  const getDelay = useCallback((context: TypingContext) => {
    return managerRef.current?.getNextCharDelay(context) ?? 0;
  }, []);

  const getCursorHesitation = useCallback((distance: number) => {
    return managerRef.current?.getCursorHesitation(distance) ?? 0;
  }, []);

  const applyCursorJitter = useCallback((x: number, y: number) => {
    return managerRef.current?.applyCursorJitter(x, y) ?? { x, y };
  }, []);

  const expandPatches = useCallback((patches: Patch[]) => {
    return managerRef.current?.expandPatchesForRewrite(patches) ?? patches;
  }, []);

  const getSelectionPauseMs = useCallback(() => {
    return managerRef.current?.getSelectionPauseMs() ?? 0;
  }, []);

  const isThinkingEnabled = useCallback(() => {
    return managerRef.current?.isThinkingIndicatorEnabled() ?? false;
  }, []);

  return useMemo(
    () => ({
      getDelay,
      getCursorHesitation,
      applyCursorJitter,
      expandPatches,
      getSelectionPauseMs,
      isThinkingEnabled,
      manager: managerRef.current,
    }),
    [
      applyCursorJitter,
      expandPatches,
      getCursorHesitation,
      getDelay,
      getSelectionPauseMs,
      isThinkingEnabled,
    ],
  );
}
