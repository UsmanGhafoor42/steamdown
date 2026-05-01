"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatedMarkdown } from "@/components/AnimatedMarkdown/AnimatedMarkdown";
import {
  BASE_STRATEGY_DOC,
  BASE_STRATEGY_DOC_V2,
  LONG_MARKDOWN_15KB,
  PATCH_SET_3,
  performanceScenario,
  scenarios,
  versions,
} from "@/components/AnimatedMarkdown/fixtures";
import type {
  AnimatedMarkdownHandle,
  AnimationEvent,
  TypeSpeed,
} from "@/components/AnimatedMarkdown/types";

const typeSpeedOptions: TypeSpeed[] = ["slow", "normal", "fast"];
const speedMultipliers = [0.5, 1, 2] as const;

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
      runPerformanceScenario: () => Promise<void>;
      switchVersion: (versionKeyValue: string) => void;
      getMetrics: () => DemoMetrics;
    };
  }
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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
  const [baseText, setBaseText] = useState(BASE_STRATEGY_DOC);
  const [versionKey, setVersionKey] = useState<string | number>("v1");
  const [typeSpeed, setTypeSpeed] = useState<TypeSpeed>("normal");
  const [speedMultiplier, setSpeedMultiplier] =
    useState<(typeof speedMultipliers)[number]>(1);
  const [forceReducedMotion, setForceReducedMotion] = useState(false);
  const [caretColor, setCaretColor] = useState("#2563eb");
  const [restoreCaretColor, setRestoreCaretColor] = useState("#b45309");
  const [selectedScenarioId, setSelectedScenarioId] = useState("scenario-2");
  const [lastEvent, setLastEvent] = useState<AnimationEvent | null>(null);
  const [displayedTextSnapshot, setDisplayedTextSnapshot] = useState(baseText);
  const versionSequenceRef = useRef(0);
  const runScenarioRef = useRef<(scenarioId: string) => Promise<void>>(
    async () => undefined,
  );
  const switchVersionRef = useRef<(versionKeyValue: string) => void>(
    () => undefined,
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

  const selectedVersionLabel = useMemo(() => {
    return (
      versions.find((version) => version.text === baseText)?.label ??
      "Custom state"
    );
  }, [baseText]);

  const resetDocument = useCallback(async (text: string, key: string | number) => {
    versionSequenceRef.current += 1;
    setBaseText(text);
    setVersionKey(`${key}:${versionSequenceRef.current}`);
    await nextPaint();
  }, []);

  const runScenario = useCallback(async (scenarioId: string) => {
    const scenario =
      scenarios.find((item) => item.id === scenarioId) ??
      (scenarioId === performanceScenario.id ? performanceScenario : null);

    if (!scenario) {
      return;
    }

    setSelectedScenarioId(scenarioId);
    setLastEvent(null);

    if (scenario.id === "scenario-5") {
      setForceReducedMotion(true);
    }

    if (scenario.id !== "scenario-5") {
      setForceReducedMotion(false);
    }

    await resetDocument(scenario.baseText, scenario.versionKey);

    try {
      if (scenario.id === "scenario-7") {
        await markdownRef.current?.play(PATCH_SET_3);
        await markdownRef.current?.restore(BASE_STRATEGY_DOC);
        return;
      }

      if (scenario.id === "scenario-8") {
        const playPromise = markdownRef.current?.play(PATCH_SET_3);

        window.setTimeout(() => {
          versionSequenceRef.current += 1;
          setBaseText(BASE_STRATEGY_DOC_V2);
          setVersionKey(`v2:${versionSequenceRef.current}`);
        }, 500);

        await playPromise;
        return;
      }

      if (scenario.id === "scenario-9") {
        const playPromise = markdownRef.current?.play(scenario.patchSet);

        window.setTimeout(() => {
          versionSequenceRef.current += 1;
          setVersionKey(`v4:${versionSequenceRef.current}`);
        }, 500);

        await playPromise;
        return;
      }

      await markdownRef.current?.play(scenario.patchSet);
    } catch {
      // Cancellation is expected in version-switch scenarios.
    }
  }, [resetDocument]);

  const restoreToBase = useCallback(async () => {
    try {
      await markdownRef.current?.restore(BASE_STRATEGY_DOC);
    } catch {
      // Restore can be cancelled by an explicit version switch.
    }
  }, []);

  const switchVersion = useCallback((versionKeyValue: string) => {
    const nextVersion = versions.find((version) => version.key === versionKeyValue);

    if (!nextVersion) {
      return;
    }

    setBaseText(nextVersion.text);
    versionSequenceRef.current += 1;
    setVersionKey(`${nextVersion.key}:${versionSequenceRef.current}`);
  }, []);

  useEffect(() => {
    runScenarioRef.current = runScenario;
  }, [runScenario]);

  useEffect(() => {
    switchVersionRef.current = switchVersion;
  }, [switchVersion]);

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
      runPerformanceScenario: () =>
        runScenarioRef.current(performanceScenario.id),
      switchVersion: (versionKeyValue) =>
        switchVersionRef.current(versionKeyValue),
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
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Harness
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Animated Markdown
                </h1>
              </div>
              <div className="rounded-md border border-zinc-200 px-2 py-1 text-sm font-semibold">
                {fps} FPS
              </div>
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Scenarios</h2>
            <div className="mt-3 grid gap-2">
              {scenarios.map((scenario) => (
                <button
                  aria-pressed={selectedScenarioId === scenario.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-left text-sm transition hover:border-zinc-400 hover:bg-zinc-50 aria-pressed:border-blue-500 aria-pressed:bg-blue-50"
                  key={scenario.id}
                  type="button"
                  onClick={() => void runScenario(scenario.id)}
                >
                  <span>
                    <span className="block font-semibold">{scenario.label}</span>
                    <span className="text-zinc-500">{scenario.name}</span>
                  </span>
                  <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
                    Replay
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Controls</h2>

            <label className="mt-3 block text-sm font-medium text-zinc-600">
              Version
              <select
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-zinc-950"
                value={String(versionKey).split(":")[0]}
                onChange={(event) => switchVersion(event.target.value)}
              >
                {versions.map((version) => (
                  <option key={version.key} value={version.key}>
                    {version.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-md border border-zinc-300">
              {typeSpeedOptions.map((speed) => (
                <button
                  aria-pressed={typeSpeed === speed}
                  className="h-9 border-r border-zinc-300 text-sm font-medium capitalize last:border-r-0 hover:bg-zinc-50 aria-pressed:bg-zinc-900 aria-pressed:text-white"
                  key={speed}
                  type="button"
                  onClick={() => setTypeSpeed(speed)}
                >
                  {speed}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-md border border-zinc-300">
              {speedMultipliers.map((multiplier) => (
                <button
                  aria-pressed={speedMultiplier === multiplier}
                  className="h-9 border-r border-zinc-300 text-sm font-medium last:border-r-0 hover:bg-zinc-50 aria-pressed:bg-amber-500 aria-pressed:text-zinc-950"
                  key={multiplier}
                  type="button"
                  onClick={() => setSpeedMultiplier(multiplier)}
                >
                  {multiplier}x
                </button>
              ))}
            </div>

            <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-zinc-700">
              Reduced motion
              <input
                checked={forceReducedMotion}
                className="h-5 w-5 accent-blue-600"
                type="checkbox"
                onChange={(event) => setForceReducedMotion(event.target.checked)}
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-zinc-700">
                Edit caret
                <input
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white p-1"
                  type="color"
                  value={caretColor}
                  onChange={(event) => setCaretColor(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-zinc-700">
                Restore caret
                <input
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white p-1"
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
                onClick={() => void restoreToBase()}
              >
                Restore to base
              </button>
              <button
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50"
                type="button"
                onClick={() => markdownRef.current?.skipCurrent()}
              >
                Skip current
              </button>
              <button
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50"
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

          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Profiling</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Real 15 KB fixture for browser perf checks.
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600">
                {getTextKilobytes(LONG_MARKDOWN_15KB)} KB
              </div>
            </div>

            <button
              className="mt-4 h-10 w-full rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
              type="button"
              onClick={() => void runScenario(performanceScenario.id)}
            >
              Replay 15 KB stress
            </button>
          </section>

          <dl className="grid grid-cols-2 gap-3 rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <div>
              <dt className="text-zinc-500">Version</dt>
              <dd className="mt-1 font-semibold">{selectedVersionLabel}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Version key</dt>
              <dd className="mt-1 font-semibold">{String(versionKey)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500">Last event</dt>
              <dd className="mt-1 font-semibold">{getEventLabel(lastEvent)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Doc size</dt>
              <dd className="mt-1 font-semibold">{currentDocKilobytes} KB</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Chars</dt>
              <dd className="mt-1 font-semibold">{displayedTextSnapshot.length}</dd>
            </div>
          </dl>
        </aside>

        <section className="min-h-[calc(100vh-2.5rem)] overflow-auto rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
          <AnimatedMarkdown
            ref={markdownRef}
            baseText={baseText}
            versionKey={versionKey}
            caretColor={caretColor}
            restoreCaretColor={restoreCaretColor}
            className="mx-auto max-w-3xl text-[16px] leading-7 text-zinc-900"
            proseClassName="prose-zinc prose-headings:tracking-tight prose-pre:border prose-pre:border-zinc-200 prose-pre:bg-zinc-950 prose-pre:text-zinc-50"
            typeSpeed={typeSpeed}
            speedMultiplier={speedMultiplier}
            forceReducedMotion={forceReducedMotion}
            onAnimationComplete={setLastEvent}
          />
        </section>
      </div>
    </main>
  );
}
