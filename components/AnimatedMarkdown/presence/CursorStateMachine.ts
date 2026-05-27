/**
 * Cursor lifecycle state machine — prevents stuck/vibrating end states.
 */
export type CursorLifecycleState =
  | "idle"
  | "moving"
  | "thinking"
  | "selecting"
  | "typing"
  | "resolving"
  | "completed";

export class CursorStateMachine {
  private state: CursorLifecycleState = "idle";

  public getState(): CursorLifecycleState {
    return this.state;
  }

  public transition(next: CursorLifecycleState): CursorLifecycleState {
    this.state = next;
    return this.state;
  }

  public reset(): void {
    this.state = "idle";
  }

  public complete(): void {
    this.state = "completed";
  }

  public shouldPulse(): boolean {
    return this.state === "thinking";
  }

  public mapPhaseToState(
    phase: string,
    isThinking: boolean,
  ): CursorLifecycleState {
    switch (phase) {
      case "scrolling":
        return "moving";
      case "pausing":
        return isThinking ? "thinking" : "moving";
      case "selecting":
        return "selecting";
      case "deleting":
      case "typing":
        return "typing";
      case "settled":
        return "resolving";
      default:
        return "idle";
    }
  }
}
