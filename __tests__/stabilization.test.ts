import { describe, expect, test } from "vitest";
import { CursorStateMachine } from "@/components/AnimatedMarkdown/presence/CursorStateMachine";
import {
  classifyPatchDiff,
  wrapLiveDiffMarkup,
} from "@/components/AnimatedMarkdown/diffHighlights";

describe("CursorStateMachine", () => {
  test("maps phases to cursor states and resets to idle", () => {
    const machine = new CursorStateMachine();

    expect(machine.mapPhaseToState("pausing", true)).toBe("thinking");
    expect(machine.mapPhaseToState("selecting", false)).toBe("selecting");
    expect(machine.mapPhaseToState("typing", false)).toBe("typing");

    machine.transition("typing");
    machine.complete();
    machine.reset();

    expect(machine.getState()).toBe("idle");
  });
});

describe("diff clarity", () => {
  test("classifies patch diff kinds", () => {
    expect(classifyPatchDiff("", "hello")).toBe("add");
    expect(classifyPatchDiff("old", "")).toBe("remove");
    expect(classifyPatchDiff("old", "new")).toBe("rewrite");
  });

  test("wraps live diff markup with rewrite class", () => {
    const result = wrapLiveDiffMarkup("changed", "rewrite");
    expect(result).toContain("animated-markdown-diff-rewrite");
    expect(result).toContain("animated-markdown-diff-live");
  });
});
