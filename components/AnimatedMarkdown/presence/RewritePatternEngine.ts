import type { Patch } from "../types";
import type { PresenceConfig } from "./types";

/**
 * Decomposes large replacements into human-like rewrite steps:
 * partial delete, brief pause, then continue — mirroring natural editing.
 */
export class RewritePatternEngine {
  private config: PresenceConfig;

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  public updateConfig(config: Partial<PresenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public shouldDecompose(patch: Patch): boolean {
    if (this.config.intensity === "subtle") {
      return false;
    }

    const changeRatio =
      patch.find.length > 0
        ? Math.abs(patch.replace.length - patch.find.length) / patch.find.length
        : 1;

    return (
      patch.find.length >= 12 &&
      patch.replace.length >= 8 &&
      changeRatio > 0.25 &&
      patch.find !== patch.replace
    );
  }

  /**
   * Break a single patch into smaller animation steps with optional backtrack.
   */
  public decomposePatch(patch: Patch): Patch[] {
    if (!this.shouldDecompose(patch)) {
      return [patch];
    }

    const findUnits = patch.find.split("");
    const replaceUnits = patch.replace.split("");
    const backtrackCount = Math.min(
      4,
      Math.max(2, Math.floor(findUnits.length * 0.15)),
    );
    const sharedPrefixLength = getSharedPrefixLength(patch.find, patch.replace);

    if (sharedPrefixLength >= Math.min(findUnits.length, replaceUnits.length) - 2) {
      return [patch];
    }

    const steps: Patch[] = [];
    const backtrackFind = findUnits.slice(0, -backtrackCount).join("");
    const backtrackReplace = replaceUnits
      .slice(0, Math.max(0, replaceUnits.length - backtrackCount))
      .join("");

    if (backtrackFind.length > 0 && backtrackFind !== backtrackReplace) {
      steps.push({
        find: patch.find,
        replace: backtrackReplace,
        before: patch.before,
        after: patch.after,
      });
    }

    steps.push({
      find: backtrackReplace || patch.find,
      replace: patch.replace,
      before: patch.before,
      after: patch.after,
    });

    return steps.length > 0 ? steps : [patch];
  }
}

function getSharedPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}
