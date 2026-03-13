# Lumino Plugin Diagnostics Guide

## Why this exists
Multiple testers will run Lumino on different sites. Most bug reports will be incomplete unless we collect structured diagnostics automatically.

The goal of this report is:
1. Reconstruct what happened during a run.
2. Reproduce bugs with minimal back-and-forth.
3. Give engineers enough technical detail to isolate root cause.

## Current capture flow
1. Tester injects Lumino via the Chrome extension popup.
2. SDK starts with `debug: true` (forced by extension inject path).
3. SDK captures in-memory debug events.
4. Tester downloads JSON report using:
   - `Debug Log` button in the SDK UI, or
   - `Ctrl+Shift+L`.

## What is covered today

### Session/environment context
- Session id (`dbg-*`).
- Export timestamp.
- Current page URL.
- User agent.
- Viewport size.

### SDK lifecycle
- Bootstrap start and complete.
- Auth success metadata (`userId`, `role`, token length).
- Walkthrough loading result and list summary.

### Playback behavior
- Walkthrough start and step index.
- Step selector data (primary/fallbacks/text/expected URL).
- Element found/waiting/timeout auto-skip.
- Action-gating wait heartbeats every 5 seconds.
- Step render target metadata (tag/id/class/text/rect).

### API activity (SDK client)
- Method + route attempts (`GET/POST/PUT/DELETE`).
- Success status.
- Failure status + endpoint URL + parsed error payload when available.

### Cross-page continuity (extension behavior)
- Recording state persistence across navigations.
- Playback state persistence and resume attempt across navigations.

## What is not covered yet (gaps)

### P0: Reproduction-critical gaps
- Extension logs are not included in the JSON report.
  - Background/popup logs for fetch, reinject, CSP fallback, and resume attempts are only in extension console.
- Global runtime failures are not captured.
  - `window.onerror`, `unhandledrejection`, and host-page console errors are not persisted.
- Run metadata is missing.
  - No tester id, test case id, site/app label, expected behavior, or "what user clicked before failure".
- Entry buffer is capped at 500.
  - Long runs can evict early events needed to reconstruct the bug timeline.

### P1: High-value debugging gaps
- No request timing/latency in API diagnostics.
- No network correlation id per run/request.
- No SDK build fingerprint at top-level report (commit/hash/build channel).
- No route history trail (previous URLs) during the run.
- No DOM snapshot at failure point (only selector metadata).

### P2: Nice-to-have gaps
- No automatic screenshot/video attachment trigger on error.
- No direct one-click upload pipeline to backend issue storage.
- No automatic redaction policy enforcement report (PII risk from text snippets).

## Can engineers recreate bugs from current reports?
Partially.

### Usually reproducible when
- Bug is in walkthrough playback logic, selector matching, or API response handling.
- Failure happens within the last ~500 logged events.

### Often not reproducible when
- Bug depends on extension reinjection/CSP behavior.
- Bug is caused by host-page JS/runtime failures outside SDK instrumentation.
- Bug requires exact tester intent/context that is not in report metadata.

## Minimum tester package to request
For each bug, collect all of the following:
1. Exported JSON debug report.
2. Site URL and page where issue started.
3. Short expected vs actual behavior.
4. Approximate timestamp and timezone.
5. Extension version (`Lumino Demo Injector` version).
6. If possible, extension background console logs and a screenshot.

## Recommended next implementation steps
1. Merge extension logs into the same downloadable report.
2. Capture global JS errors (`window.onerror`, `unhandledrejection`) into `DebugLogger`.
3. Add run metadata form in plugin popup (`tester`, `ticket`, `site`, `scenario`) and include in report header.
4. Raise `MAX_ENTRIES` or switch to chunked persistence with rolling files.
5. Add request timing and a per-request correlation id.
6. Add route-change timeline and optional screenshot-on-error.

## Engineer triage checklist
1. Confirm report includes init/auth/walkthrough load for the failing run.
2. Find first `error` entry and nearest preceding `warn`.
3. Verify expected URL vs current URL around failure.
4. Validate selector strategy from the failing step.
5. Match API failures to server logs using timestamp and route.
6. If missing context, request extension logs and rerun with scenario id.
