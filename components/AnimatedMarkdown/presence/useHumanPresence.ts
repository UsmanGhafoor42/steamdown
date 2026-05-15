import { useMemo, useRef, useEffect } from "react";
import { PresenceManager } from "@/components/AnimatedMarkdown/presence/PresenceManager";
import {
  PresenceConfig,
  PresenceIntensity,
  TypingContext,
} from "@/components/AnimatedMarkdown/presence/types";

interface UseHumanPresenceProps {
  intensity?: PresenceIntensity;
  config?: Partial<PresenceConfig>;
}

/**
 * React hook to integrate Human Presence Layer into the streaming component.
 */
export function useHumanPresence({
  intensity = "normal",
  config,
}: UseHumanPresenceProps) {
  const managerRef = useRef<PresenceManager | null>(null);

  // Initialize or update manager when props change
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

  const getDelay = (context: TypingContext) => {
    return managerRef.current?.getNextCharDelay(context) || 0;
  };

  const getCursorHesitation = (distance: number) => {
    return managerRef.current?.getCursorHesitation(distance) || 0;
  };

  const applyCursorJitter = (x: number, y: number) => {
    return managerRef.current?.applyCursorJitter(x, y) || { x, y };
  };

  return {
    getDelay,
    getCursorHesitation,
    applyCursorJitter,
    manager: managerRef.current,
  };
}
