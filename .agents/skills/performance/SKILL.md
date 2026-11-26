---
name: performance
description: Entry point for any OneTool performance question, measurement, or symptom. Routes to Chrome DevTools MCP (traces, Core Web Vitals, network, memory), vercel-react-best-practices (React/Next code patterns), and convex-advisor / convex-optimize (queries, subscriptions, OCC). Use whenever the conversation mentions performance, perf, slow, sluggish, lag, jank, fps, LCP, INP, CLS, TTFB, web vitals, Lighthouse, page speed, load time, bundle size, re-renders, long tasks, memory leaks, heap, slow Convex queries, read amplification, or OCC conflicts.
---

# OneTool performance

Measure first, then fix. Every claim of "faster" needs a before/after number from the same setup.

## 1. Pick the lane

Most problems touch one lane. A slow workspace page can touch all three. In that case, start with a browser trace, because it shows whether the time goes to network, Convex, or React rendering.

| Symptom | Lane | Load |
|---|---|---|
| Slow first load, hero/content late, LCP/TTFB/FCP | Browser | `chrome-devtools-mcp:debug-optimize-lcp` |
| Clicks or typing lag, INP, jank, layout shift, dropped frames, animation cost | Browser | `chrome-devtools-mcp:chrome-devtools`, then a trace (below) |
| Memory grows over time, tab gets heavy, WebGL/canvas not released | Browser | `chrome-devtools-mcp:memory-leak-debugging` |
| Errors or failures while measuring (console, failed requests) | Browser | `chrome-devtools-mcp:chrome-devtools` (`list_console_messages`, `list_network_requests`) |
| The tooling itself won't launch or connect | Browser | `chrome-devtools-mcp:troubleshooting` |
| Waterfalls, client bundle size, hydration, over-rendering, missing memo/Suspense/dynamic import | React/Next code | `vercel-react-best-practices` |
| Slow query or mutation, high bytes/docs read, too many subscriptions, OCC conflicts, function limits | Convex | `convex-advisor` (deployment insights) and `convex-optimize` (code audit), plus the convex MCP `insights` and `logs` tools |

The trace decides the lane: long scripting tasks in React code go to the React lane, and long waits on Convex websocket/HTTP responses go to the Convex lane.

## 2. Measure in the browser (Chrome DevTools MCP)

- **Production build only.** Run `pnpm --filter @onetool/web build && pnpm --filter @onetool/web start` and measure that. `next dev --turbopack` is unminified and much slower, so its numbers mean nothing. Use `https://onetool.biz` when you're checking what's live.
- **Throttle like our users.** Owners are on mid-range phones in the field, so default to `emulate` with `cpuThrottlingRate: 4` and `networkConditions: "Fast 3G"`, and say so when reporting. Run unthrottled only for comparison.
- **Traces.** Use `performance_start_trace` with `reload: true, autoStop: true` for load. For an interaction, start the trace without reload, do the interaction (`click`/`fill`/`press_key` with snapshot uids), then call `performance_stop_trace`. Drill in with `performance_analyze_insight`, using the insight names the trace output lists.
- **Large output** (traces, screenshots, heap snapshots) goes to a file via `filePath`. Never read raw `.heapsnapshot` files. Call `close_heapsnapshot` when you're done.
- **Signed-in pages.** The MCP Chrome uses a persistent profile (`~/.cache/chrome-devtools-mcp/chrome-profile`). If a workspace route lands on the Clerk sign-in page, stop and ask Patrick to sign in once in that window.
- **Config** is in `~/.config/cd4a/config.json` (memory tools on, usage stats off). Don't add a repo `cd4a.config.json`, because the server reads only the first config it finds, so a repo file would replace the global one.
- **Visual judgment stays with Patrick.** Measuring is fine. Don't critique how the page looks.

## 3. Field data

- **Workspace:** PostHog captures web vitals on app pages (`capture_performance: !landing` in `apps/web/src/providers/PostHogProvider.tsx`). Query `$web_vitals` events in PostHog for real-user LCP/INP/CLS by route before and after a fix.
- **Landing:** PostHog doesn't capture performance there. Traces of `onetool.biz` include CrUX field data when Google has it. Otherwise lab traces are the only source.

## 4. Fix and report

- Fix in the lane's skill, one bottleneck at a time.
- Re-measure with the same build, throttling and route.
- Report the metric, before → after, the setup (build, throttle, route), and what changed.
- If the fix touches the landing's motion (WebGL matrix, canvases, scroll timelines), keep the reduced-motion and "Pause animations" paths working.
