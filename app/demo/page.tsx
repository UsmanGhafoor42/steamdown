"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { AnimatedMarkdown } from "@/components/AnimatedMarkdown/AnimatedMarkdown";
import { scenarios } from "@/components/AnimatedMarkdown/fixtures";
import type {
  AnimatedMarkdownHandle,
  AnimationEvent,
  PresenceIntensity,
} from "@/components/AnimatedMarkdown/types";

const presenceOptions: PresenceIntensity[] = [
  "minimal",
  "subtle",
  "conversational",
  "normal",
  "expressive",
];

type DemoMetrics = {
  fps: number;
  versionKey: string;
  currentTextLength: number;
  currentDocKilobytes: number;
  activePhase: string | null;
  lastEvent: string;
};

declare global {
  interface Window {
    __animatedMarkdownDemo?: {
      runScenario: (scenarioId: string) => Promise<void>;
      getMetrics: () => DemoMetrics;
    };
  }
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForDocumentReset(
  markdownRef: RefObject<AnimatedMarkdownHandle | null>,
  expectedText: string,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await nextPaint();
    if ((markdownRef.current?.getText() ?? "") === expectedText) {
      return;
    }
  }
}

function getTextKilobytes(text: string) {
  return Number((new TextEncoder().encode(text).length / 1024).toFixed(1));
}

function getEventLabel(event: AnimationEvent | null) {
  if (!event) {
    return "Idle";
  }

  if (event.type === "edit") {
    return `${event.patchSet.label ?? "Edit"} ${
      event.cancelled ? "cancelled" : "complete"
    }`;
  }

  return `Restore ${event.cancelled ? "cancelled" : "complete"}`;
}

function useFps() {
  const [fps, setFps] = useState(60);

  useEffect(() => {
    let frameId = 0;
    let frameCount = 0;
    let lastSample = performance.now();

    const tick = (time: number) => {
      frameCount += 1;

      if (time - lastSample >= 1000) {
        setFps(Math.round((frameCount * 1000) / (time - lastSample)));
        frameCount = 0;
        lastSample = time;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, []);

  return fps;
}

export default function DemoPage() {
  const markdownRef = useRef<AnimatedMarkdownHandle>(null);
  const [baseText, setBaseText] = useState<string>(scenarios[0].baseText);
  const [versionKey, setVersionKey] = useState<string | number>(
    scenarios[0].versionKey,
  );
  const [caretColor, setCaretColor] = useState("#2563eb");
  const [restoreCaretColor, setRestoreCaretColor] = useState("#b45309");
  const [selectedScenarioId, setSelectedScenarioId] = useState("scenario-1");
  const [presenceIntensity, setPresenceIntensity] =
    useState<PresenceIntensity>("normal");
  const [lastEvent, setLastEvent] = useState<AnimationEvent | null>(null);
  const [displayedTextSnapshot, setDisplayedTextSnapshot] =
    useState<string>(baseText);
  const versionSequenceRef = useRef(0);
  const runScenarioRef = useRef<(scenarioId: string) => Promise<void>>(
    async () => undefined,
  );
  const metricsRef = useRef({
    baseText,
    fps: 60,
    lastEvent: null as AnimationEvent | null,
    versionKey: "v1",
  });
  const fps = useFps();
  const currentDocKilobytes = useMemo(
    () => getTextKilobytes(displayedTextSnapshot),
    [displayedTextSnapshot],
  );

  const resetDocument = useCallback(
    async (text: string, key: string | number) => {
      versionSequenceRef.current += 1;
      setBaseText(text);
      setVersionKey(`${key}:${versionSequenceRef.current}`);
      await nextPaint();
      await nextPaint();
    },
    [],
  );

  const runScenario = useCallback(
    async (scenarioId: string) => {
      const scenario = scenarios.find((item) => item.id === scenarioId) ?? null;

      if (!scenario) {
        return;
      }

      setSelectedScenarioId(scenarioId);
      setLastEvent(null);

      await resetDocument(scenario.baseText, scenario.versionKey);
      await waitForDocumentReset(markdownRef, scenario.baseText);

      try {
        if (scenario.id === "scenario-2") {
          await markdownRef.current?.play({
            label: "Select all and delete",
            patches: [{ find: scenario.baseText, replace: "" }],
          });
          await markdownRef.current?.play({
            label: "Write new document",
            patches: [
              { find: "", replace: scenario.patchSet.patches[0].replace },
            ],
          });
          return;
        }

        if (scenario.id === "scenario-4") {
          for (
            let index = 0;
            index < scenario.patchSet.patches.length;
            index += 1
          ) {
            const patch = scenario.patchSet.patches[index];
            await markdownRef.current?.play({
              label: `${scenario.patchSet.label ?? "Scenario 4"} ${index + 1}`,
              patches: [patch],
            });
          }
          return;
        }

        await markdownRef.current?.play({
          label: scenario.patchSet.label,
          patches: [...scenario.patchSet.patches],
        });
      } catch {
        // Intentional no-op for cancelled runs.
      }
    },
    [resetDocument],
  );

  useEffect(() => {
    runScenarioRef.current = runScenario;
  }, [runScenario]);

  useEffect(() => {
    metricsRef.current = {
      baseText,
      fps,
      lastEvent,
      versionKey: String(versionKey),
    };
  }, [baseText, fps, lastEvent, versionKey]);

  useEffect(() => {
    setDisplayedTextSnapshot(markdownRef.current?.getText() ?? baseText);
  }, [baseText, fps, lastEvent, versionKey]);

  useEffect(() => {
    window.__animatedMarkdownDemo = {
      runScenario: (scenarioId) => runScenarioRef.current(scenarioId),
      getMetrics: () => {
        const animatedRoot = document.querySelector<HTMLElement>(
          ".animated-markdown-root",
        );
        const currentText =
          markdownRef.current?.getText() ?? metricsRef.current.baseText;

        return {
          fps: metricsRef.current.fps,
          versionKey: metricsRef.current.versionKey,
          currentTextLength: currentText.length,
          currentDocKilobytes: getTextKilobytes(currentText),
          activePhase: animatedRoot?.dataset.phase ?? null,
          lastEvent: getEventLabel(metricsRef.current.lastEvent),
        };
      },
    };

    return () => {
      delete window.__animatedMarkdownDemo;
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Harness
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Animated Markdown
                </h1>
              </div>
              <div className="rounded-md border border-zinc-200 px-2 py-1 text-sm font-semibold dark:border-zinc-700">
                {fps} FPS
              </div>
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold">Scenarios</h2>
            <div className="mt-3 grid gap-2">
              {scenarios.map((scenario) => (
                <button
                  aria-pressed={selectedScenarioId === scenario.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-left text-sm transition hover:border-zinc-400 hover:bg-zinc-50 aria-pressed:border-blue-500 aria-pressed:bg-blue-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:aria-pressed:bg-blue-950/40"
                  key={scenario.id}
                  type="button"
                  onClick={() => void runScenario(scenario.id)}
                >
                  <span>
                    <span className="block font-semibold">
                      {scenario.label}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {scenario.name}
                    </span>
                  </span>
                  <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
                    Replay
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold">Controls</h2>

            <label className="mt-3 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Presence intensity
              <select
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                value={presenceIntensity}
                onChange={(event) =>
                  setPresenceIntensity(event.target.value as PresenceIntensity)
                }
              >
                {presenceOptions.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Edit caret
                <input
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white p-1 dark:border-zinc-600 dark:bg-zinc-800"
                  type="color"
                  value={caretColor}
                  onChange={(event) => setCaretColor(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Restore caret
                <input
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white p-1 dark:border-zinc-600 dark:bg-zinc-800"
                  type="color"
                  value={restoreCaretColor}
                  onChange={(event) => setRestoreCaretColor(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                type="button"
                onClick={() => void runScenario("scenario-1")}
              >
                Replay Scenario 1
              </button>
              <button
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                type="button"
                onClick={() => markdownRef.current?.skipCurrent()}
              >
                Skip current
              </button>
              <button
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                type="button"
                onClick={() => markdownRef.current?.cancelQueued()}
              >
                Cancel queue
              </button>
              <button
                className="h-10 rounded-md border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                type="button"
                onClick={() => markdownRef.current?.cancelAll()}
              >
                Cancel all
              </button>
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-3 rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Version key</dt>
              <dd className="mt-1 font-semibold">{String(versionKey)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500 dark:text-zinc-400">Last event</dt>
              <dd className="mt-1 font-semibold">{getEventLabel(lastEvent)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Doc size</dt>
              <dd className="mt-1 font-semibold">{currentDocKilobytes} KB</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Chars</dt>
              <dd className="mt-1 font-semibold">
                {displayedTextSnapshot.length}
              </dd>
            </div>
          </dl>
        </aside>

        <section className="min-h-[calc(100vh-2.5rem)] overflow-auto rounded-md border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <AnimatedMarkdown
            ref={markdownRef}
            baseText={baseText}
            versionKey={versionKey}
            caretColor={caretColor}
            restoreCaretColor={restoreCaretColor}
            className="mx-auto max-w-3xl text-[16px] leading-7 text-zinc-900 dark:text-zinc-100"
            proseClassName="prose-zinc dark:prose-invert prose-headings:tracking-tight prose-pre:border prose-pre:border-zinc-200 prose-pre:bg-zinc-950 prose-pre:text-zinc-50 dark:prose-headings:text-zinc-100 dark:prose-p:text-zinc-200 dark:prose-li:text-zinc-200 dark:prose-strong:text-zinc-100 dark:prose-pre:border-zinc-700"
            presenceIntensity={presenceIntensity}
            highVisibilityMode
            onAnimationComplete={setLastEvent}
          />
        </section>
      </div>
    </main>
  );
}
