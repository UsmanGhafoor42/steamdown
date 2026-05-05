# Animated Markdown Demo

Standalone React 19 / Next.js 16 demo for an imperative `<AnimatedMarkdown />`
component. It renders settled markdown with `Streamdown`, then animates edit and
restore operations from a ref-driven queue.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/demo` or the alternate port printed by Next.

## Component API

```tsx
const ref = useRef<AnimatedMarkdownHandle>(null);

<AnimatedMarkdown
  ref={ref}
  baseText={doc}
  versionKey={versionId}
  caretColor="var(--primary)"
  restoreCaretColor="var(--muted-foreground)"
/>;

await ref.current?.play(patchSet);
await ref.current?.restore(previousSnapshot);
```

`baseText` and `versionKey` are declarative reset inputs. `play()` and
`restore()` are imperative one-shot events. The handle also exposes
`skipCurrent()`, `cancelQueued()`, `cancelAll()`, and `getText()`.

`speedMultiplier`, `forceReducedMotion`, and `animationConstants` are optional
extensions added for the demo harness and profiling workflow. The core API from
the brief still works unchanged without them.

## Demo Harness

`/demo` includes the nine contract scenarios plus a dedicated stress replay that
loads a real `15.7 KB` fixture (`LONG_MARKDOWN_15KB`) for browser profiling.

The demo also exposes a non-UI helper at `window.__animatedMarkdownDemo` for the
included profiling script. That helper can:

- run any named scenario
- run the 15 KB stress scenario
- switch versions
- report current FPS, document size, version key, and animation phase

## R5 Markdown Strategy

During animation the component keeps the visible document inside a single
`Streamdown` render:

- The animation engine mutates hidden DOM spans that hold the active edit
  buffer.
- A `MutationObserver` recomposes the full markdown string with an invisible
  caret marker.
- `Streamdown` renders that transient document in streaming mode so incomplete
  markdown stays in viewer-style presentation while the caret is overlaid at
  the live edit point.

Edit patch sets are normalized into smaller animation patches before playback.
That means inline edits usually animate only the changed token, and
block-straddling edits are decomposed into smaller insert/delete steps when the
internal diff can prove they are equivalent. This keeps the surrounding prose
visible and keeps the live edit window narrowly scoped even when the settled
document is much larger.

## Restore Diff

`restore(targetText)` computes patches internally with `diffToPatches()`:

- Run a character-level Myers diff across the current text and `targetText`.
- Coalesce the edit script into left-to-right change hunks.
- Emit anchored sequential patches from a live working string so each later
  patch is generated against the document shape created by the earlier ones.

This gives minimal change hunks at string-index granularity while keeping the
output replay-safe for `applyPatch()`. The diff cost is front-loaded into
`restore()` and never runs inside the animation RAF loop.

## Animation Constants

Defaults live in `components/AnimatedMarkdown/useAnimation.ts` and can be
overridden with `animationConstants`:

- Caret fade: `300ms`
- Pre-edit pause: `300ms`
- Zero-width pause: `150ms`
- Inter-patch beat: `150ms` on-screen, `300ms` after scroll
- Scroll cap: `400ms`
- Delete: `15ms/char`, clamped to `180-500ms` total per patch
- Type: eases from `80ms/char` to `17ms/char`

`typeSpeed` (`slow`, `normal`, `fast`) and `speedMultiplier` (`0.5x`, `1x`,
`2x`) scale those timings.

## R4 Character Guarantee

The delete/type loops never catch up after a dropped frame. Each character waits
for its delay and then one `requestAnimationFrame()` before the next DOM text
node mutation. That means a stalled browser lengthens the animation instead of
revealing a chunk.

Character streaming is grapheme-aware when `Intl.Segmenter` is available, so
emoji and combined characters animate as single visible units instead of split
UTF-16 code units.

## R9 Reset Guarantee

Changing `baseText` or `versionKey` clears RAFs, timers, queue wakeups, current
operation state, and queued operations. Current and queued promises reject with
`AnimationCancelledError`, and `onAnimationComplete` receives `cancelled: true`
for each cancelled operation. The new `baseText` is committed immediately in
Streamdown mode with no caret.

Invalid patches are surfaced with `console.warn("[AnimatedMarkdown] Skipping unresolved patch.")`
instead of silently disappearing.

## Performance Notes

Idle state has no component-owned RAF or timer. The demo page has a separate FPS
counter, but the component itself only schedules work during an active
operation.

Per character, the animation mutates only the active patch text nodes:

- deletion uses `Text.deleteData()` on the shrinking find region
- typing uses `Text.appendData()` on the typed region
- each mutation triggers one visible `Streamdown` rerender from the recomposed
  markdown snapshot

Patch sets are also normalized into smaller animation steps before playback,
which keeps the actively changing region tight even for block-level edits. The
hidden-span mutations remain local, while the visible document stays inside the
rendered markdown viewer throughout the edit. Scenario 1 is still the heaviest
case because it animates creation from an empty document.

Measured locally from a clean checkout on this machine:

- `diffToPatches()` restoring Scenario 3 back to base averaged `1.046ms` over
  `200` iterations.
- `diffToPatches()` restoring Scenario 4 back to base averaged `0.352ms` over
  `200` iterations.
- The real stress fixture used by `/demo` is `15.7 KB` (`16,081` bytes).
- A synthetic `15 KB` restore case averaged `3.188ms` over `50` iterations with
  post-GC heap growth of about `23.7 KB`.

Those measurements cover diff generation rather than browser paint. The `/demo`
harness remains the browser-side profiling surface for FPS, scroll behavior, and
idle CPU checks on the target hardware floor.

For browser profiling, this repo now includes:

```bash
npm run profile:demo
```

The script builds the production app, starts a temporary `next start` server on
a free local port, launches headless Chrome against `/demo`, runs the real
`15.7 KB` stress replay, prints JSON, then shuts the temporary server down. Set
`DEMO_URL=http://host:port/demo` to profile an already-running deployment
instead.

The JSON includes:

- min / avg / max FPS samples from the live demo counter
- document byte size and character count
- heap before / after / delta
- idle `TaskDuration` as a CPU proxy after animation completion
- final phase / last-event state

Recommended profiling pass for reviewers:

1. Open `/demo`.
2. Click `Replay 15 KB stress`.
3. Record Chrome Performance with CPU throttling at 4x.
4. Confirm the component has no idle RAF after completion and that the FPS
   counter stays near the display refresh rate during the active region updates.

## Verification

Current local verification:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Recommended clean-checkout verification:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

The demo fixtures now match the client brief text verbatim, so the scenario
labels, patch strings, and README discussion are all talking about the same
documents. `vitest.config.ts` defines `jsdom`, the React plugin, and the `@`
alias explicitly so the tests resolve the same way in a fresh checkout.

## Tests

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Coverage includes:

- `applyPatches()` with insertion, deletion, and `before` / `after`
  disambiguation.
- `diffToPatches()` restore round trips, including the block-straddling restore.
- Animation patch decomposition for block edits.
- Imperative queue behavior for `play()`, queued `restore()`, `cancelQueued()`,
  `skipCurrent()`, `cancelAll()`, `baseText` resets, and identical-text
  `versionKey` resets.
- Mid-animation `skipCurrent()` verification after a real typed character frame.
- Split-mode `baseText` reset verification after the active region is mounted.
- Reduced-motion instant apply behavior.
- Scroll comfort-zone coverage and two-segment long-scroll coverage.
- Valid scenario no-warning coverage plus unresolved-patch warning coverage.
- Invalid patch warning behavior.

## Known Limitations

- Live edit frames depend on `Streamdown`'s incomplete-markdown heuristics.
  Extremely ambiguous token-by-token states may momentarily favor a nearby
  markdown interpretation while still staying inside the rendered viewer.
- Scroll comfort logic targets the browser viewport. Nested custom scroll panes
  may need a host-specific scroll adapter.
- Scenario 1 necessarily has a whole-document active region because it animates
  creation from an empty document.
- Unresolved patches are logged with `console.warn()` and the operation resolves
  with unchanged text. This keeps the component resilient for demo and contract
  flows, but a product integrating it may want to surface that signal in its
  own telemetry or wrapper API.
- Browser-side FPS on the exact older Windows hardware floor should still be
  validated with the included `/demo` harness or `npm run profile:demo` before
  release.
