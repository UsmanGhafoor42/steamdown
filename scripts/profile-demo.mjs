import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const CHROME_BIN =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROVIDED_DEMO_URL = process.env.DEMO_URL;
let targetUrl = PROVIDED_DEMO_URL ?? "http://127.0.0.1:3000/demo";
const POLL_INTERVAL_MS = 250;
const IDLE_SAMPLE_MS = 2000;
const API_TIMEOUT_MS = 20000;
const PROFILE_TIMEOUT_MS = 60000;

function metricMap(metrics) {
  return new Map(metrics.map((metric) => [metric.name, metric.value]));
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a local debugging port"));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response.json();
      }
    } catch {
      // Retry until the Chrome debugging endpoint is ready.
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForHttpOk(url, getLogs, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the Next server is listening.
    }

    await delay(250);
  }

  throw new Error(
    [
      `Timed out waiting for demo server at ${url}.`,
      "Server logs:",
      getLogs() || "(no server output captured)",
    ].join("\n"),
  );
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener(
        "error",
        (event) => reject(event.error ?? new Error("WebSocket error")),
        { once: true },
      );
    });

    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));

      if (message.id) {
        const pending = this.pending.get(message.id);

        if (!pending) {
          return;
        }

        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      const listeners = this.events.get(message.method);

      if (!listeners) {
        return;
      }

      for (const listener of listeners) {
        listener(message.params);
      }
    });
  }

  async ready() {
    await this.openPromise;
  }

  async send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.ws.send(JSON.stringify({ id, method, params }));
    return result;
  }

  on(method, listener) {
    const listeners = this.events.get(method) ?? [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }

  close() {
    this.ws.close();
  }
}

async function getPageTargetWsUrl(remoteDebuggingPort) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    const targets = await waitForJson(
      `http://127.0.0.1:${remoteDebuggingPort}/json/list`,
    );
    const pageTarget = targets.find((target) => target.type === "page");

    if (pageTarget) {
      return pageTarget.webSocketDebuggerUrl;
    }

    await delay(200);
  }

  throw new Error("Could not find a Chrome page target");
}

async function evaluate(client, expression, awaitPromise = true) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        `Evaluation failed for expression: ${expression}`,
    );
  }

  return result.result?.value;
}

function formatBrowserMessages(messages) {
  if (messages.length === 0) {
    return "No browser console errors were captured.";
  }

  return messages.slice(-8).join("\n");
}

async function waitForDemoApi(client, browserMessages) {
  const startedAt = Date.now();
  let lastStatus = null;

  while (Date.now() - startedAt < API_TIMEOUT_MS) {
    const status = await evaluate(
      client,
      `(() => ({
        readyState: document.readyState,
        hasApi: Boolean(window.__animatedMarkdownDemo?.getMetrics),
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 160) ?? "",
        scriptResources: performance.getEntriesByType("resource")
          .filter((entry) => entry.initiatorType === "script").length,
        demoChunkLoaded: performance.getEntriesByType("resource")
          .some((entry) => String(entry.name).includes("app_demo_page")),
        nextQueueLength: Array.isArray(window.__next_f)
          ? window.__next_f.length
          : null
      }))()`,
    );
    lastStatus = status;

    if (status.hasApi) {
      return status;
    }

    await delay(100);
  }

  throw new Error(
    [
      "Timed out waiting for window.__animatedMarkdownDemo.",
      `URL: ${targetUrl}`,
      `Last page status: ${JSON.stringify(lastStatus)}`,
      formatBrowserMessages(browserMessages),
    ].join("\n"),
  );
}

async function waitForStressFixture(client) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    const metrics = await evaluate(
      client,
      "window.__animatedMarkdownDemo?.getMetrics?.() ?? null",
    );

    if (
      metrics &&
      metrics.currentDocKilobytes >= 15 &&
      ["idle", "settled"].includes(metrics.activePhase)
    ) {
      return metrics;
    }

    await delay(100);
  }

  throw new Error("Timed out waiting for the 15 KB stress fixture to settle.");
}

async function startDemoServer() {
  if (PROVIDED_DEMO_URL) {
    return null;
  }

  const port = Number(process.env.DEMO_PORT ?? (await getAvailablePort()));
  const logs = [];
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  server.stdout.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr.on("data", (chunk) => logs.push(String(chunk)));
  targetUrl = `http://127.0.0.1:${port}/demo`;

  await waitForHttpOk(targetUrl, () => logs.join("").slice(-4000));

  return server;
}

async function main() {
  const remoteDebuggingPort = process.env.CHROME_DEBUG_PORT
    ? Number(process.env.CHROME_DEBUG_PORT)
    : await getAvailablePort();
  const demoServer = await startDemoServer();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "am-chrome-"));
  const chrome = spawn(
    CHROME_BIN,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,1200",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    {
      stdio: "ignore",
    },
  );
  let client;

  try {
    const wsUrl = await getPageTargetWsUrl(remoteDebuggingPort);
    client = new CdpClient(wsUrl);
    await client.ready();

    const browserMessages = [];

    client.on("Runtime.exceptionThrown", (params) => {
      browserMessages.push(
        params.exceptionDetails?.exception?.description ??
          params.exceptionDetails?.text ??
          "Runtime exception",
      );
    });
    client.on("Runtime.consoleAPICalled", (params) => {
      const values = params.args
        ?.map((arg) => arg.value ?? arg.description ?? "")
        .join(" ");

      if (params.type === "error" || params.type === "warning") {
        browserMessages.push(`${params.type}: ${values}`);
      }
    });

    const loadEvent = new Promise((resolve) => {
      client.on("Page.loadEventFired", resolve);
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Performance.enable");
    await client.send("HeapProfiler.enable");
    await client.send("Page.navigate", { url: targetUrl });
    await loadEvent;
    await waitForDemoApi(client, browserMessages);
    await evaluate(
      client,
      `(() => {
        window.__animatedMarkdownDemo.switchVersion("stress15k");
        return "switched";
      })()`,
    );
    await waitForStressFixture(client);

    await client.send("HeapProfiler.collectGarbage");

    const heapBefore = await evaluate(
      client,
      "performance.memory ? performance.memory.usedJSHeapSize : 0",
    );

    const firstMetrics = await evaluate(
      client,
      `(() => {
        const api = window.__animatedMarkdownDemo;

        if (!api?.runPerformanceScenario || !api?.getMetrics) {
          throw new Error("AnimatedMarkdown demo profiling API is unavailable.");
        }

        window.__animatedMarkdownProfile = { done: false, error: null };
        api.runPerformanceScenario()
          .then(() => {
            window.__animatedMarkdownProfile.done = true;
          })
          .catch((error) => {
            window.__animatedMarkdownProfile.done = true;
            window.__animatedMarkdownProfile.error =
              error?.stack ?? error?.message ?? String(error);
          });

        return api.getMetrics();
      })()`,
    );

    const fpsSamples = [];
    let sawActiveAnimation = false;
    let finalMetrics = firstMetrics;
    const profileStartedAt = Date.now();

    while (Date.now() - profileStartedAt < PROFILE_TIMEOUT_MS) {
      const sample = await evaluate(
        client,
        `(() => ({
          done: Boolean(window.__animatedMarkdownProfile?.done),
          error: window.__animatedMarkdownProfile?.error ?? null,
          metrics: window.__animatedMarkdownDemo?.getMetrics?.() ?? null
        }))()`,
      );

      if (sample.error) {
        throw new Error(sample.error);
      }

      if (sample.metrics) {
        finalMetrics = sample.metrics;

        if (
          sample.metrics.activePhase &&
          !["idle", "settled"].includes(sample.metrics.activePhase)
        ) {
          sawActiveAnimation = true;

          if (Number.isFinite(sample.metrics.fps) && sample.metrics.fps > 0) {
            fpsSamples.push(sample.metrics.fps);
          }
        }

        if (
          sample.done &&
          sample.metrics.activePhase === "settled" &&
          sample.metrics.lastEvent.endsWith("complete")
        ) {
          break;
        }
      }

      await delay(POLL_INTERVAL_MS);
    }

    if (!finalMetrics) {
      throw new Error("Profiling completed without receiving demo metrics.");
    }

    if (!sawActiveAnimation) {
      throw new Error(
        "Profiling never observed an active animation phase. " +
          formatBrowserMessages(browserMessages),
      );
    }

    await client.send("HeapProfiler.collectGarbage");

    const heapAfter = await evaluate(
      client,
      "performance.memory ? performance.memory.usedJSHeapSize : 0",
    );
    const perfAfterAnimation = metricMap(
      (await client.send("Performance.getMetrics")).metrics,
    );

    await delay(IDLE_SAMPLE_MS);

    const perfAfterIdle = metricMap(
      (await client.send("Performance.getMetrics")).metrics,
    );
    const idleTaskDelta =
      (perfAfterIdle.get("TaskDuration") ?? 0) -
      (perfAfterAnimation.get("TaskDuration") ?? 0);
    const avgFps =
      fpsSamples.length === 0
        ? null
        : Number(
            (
              fpsSamples.reduce((sum, value) => sum + value, 0) /
              fpsSamples.length
            ).toFixed(1),
          );

    const result = {
      url: targetUrl,
      completed: finalMetrics.lastEvent.endsWith("complete"),
      docKilobytes: finalMetrics.currentDocKilobytes,
      docChars: finalMetrics.currentTextLength,
      activePhase: finalMetrics.activePhase,
      lastEvent: finalMetrics.lastEvent,
      fps: {
        min: fpsSamples.length ? Math.min(...fpsSamples) : null,
        max: fpsSamples.length ? Math.max(...fpsSamples) : null,
        avg: avgFps,
        samples: fpsSamples.length,
      },
      heap: {
        beforeMb: Number((heapBefore / 1024 / 1024).toFixed(2)),
        afterMb: Number((heapAfter / 1024 / 1024).toFixed(2)),
        deltaMb: Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)),
      },
      cpu: {
        idleTaskMs: Number((idleTaskDelta * 1000).toFixed(1)),
        idleTaskPercent: Number(
          ((idleTaskDelta / (IDLE_SAMPLE_MS / 1000)) * 100).toFixed(2),
        ),
      },
      jsHeapUsedMb: {
        afterAnimation: Number(
          ((perfAfterAnimation.get("JSHeapUsedSize") ?? 0) / 1024 / 1024).toFixed(2),
        ),
        afterIdle: Number(
          ((perfAfterIdle.get("JSHeapUsedSize") ?? 0) / 1024 / 1024).toFixed(2),
        ),
      },
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    demoServer?.kill("SIGTERM");

    await new Promise((resolve) => {
      chrome.once("exit", resolve);
      setTimeout(resolve, 1000);
    });

    try {
      await rm(userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 250,
      });
    } catch {
      // The profile output is more important than best-effort temp cleanup.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
