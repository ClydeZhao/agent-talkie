# Debug: phase11-destroy-current-space

**Status:** RESOLVED
**Phase:** 11-space-membership-management
**Date:** 2026-04-21

## Root Cause (original — UI-only fix)

After `space.destroy`, the relay sends `space.destroyed` only to the sender (owner),
then closes all member WebSocket connections. The owner's bridge `handleTransportDrop`
fires with auto-reconnect enabled, recreating the destroyed slug via `joinSpace`.

First fix (session 1): added `bridge.close()` + `store.stopSnapshotRefresh()` in
the `onSpaceDestroyedWire` handler on `main.ts`, plus Lit reactivity fix for the
banner. This fixed the single-member case but NOT multi-member.

## Root Cause (session 2 — multi-member broadcast)

When the space has multiple members (e.g., two human browser tabs), only the
owner receives `space.destroyed`. Non-owner members have their WebSocket closed
by the relay without receiving any wire message. Their bridges auto-reconnect and
call `joinSpace({ slug: _lastJoinedSlug })`, which implicitly recreates the
destroyed space.

Session 2 fix: broadcast `space.destroyed` to all registry entries. Fixed the
case where members each have distinct sessions. But did NOT fix the case where
two tabs share the same session (via sessionStorage), because `registry.bind`
evicts stale sockets and `registry.get(sid)` returns only the latest socket.

## Root Cause (session 3 — multi-tab session thrashing + no server-side guard)

Two tabs in the same browser context share sessionStorage. When Tab C resumes
Tab B's session, `SessionRegistry.bind()` closes Tab B's socket, triggering
auto-reconnect. This creates a reconnect loop (session thrashing). During
`space.destroy`, the broadcast only reaches `registry.get(sid)` (the latest
socket for each session), NOT the destroyer's actual socket (`ctx.ws`) when it
was evicted from the registry. The destroyer auto-reconnects and recreates the
space.

More fundamentally: even with perfect broadcast, any client that was disconnected
at the moment of the broadcast (e.g., in a reconnect backoff) would miss the
`space.destroyed` wire message and later recreate the space via `joinSpace`.

## Fix (final — session 3)

1. **Server: destroy tombstone** (`server.ts`): After `handleSpaceDestroy`
   deletes the space row, the slug is added to an in-memory
   `destroyedSlugs: Map<string, number>` with a timestamp. Before
   `handleSpaceJoin` runs, the slug is checked against this tombstone. If
   destroyed within `DESTROY_TOMBSTONE_TTL_MS` (60s), the server rejects
   the join with `protocol.error: space_recently_destroyed`. This prevents
   ANY client from recreating the slug regardless of broadcast delivery.

2. **Server: explicit ctx.ws delivery** (`server.ts`): `space.destroyed` is
   now sent to both `registry.get(sid)` for all member sessions AND directly
   to `ctx.ws` (the destroyer's actual socket). This covers the shared-session
   case where `ctx.ws` is not the current registry entry.

3. **Client: handle tombstone rejection** (`browser-session-bridge.ts`):
   `internalReconnect` detects `space_recently_destroyed` in the `joinSpace`
   rejection. When detected, clears `_lastJoinedSlug`, calls `bridge.close()`,
   and emits `spaceDestroyedListeners` so the UI shows the banner.

4. Prior fixes remain in place:
   - `main.ts`: `bridge.close()` + `store.stopSnapshotRefresh()` on
     `space.destroyed` for the current slug.
   - `DashboardStore`: `stopSnapshotRefresh()` method.
   - `talkie-space-picker.ts`: `@property() destroyedSlug` for Lit reactivity.

## Verification

- Unit tests: 132/132 pass (all 38 test files)
- Relay: 16 tests including broadcast test and new tombstone test
- Playwright browser verification (13/13 pass):
  1. MGMT-01 roster visible (3 entries: BotA, BotB, Human) ✓
  2. MGMT-03 create phase11-room (2 members) ✓
  3. MGMT-03 slug absent from /spaces immediately ✓
  4. MGMT-03 summary returns 404 immediately ✓
  5. TOMBSTONE: new tab tries to rejoin destroyed slug → NOT recreated ✓
  6. TOMBSTONE: summary still 404 after rejoin attempt ✓
  7. MGMT-03 no re-creation after 10s ✓
  8. MGMT-03 summary still 404 after 10s ✓
  9. Owner tab: Disconnected ✓
  10. Peer tab: Disconnected ✓
  11. Owner banner: "Space was destroyed" ✓
  12. Peer banner: "Space was destroyed" ✓
