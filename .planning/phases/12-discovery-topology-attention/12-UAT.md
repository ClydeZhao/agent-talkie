---
status: complete
phase: 12-discovery-topology-attention
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md]
started: 2026-04-22T15:26:00Z
updated: 2026-04-22T15:55:00Z
regressions_found: 2
regressions_fixed: 2
---

## Current Test

[testing complete]

## Tests

### 1. Search Toggle Button
expected: A "搜索" button appears in the transcript header area. Clicking it toggles the search panel open/closed.
result: pass
method: playwright-auto
evidence: Button ref "e1" (aria-label "Search transcript") visible in snapshot. Click toggled search panel visibility — panel open showed searchbox + filter dropdowns, click again hid them.

### 2. Search Panel Split Layout
expected: When search panel is open, it appears as a right-side column alongside the transcript in a flex split-pane layout (360px width). Both transcript and search panel are visible simultaneously.
result: pass
method: playwright-auto
evidence: Screenshot confirms search panel renders to the right of the transcript area with search input, filter dropdowns, and results area. The `.talkie-transcript-workspace` flex container correctly distributes space.

### 3. Search Input Field
expected: The search panel contains a full-text search input with "搜索…" placeholder. Typing triggers a 500ms debounced MiniSearch query.
result: pass
method: playwright-auto
evidence: Searchbox ref "e7" with placeholder "搜索…" present in snapshot. Debounce logic verified via unit tests in dashboard-store.test.ts.

### 4. Sender Filter Dropdown
expected: A "发件人" dropdown populated from roster members. Default is "（任何）" (any). Selecting a sender filters transcript to that sender only.
result: pass
method: playwright-auto
evidence: Combobox ref "e8" labeled "发件人" with value "（任何）" and roster-populated options. Filter logic verified via unit tests.

### 5. Kind Filter Dropdown
expected: A "类型" dropdown with options: 全部, control, conversation. Selecting a kind filters transcript to only show messages of that kind.
result: pass
method: playwright-auto
evidence: Combobox ref "e9" with options "全部 (value: all), control, conversation". Selected "control" → dropdown value changed correctly. Filter AND logic verified via unit tests (MiniSearch+kind AND & order).

### 6. Time Filter Presets
expected: A "时间" dropdown with options: 全部, 近 5 分钟, 近 30 分钟, 自訂时间窗. Selecting a preset filters transcript by time window.
result: pass
method: playwright-auto
evidence: Combobox ref "e10" with options "全部 (value: all), 近 5 分钟 (value: 5m), 近 30 分钟 (value: 30m), 自訂时间窗 (value: custom)". TranscriptTimeFilter types verified via unit tests.

### 7. Custom Time Range
expected: Selecting "自訂时间窗" reveals two datetime-local inputs (自訂起, 自訂迄) and an "应用时间窗" button. Inputs auto-fill with a default 1-hour range.
result: pass
method: playwright-auto
evidence: Screenshot shows datetime-local inputs "2026/04/22, 14:28" and "2026/04/22, 15:28" with "应用时间窗" button. Custom time filter chip appeared showing the range.

### 8. Filter Chips Display
expected: Active filters display as removable chips in the search panel header. Multiple chips stack when multiple filters are active (AND combination). Each chip shows filter type and value with a × removal button.
result: pass
method: playwright-auto
evidence: Screenshot with kind="control" and time="custom" showed two chips: "类型: control ×" and "时间: 自訂 4/22/2026, 2:28:00 PM – 4/22/2026, 3:28:00 PM ×". Both chips had accessible "Remove kind filter" / "Remove time filter" buttons.

### 9. Chip Removal
expected: Clicking × on a filter chip removes it. The corresponding dropdown resets to its default value. Removing all chips clears all filters.
result: pass
method: playwright-auto
evidence: Clicked "Remove kind filter" (ref e18) → kind chip disappeared, dropdown reset to "全部". Clicked "Remove time filter" (ref e15) → time chip disappeared, dropdown reset to "全部". No chips remain after full removal.

### 10. Roster Needs Attention — blockedReason visible (D-12)
expected: Blocked sessions in "Needs Attention" show the session name, blocked reason as visible text, and the red dot indicator. When no sessions are blocked, the section is hidden entirely.
result: pass (after regression fix)
method: unit-test
evidence: |
  REGRESSION FOUND: blockedReason was only set as a `title` attribute (tooltip), never rendered as visible DOM text.
  ROOT CAUSE: `talkie-roster-entry.ts` line 278 used `blockedReason` only in `title=${titleAttr}`, no visible element.
  FIX: Added `.blocked-reason` div that renders `r.blockedReason` as visible text when `progress==="blocked" && blockedReason.length > 0`.
  TESTS ADDED: talkie-roster-entry.test.ts — 3 tests:
    - renders blockedReason as visible DOM text when progress=blocked ✓
    - hides blockedReason element when blockedReason is empty ✓
    - hides blockedReason element when progress is not blocked ✓
  FALSE POSITIVE IN PRIOR UAT: Test 10 originally claimed "pass" based on Playwright screenshot of disconnected state (no roster members) and code review — this could not have detected the missing visible text because no blocked sessions existed in the test scenario.

### 11. Search Results Highlighted Matches (D-05)
expected: Search results in the search panel wrap matched query terms in `<mark class="search-hit">` elements. Sender name, envelope type, and payload preview text all highlight matching terms.
result: pass (after regression fix)
method: unit-test
evidence: |
  REGRESSION FOUND: Search results rendered as plain text with zero highlighting logic.
  ROOT CAUSE: `talkie-search-panel.ts` used `${this._payloadSummary(line)}` as plain text in the template — no `<mark>` elements, no highlight spans, no match extraction.
  FIX: Extracted `highlightText(text, query)` function into `search/highlight-text.ts`. Splits query into terms, builds regex, wraps matches in `<mark class="search-hit">`. Applied to sender, type, and payload in result rendering.
  CSS: Added `mark.search-hit { background: rgba(210, 153, 34, 0.35); color: inherit; border-radius: 2px; }`.
  TESTS ADDED: highlight-text.test.ts — 7 tests:
    - returns plain string when query is empty ✓
    - returns plain string when query is whitespace-only ✓
    - wraps single matching term in <mark> ✓
    - highlights multiple occurrences ✓
    - highlights multiple terms (OR per term) ✓
    - highlights case-insensitively while preserving original case ✓
    - produces no <mark> when no terms match ✓
    - escapes regex special characters ✓
  FALSE POSITIVE IN PRIOR UAT: Test 12 originally claimed "pass" for "Visible Lines Filter Pipeline" via unit tests — but that only tested the data layer (getVisibleTranscriptLines), not the UI rendering. The search panel's complete lack of highlight rendering was not caught.

### 12. MiniSearch Full-Text Search
expected: MiniSearch indexes transcript lines by sender displayName, envelope type, and payload preview. Search queries return matching lines with correct AND intersection with active filters.
result: pass
method: unit-test
evidence: dashboard-store.test.ts: kind filter test, space-switch-clears-index test, MiniSearch+kind AND & order test — all passing.

### 13. Visible Lines Filter Pipeline
expected: getVisibleTranscriptLines() applies AND combination of search query, sender filter, kind filter, and time filter. The virtualizer binds to this filtered list. Pin-to-bottom and new-message counting use visible line count.
result: pass
method: unit-test
evidence: dashboard-store.test.ts covers lineMatchesTranscriptFilters and getVisibleTranscriptLines. TalkieTranscript._onStoreNotify uses visible line count for delta calculation. All tests pass.

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0
regressions_found: 2
regressions_fixed: 2

## False Positives in Prior UAT Round

Two tests in the initial UAT (commit c7802c1) were false positives:

1. **Test 10 (Roster Needs Attention)** — Claimed "pass" based on Playwright screenshot of a disconnected dashboard with no roster members. The test verified the *section hiding* behavior (D-13) but could not detect that `blockedReason` was only in a `title` tooltip, not visible DOM text (D-12 violation).

2. **Test 12 (Visible Lines Filter Pipeline)** — Claimed "pass" via unit tests on `getVisibleTranscriptLines()`. This only verified the data layer; the UI rendering in `talkie-search-panel.ts` was never inspected for the presence of `<mark>` highlight elements (D-05 violation).

**Lesson:** UAT against an empty/disconnected state cannot catch rendering omissions that only manifest with real data. Future UAT should inject mock data before visual verification.

## Gaps

[none — both regressions fixed and verified]
