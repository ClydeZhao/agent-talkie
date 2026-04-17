---
phase: 08-dashboard-distribution-cli-entry
reviewed: 2026-04-17T12:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - packages/relay/src/server.ts
  - packages/relay/src/server.test.ts
  - packages/relay/package.json
  - packages/dashboard/vite.app.config.ts
  - packages/dashboard/package.json
  - packages/dashboard/src/demo/main.ts
  - package.json
  - .gitignore
  - packages/cli/src/cli.ts
  - packages/cli/src/cli.test.ts
  - packages/cli/package.json
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-17  
**Depth:** standard  
**Files reviewed:** 11 (lockfile `package-lock.json` omitted from line-level review)  
**Status:** issues_found  

## Summary

Phase 08 adds relay-hosted `/dashboard` static assets via **sirv**, a separate Vite app build to `dist-app/` with `base: '/dashboard/'`, production same-origin WebSocket URLs in the dashboard demo, and a **`talkie dashboard`** CLI that ensures the relay and optionally opens a browser.

Overall the HTTP pipeline ordering (WebSocket upgrade bypass, conditional health, `/dashboard*`, plain 404), `req.url` restoration around sirv, and CLI `--no-open` / `openUrl` naming are sound. No critical security issues (injection, secret leakage, or unsafe URL construction from untrusted input) were found in the reviewed scope.

Remaining concerns are mainly **defensive error handling** on the relay static path if the dashboard build is missing or sirv throws, and **observability** where the demo swallows connection errors without logging.

## Warnings

### WR-01: Unhandled errors on the `/dashboard` sirv path

**File:** `packages/relay/src/server.ts` (approx. 253–268)

**Issue:** The dashboard branch delegates to `assets(req, res, next)` without a `try/catch`. If `sirv` (or filesystem access to `resolveDashboardAppDir()`) throws synchronously, Node’s default behavior can surface as an **uncaught exception** on the `'request'` listener, which may **crash the process** or yield **unhandled `error` events** on `IncomingMessage`/`ServerResponse` depending on Node version and error site. Missing `dist-app/` after a bad install or partial publish is the most plausible trigger.

**Fix:** Wrap the dashboard branch body in `try/catch`, call `restoreUrl()` in `catch`, and respond with `500` (or `503`) plus a short plain body; optionally `console.error` with a stable prefix for operators.

```typescript
if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
  const originalUrl = req.url;
  const under = url.pathname.slice("/dashboard".length) || "/";
  req.url = under + url.search;
  const restoreUrl = () => {
    req.url = originalUrl;
  };
  res.once("finish", restoreUrl);
  res.once("close", restoreUrl);
  try {
    const assets = getDashboardSirv();
    assets(req, res, () => {
      restoreUrl();
      res.statusCode = 404;
      res.end();
    });
  } catch (err) {
    restoreUrl();
    console.error("dashboard static handler failed", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  }
  return;
}
```

### WR-02: `talkie dashboard` does not surface `open` failures distinctly

**File:** `packages/cli/src/cli.ts` (approx. 116–126)

**Issue:** When `opts.open !== false`, `await openUrl(url)` may reject (headless CI misconfiguration, missing `DISPLAY`, OS-level blocks). The failure is handled by `handleError`, which only logs the error and sets `exitCode = 1`. That is acceptable functionally, but **stdout already printed the URL**, so operators may misread a non-zero exit as relay failure rather than browser launch failure.

**Fix (optional hardening):** Catch `openUrl` separately, print a one-line stderr hint (e.g. “could not open browser; URL was printed above”), then `process.exitCode = 1`, without rethrowing—so `ensureRelayRunning` success is not conflated with `open` failure.

## Info

### IN-01: Empty `catch` in dashboard demo hides failure modes

**File:** `packages/dashboard/src/demo/main.ts` (approx. 52–71)

**Issue:** The outer `try/catch` sets `shell.healthState = "disconnected"` for any error. That keeps the UI stable but **drops the underlying reason** (network, protocol, registration), which slows debugging when the SPA is served from relay in production.

**Fix:** In development, `console.error(err)`; in production, optionally report a minimal `console.error` with a redacted message or integrate with existing bridge diagnostics if present.

### IN-02: Production WebSocket URL with non-HTTP(S) page origins

**File:** `packages/dashboard/src/demo/main.ts` (approx. 14–16)

**Issue:** When `import.meta.env.DEV` is false, `wsUrl` uses `location.host`. For unusual origins (e.g. `file:`), `location.host` is empty, producing a malformed WebSocket URL. The intended deployment is same-origin HTTP(S) behind relay, so this is low risk.

**Fix:** If you want a hard guard, detect `!location.host` and show a shell error instead of attempting `bridge.connect`.

---

_Configuration-only checks:_ `packages/dashboard/vite.app.config.ts` (dual Vite pipeline, `base`, `outDir`) and root `package.json` build ordering are consistent with the phase intent. `.gitignore` entry for `dist-app/` matches the dual-build layout. `packages/relay/package.json` `pretest` building the dashboard is appropriate so tests see `dist-app`.

---

_Reviewed: 2026-04-17_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
