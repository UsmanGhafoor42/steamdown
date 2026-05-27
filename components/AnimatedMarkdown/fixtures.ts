import type { PatchSet } from "./types";

function buildStressSection(index: number) {
  const marker = `[S${index}]`;

  return `## Stress Section ${index}

# Momentum Breakout Strategy
## Thesis
Trade large-cap tech names that break above their 20-day high on
above-average volume. The strategy targets short-horizon continuation and
exits quickly on weakness.
## Universe
- AAPL
- MSFT
- NVDA
- GOOGL
- META
## Entry Criteria
- Close breaks above 20-day high
- Volume >= 1.5x the 20-day average volume
- RSI(14) between 50 and 70
- SPY above its 50-day moving average
## Position Sizing
- 25% of portfolio per entry ${marker}
- Max 3 concurrent positions
If a signal fires while three positions are open, the signal is skipped.
The strategy does not queue pending entries.
## Exit Criteria
- Stop loss: -5% from entry ${marker}
- Take profit: +15% from entry ${marker}
- Time stop: close after 10 trading days if neither hit ${marker}
## Risk Management
- Daily loss limit: 2%
- No new entries after 2:30pm ET
- Flat into long weekends
## Review Cadence
The strategy is reviewed monthly. Any deviation from the documented rules
is logged with a rationale.`;
}

export const SEED_MARKDOWN = `# Momentum Breakout Strategy
A long-only momentum strategy that enters on confirmed breakouts from the
20-day high, sizes positions by trailing volatility, and exits on either a
fixed stop or a time stop.
## Thesis
Large-cap names that break above their 20-day high on above-average volume
tend to continue higher in the short term, particularly when broader market
breadth is positive. The strategy harvests this short-horizon continuation
premium while capping downside with a tight per-trade stop.
## Universe
The strategy trades a fixed basket of large-cap US equities, rebalanced
quarterly:
- AAPL
- MSFT
- NVDA
- GOOGL
- META
## Entry Criteria
- Close breaks above 20-day high
- Volume >= 1.5x the 20-day average volume
- RSI(14) between 50 and 70
- SPY trading above its 50-day moving average
## Exit Criteria
- Stop loss: -5% from entry
- Take profit: +15% from entry
- Time stop: exit after 10 trading days if neither level hit
## Backtest Parameters
\`\`\`python
params = {
"universe": ["AAPL", "MSFT", "NVDA", "GOOGL", "META"],
"lookback_days": 20,
"volume_mult": 1.5,
"rsi_min": 50,
"rsi_max": 70,
"stop_loss_pct": -0.05,
"take_profit_pct": 0.15,
"time_stop_days": 10,
}
\`\`\`
`;

export const BASE_STRATEGY_DOC = `# Momentum Breakout Strategy
## Thesis
Trade large-cap tech names that break above their 20-day high on
above-average volume. The strategy targets short-horizon continuation and
exits quickly on weakness.
## Universe
- AAPL
- MSFT
- NVDA
- GOOGL
- META
## Entry Criteria
- Close breaks above 20-day high
- Volume >= 1.5x the 20-day average volume
- RSI(14) between 50 and 70
- SPY above its 50-day moving average
## Position Sizing
- 25% of portfolio per entry
- Max 3 concurrent positions
If a signal fires while three positions are open, the signal is skipped.
The strategy does not queue pending entries.
## Exit Criteria
- Stop loss: -5% from entry
- Take profit: +15% from entry
- Time stop: close after 10 trading days if neither hit
## Risk Management
- Daily loss limit: 2%
- No new entries after 2:30pm ET
- Flat into long weekends
## Review Cadence
The strategy is reviewed monthly. Any deviation from the documented rules
is logged with a rationale.
`;

export const BASE_STRATEGY_DOC_V2 = `# Mean Reversion — SPY Pullbacks
## Thesis
Buy SPY on 3-day pullbacks below its 10-day moving average, exit when it
closes back above the 10-day MA or after 5 trading days, whichever comes
first. This is a different strategy entirely — used to prove that a
\`baseText\` change snaps instantly without animating.
## Universe
- SPY
## Entry Criteria
- SPY closed below the 10-day MA for 3 consecutive sessions
- VIX below 25
- No FOMC meeting within the next 2 sessions
## Exit Criteria
- SPY closes above the 10-day MA
- Time stop: 5 trading days
- Hard stop: -2% from entry
## Risk Management
- Single position only, full allocation
- No entries on quadruple-witching days
`;

export const LONG_MARKDOWN_15KB = Array.from(
  { length: 16 },
  (_, index) => buildStressSection(index + 1),
).join("\n\n");

export const LONG_MARKDOWN_50KB = Array.from(
  { length: 52 },
  (_, index) => buildStressSection(index + 1),
).join("\n\n");

export const LONG_MARKDOWN_150KB = Array.from(
  { length: 155 },
  (_, index) => buildStressSection(index + 1),
).join("\n\n");

export const PATCH_SET_1: PatchSet = {
  label: "Create plan",
  patches: [{ find: "", replace: SEED_MARKDOWN }],
};

export const PATCH_SET_2: PatchSet = {
  label: "Tighten stop",
  patches: [
    { find: "Stop loss: -5% from entry", replace: "Stop loss: -3% from entry" },
  ],
};

export const PATCH_SET_3: PatchSet = {
  label: "Tighten risk + add RSI exit",
  patches: [
    {
      find: "- Take profit: +15% from entry\n",
      replace: "- Take profit: +12% from entry\n- Exit on RSI(14) > 75\n",
    },
    {
      find: "- 25% of portfolio per entry",
      replace: "- 15% of portfolio per entry",
    },
    {
      find: "## Risk Management",
      replace: "## Risk Management\n\nReview open positions every Friday.\n",
    },
    {
      find: "- Stop loss: -5% from entry",
      replace: "- Stop loss: -3% from entry",
    },
  ],
};

export const PATCH_SET_4: PatchSet = {
  label: "Expand risk section",
  patches: [
    {
      find: "## Risk Management\n- Daily loss limit: 2%",
      replace:
        "## Risk Management\n\n### Daily limits\n\n" +
        "- Daily loss limit: 2%\n- Weekly drawdown cap: 5%",
    },
  ],
};

export const PATCH_SET_6: PatchSet = {
  label: "Remove NVDA",
  patches: [{ find: "- NVDA\n", replace: "" }],
};

export const PATCH_SET_15KB: PatchSet = {
  label: "Stress 15 KB edit",
  patches: [
    {
      find: "- Stop loss: -5% from entry [S2]",
      replace: "- Stop loss: -3% from entry [S2]",
    },
    {
      find: "- 25% of portfolio per entry [S6]",
      replace: "- 15% of portfolio per entry [S6]",
    },
    {
      find: "- Take profit: +15% from entry [S9]\n",
      replace:
        "- Take profit: +12% from entry [S9]\n- Exit on RSI(14) > 75 [S9]\n",
    },
    {
      find: "## Risk Management\n- Daily loss limit: 2%",
      replace:
        "## Risk Management\n\n### Daily limits\n\n" +
        "- Daily loss limit: 2%\n- Weekly drawdown cap: 5%",
      before: `- Time stop: close after 10 trading days if neither hit [S11]\n`,
    },
  ],
};

export const PATCH_SET_50KB: PatchSet = {
  label: "Stress 50 KB edit",
  patches: [
    {
      find: "- Stop loss: -5% from entry [S14]",
      replace: "- Stop loss: -3% from entry [S14]",
    },
    {
      find: "- 25% of portfolio per entry [S26]",
      replace: "- 12% of portfolio per entry [S26]",
    },
    {
      find: "- Take profit: +15% from entry [S33]\n",
      replace:
        "- Take profit: +10% from entry [S33]\n- Exit on RSI(14) > 74 [S33]\n",
    },
    {
      find: "## Risk Management\n- Daily loss limit: 2%",
      replace:
        "## Risk Management\n\n### Daily limits\n\n" +
        "- Daily loss limit: 2%\n- Weekly drawdown cap: 4.5%",
      before: `- Time stop: close after 10 trading days if neither hit [S40]\n`,
    },
  ],
};

export const PATCH_SET_150KB: PatchSet = {
  label: "Stress 150 KB edit",
  patches: [
    {
      find: "- Stop loss: -5% from entry [S48]",
      replace: "- Stop loss: -2.5% from entry [S48]",
    },
    {
      find: "- 25% of portfolio per entry [S77]",
      replace: "- 10% of portfolio per entry [S77]",
    },
    {
      find: "- Take profit: +15% from entry [S101]\n",
      replace:
        "- Take profit: +9% from entry [S101]\n- Exit on RSI(14) > 72 [S101]\n",
    },
    {
      find: "## Risk Management\n- Daily loss limit: 2%",
      replace:
        "## Risk Management\n\n### Daily limits\n\n" +
        "- Daily loss limit: 2%\n- Weekly drawdown cap: 4%",
      before: `- Time stop: close after 10 trading days if neither hit [S120]\n`,
    },
  ],
};

export const versions = [
  {
    key: "empty",
    label: "Empty draft",
    text: "",
  },
  {
    key: "v1",
    label: "Breakout v1",
    text: BASE_STRATEGY_DOC,
  },
  {
    key: "v2",
    label: "SPY pullbacks",
    text: BASE_STRATEGY_DOC_V2,
  },
  {
    key: "v3",
    label: "Breakout v3",
    text: BASE_STRATEGY_DOC,
  },
  {
    key: "v4",
    label: "Breakout v4",
    text: BASE_STRATEGY_DOC,
  },
  {
    key: "stress15k",
    label: "Stress 15 KB",
    text: LONG_MARKDOWN_15KB,
  },
  {
    key: "stress50k",
    label: "Stress 50 KB",
    text: LONG_MARKDOWN_50KB,
  },
  {
    key: "stress150k",
    label: "Stress 150 KB",
    text: LONG_MARKDOWN_150KB,
  },
] as const;

export const performanceScenario = {
  id: "scenario-stress-15kb",
  label: "Stress 15 KB",
  name: "Browser perf",
  versionKey: "stress15k",
  baseText: LONG_MARKDOWN_15KB,
  patchSet: PATCH_SET_15KB,
} as const;

export const performanceScenarios = [
  performanceScenario,
  {
    id: "scenario-stress-50kb",
    label: "Stress 50 KB",
    name: "Browser perf",
    versionKey: "stress50k",
    baseText: LONG_MARKDOWN_50KB,
    patchSet: PATCH_SET_50KB,
  },
  {
    id: "scenario-stress-150kb",
    label: "Stress 150 KB",
    name: "Browser perf",
    versionKey: "stress150k",
    baseText: LONG_MARKDOWN_150KB,
    patchSet: PATCH_SET_150KB,
  },
] as const;

export const scenarios = [
  {
    id: "scenario-1",
    label: "Scenario 1",
    name: "Create plan",
    versionKey: "empty",
    baseText: "",
    patchSet: PATCH_SET_1,
  },
  {
    id: "scenario-2",
    label: "Scenario 2",
    name: "Single edit",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_2,
  },
  {
    id: "scenario-3",
    label: "Scenario 3",
    name: "Multi patch",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_3,
  },
  {
    id: "scenario-4",
    label: "Scenario 4",
    name: "Block patch",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_4,
  },
  {
    id: "scenario-5",
    label: "Scenario 5",
    name: "Reduced motion",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_3,
  },
  {
    id: "scenario-6",
    label: "Scenario 6",
    name: "Pure deletion",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_6,
  },
  {
    id: "scenario-7",
    label: "Scenario 7",
    name: "Restore",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_3,
  },
  {
    id: "scenario-8",
    label: "Scenario 8",
    name: "Switch mid-flight",
    versionKey: "v1",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_3,
  },
  {
    id: "scenario-9",
    label: "Scenario 9",
    name: "Stream interrupted (version reset)",
    versionKey: "v3",
    baseText: BASE_STRATEGY_DOC,
    patchSet: PATCH_SET_2,
  },
] as const;
