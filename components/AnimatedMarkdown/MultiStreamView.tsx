"use client";

import { useRef } from "react";
import { AnimatedMarkdown } from "./AnimatedMarkdown";
import type { AnimatedMarkdownHandle, Patch, PatchSet } from "./types";

export type StreamSlot = {
  id: string;
  label: string;
  baseText: string;
  versionKey: string;
  patchSet: {
    label?: string;
    patches: readonly Patch[];
  };
};

type MultiStreamViewProps = {
  streams: StreamSlot[];
  className?: string;
};

/**
 * Phase 4: renders multiple independent AnimatedMarkdown streams side by side.
 */
export function MultiStreamView({ streams, className }: MultiStreamViewProps) {
  const refs = useRef<Record<string, AnimatedMarkdownHandle | null>>({});

  const playAll = async () => {
    await Promise.all(
      streams.map((stream) =>
        refs.current[stream.id]?.play({
          label: stream.patchSet.label,
          patches: [...stream.patchSet.patches],
        }),
      ),
    );
  };

  return (
    <div className={className}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Multi-stream comparison</h2>
          <p className="text-sm text-zinc-500">
            Parallel independent streams without shared queue contention.
          </p>
        </div>
        <button
          className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-800"
          type="button"
          onClick={() => void playAll()}
        >
          Play all streams
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {streams.map((stream) => (
          <article
            className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
            key={stream.id}
          >
            <header className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{stream.label}</h3>
              <button
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold hover:bg-zinc-100"
                type="button"
                onClick={() =>
                  void refs.current[stream.id]?.play({
                    label: stream.patchSet.label,
                    patches: [...stream.patchSet.patches],
                  })
                }
              >
                Replay
              </button>
            </header>
            <AnimatedMarkdown
              ref={(handle) => {
                refs.current[stream.id] = handle;
              }}
              baseText={stream.baseText}
              versionKey={stream.versionKey}
              className="text-[15px] leading-7 text-zinc-900"
              proseClassName="prose-zinc prose-sm"
              presenceIntensity="normal"
            />
          </article>
        ))}
      </div>
    </div>
  );
}
