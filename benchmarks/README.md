# Screenshot Threshold Benchmark

This benchmark measures the performance impact of the screenshot threshold optimization that reduces `pixelRatio` for complex DOM pages.

## Prerequisites

- Node.js 20+
- Dependencies installed: `npm install`
- Widget built: `npm run build:widget`

## Running the Benchmark

```bash
npm run benchmark:screenshot
```

This runs Playwright tests against the local `wrangler dev` server (localhost:8787) and measures screenshot capture time across DOM sizes ranging from 1,000 to 15,000 nodes.

## Output Format

Results are displayed as a markdown table in the console:

```
| DOM Nodes | pixelRatio | Time (ms) |
|-----------|------------|-----------|
| 1000      | 2          | 245       |
| 3000      | 2          | 892       |
| 3001      | 1          | 456       |
| ...       | ...        | ...       |
```

Results are also saved to `benchmarks/results/latest.json` for programmatic analysis:

```json
{
  "timestamp": "2026-04-09T10:30:00Z",
  "results": [
    { "domNodeCount": 1000, "pixelRatio": 2, "timeMs": 245 },
    { "domNodeCount": 3000, "pixelRatio": 2, "timeMs": 892 },
    { "domNodeCount": 3001, "pixelRatio": 1, "timeMs": 456 }
  ]
}
```

## Sharing Results

When reporting benchmark results (e.g., in GitHub issues or pull requests):

1. Run the benchmark: `npm run benchmark:screenshot`
2. Copy the markdown table from the console output
3. Attach or reference the JSON results file if detailed analysis is needed

Include your environment details (Node version, OS, machine specs) for context.

## What It Measures

- **pixelRatio reduction**: Screenshots of pages with >3,000 DOM nodes use `pixelRatio: 1` instead of `pixelRatio: 2`
- **Time impact**: Measures time from screenshot initiation to completion (in milliseconds)
- **DOM size range**: Tests from 1,000 to 15,000 DOM nodes to observe the threshold effect
- **Purpose**: Validates that the optimization significantly improves performance without visible quality loss on complex pages
