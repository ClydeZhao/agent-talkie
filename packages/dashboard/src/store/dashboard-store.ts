import {
  metadataPatchPayloadSchema,
  safeParseEnvelope,
  type Envelope,
  type MetadataPatchPayload,
} from "@agent-talkie/protocol";

import type { TranscriptCatchupRow } from "../bridge/browser-session-bridge.js";
import type {
  CollaborationMetadataWire,
  ProtocolErrorWire,
} from "../bridge/wire-schemas.js";
import { getRelayErrorCopy } from "../errors/relay-error-copy.js";

/** Coalesces rapid `metadata.patch` UI updates (OVER-04 / D-17). */
export const METADATA_UI_DEBOUNCE_MS = 200;

/** JSON shape from GET /__agent-talkie/v1/oversight/space-summary (camelCase). */
export type OversightMemberSnapshot = {
  sessionId: string;
  displayName: string;
  isHuman: boolean;
  role: string;
  focus: string;
  progress: string;
  blockedReason: string | null;
  runtime: string;
  workspaceLabel: string;
};

export type OversightSpaceSummary = {
  spaceId: string;
  slug: string;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
  memberCount: number;
  members: OversightMemberSnapshot[];
};

/** Mirrors `GET /oversight/spaces` rows (inline to avoid dashboard → persistence dependency). */
export type SpaceListRow = {
  slug: string;
  memberCount: number;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
};

export type RosterRow = {
  sessionId: string;
  displayName: string;
  isHuman: boolean;
  runtime: string;
  workspaceLabel: string;
  orchestrator: boolean;
  owner: boolean;
  role: string;
  focus: string;
  progress: string;
  blockedReason: string;
};

export type TranscriptLine = {
  dedupeKey: string;
  receivedAtMs: number;
  envelope: Envelope;
};

export type DashboardProtocolErrorItem = {
  id: string;
  code: string;
  title: string;
  hint: string;
  sticky: boolean;
  receivedAtMs: number;
  onRetry?: (() => void) | undefined;
};

export class DashboardStore {
  readonly roster = new Map<string, RosterRow>();
  activeSpaceId: string | null = null;
  /** Slug for the active space (URL / space-summary); default join uses `"default"`. */
  currentSpaceSlug = "default";
  /** Cached list from `GET /oversight/spaces` for the space picker. */
  spacesList: SpaceListRow[] = [];
  /** Set when relay notifies this tab that the current space was destroyed (WS will drop). */
  spaceDestroyedSlug: string | null = null;
  /** `null` -> default human->orchestrator (omit `to`); otherwise direct `to` session. */
  sendTargetSessionId: string | null = null;
  selfSessionId: string | null = null;
  transcriptLines: TranscriptLine[] = [];
  errors: DashboardProtocolErrorItem[] = [];
  private readonly listeners = new Set<() => void>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private transcriptDedupe = new Set<string>();
  private metadataUiDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly errorDismissTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  addListener(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  setActiveSpaceId(id: string): void {
    if (this.activeSpaceId === id) {
      return;
    }
    this.transcriptDedupe.clear();
    this.transcriptLines = [];
    this.activeSpaceId = id;
    this.sendTargetSessionId = null;
    this.spaceDestroyedSlug = null;
    this.notify();
  }

  setSpacesList(rows: SpaceListRow[]): void {
    this.spacesList = rows;
    this.notify();
  }

  setCurrentSpaceSlug(slug: string): void {
    if (this.currentSpaceSlug === slug) {
      return;
    }
    this.currentSpaceSlug = slug;
    this.notify();
  }

  noteSpaceDestroyed(slug: string): void {
    this.spaceDestroyedSlug = slug;
    this.notify();
  }

  setSendTargetOrchestratorDefault(): void {
    if (this.sendTargetSessionId === null) {
      return;
    }
    this.sendTargetSessionId = null;
    this.notify();
  }

  setSendTargetSession(sessionId: string): void {
    if (this.sendTargetSessionId === sessionId) {
      return;
    }
    this.sendTargetSessionId = sessionId;
    this.notify();
  }

  toggleSendTargetSession(sessionId: string): void {
    if (this.sendTargetSessionId === sessionId) {
      this.sendTargetSessionId = null;
    } else {
      this.sendTargetSessionId = sessionId;
    }
    this.notify();
  }

  /** True when the dashboard viewer (self) is the space owner. */
  get selfIsOwner(): boolean {
    if (this.selfSessionId === null) return false;
    const row = this.roster.get(this.selfSessionId);
    return row !== undefined && row.owner === true;
  }

  /** Default orchestrator path blocked when no roster row is marked orchestrator (D-05). */
  get isDefaultOrchestratorSendBlocked(): boolean {
    if (this.sendTargetSessionId !== null) {
      return false;
    }
    for (const row of this.roster.values()) {
      if (row.orchestrator) {
        return false;
      }
    }
    return true;
  }

  pushProtocolError(
    wire: ProtocolErrorWire,
    options?: { onRetry?: () => void },
  ): void {
    const copy = getRelayErrorCopy(wire.error);
    const id = crypto.randomUUID();
    const item: DashboardProtocolErrorItem = {
      id,
      code: wire.error,
      title: copy.title,
      hint: copy.hint,
      sticky: copy.sticky,
      receivedAtMs: Date.now(),
      ...(options?.onRetry !== undefined ? { onRetry: options.onRetry } : {}),
    };
    this.errors = [item, ...this.errors].slice(0, 3);
    const kept = new Set(this.errors.map((e) => e.id));
    for (const [eid, handle] of this.errorDismissTimers) {
      if (!kept.has(eid)) {
        clearTimeout(handle);
        this.errorDismissTimers.delete(eid);
      }
    }
    if (!copy.sticky) {
      const t = window.setTimeout(() => {
        this.errorDismissTimers.delete(id);
        this.dismissError(id);
      }, 8000);
      this.errorDismissTimers.set(id, t);
    }
    this.notify();
  }

  dismissError(id: string): void {
    if (!this.errors.some((e) => e.id === id)) {
      return;
    }
    this.errors = this.errors.filter((e) => e.id !== id);
    const t = this.errorDismissTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.errorDismissTimers.delete(id);
    }
    this.notify();
  }

  appendTranscriptCatchup(row: TranscriptCatchupRow): void {
    if (row.spaceId !== this.activeSpaceId) {
      return;
    }
    const dedupeKey = `${row.spaceId}:${row.relaySeq}`;
    if (this.transcriptDedupe.has(dedupeKey)) {
      return;
    }
    const parsed = safeParseEnvelope(row.envelope);
    if (!parsed.success) {
      return;
    }
    this.transcriptDedupe.add(dedupeKey);
    const receivedAtMs = Date.now();
    this.transcriptLines = [
      ...this.transcriptLines,
      { dedupeKey, receivedAtMs, envelope: parsed.data },
    ];
    this.notify();
  }

  applyMetadataPatchFromEnvelope(envelope: Envelope): void {
    if (envelope.type !== "metadata.patch") {
      return;
    }
    const parsed = metadataPatchPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      return;
    }
    const data = parsed.data;
    const targetSessionId =
      data.namespace === "profile" && data.targetSessionId !== undefined
        ? data.targetSessionId
        : envelope.sessionId;
    if (targetSessionId === undefined || targetSessionId === "") {
      return;
    }
    this.mergeMetadataPatchIntoRoster(envelope.spaceId, targetSessionId, data);
  }

  /**
   * Applies relay `collaboration.metadata` fan-out (live peer updates are not envelopes).
   */
  applyCollaborationMetadataWire(msg: CollaborationMetadataWire): void {
    const parsed = metadataPatchPayloadSchema.safeParse({
      namespace: msg.namespace,
      patch: msg.patch,
    });
    if (!parsed.success) {
      return;
    }
    this.mergeMetadataPatchIntoRoster(msg.spaceId, msg.sessionId, parsed.data);
  }

  private mergeMetadataPatchIntoRoster(
    spaceId: string | undefined,
    targetSessionId: string,
    data: MetadataPatchPayload,
  ): void {
    if (spaceId !== undefined && spaceId !== this.activeSpaceId) {
      return;
    }
    let row = this.roster.get(targetSessionId);
    if (!row) {
      row = {
        sessionId: targetSessionId,
        displayName: `${targetSessionId.slice(0, 8)}...`,
        isHuman: false,
        runtime: "",
        workspaceLabel: "",
        orchestrator: false,
        owner: false,
        role: "",
        focus: "",
        progress: "idle",
        blockedReason: "",
      };
    }
    if (data.namespace === "profile") {
      const p = data.patch;
      row = {
        ...row,
        ...(p.role !== undefined ? { role: p.role } : {}),
        ...(p.focus !== undefined ? { focus: p.focus } : {}),
      };
    } else {
      const p = data.patch;
      row = {
        ...row,
        ...(p.progress !== undefined ? { progress: p.progress } : {}),
        ...(p.blockedReason !== undefined
          ? { blockedReason: p.blockedReason }
          : {}),
      };
    }
    this.roster.set(targetSessionId, row);
    this.scheduleMetadataUiNotify();
  }

  private scheduleMetadataUiNotify(): void {
    if (this.metadataUiDebounceTimer !== null) {
      clearTimeout(this.metadataUiDebounceTimer);
    }
    this.metadataUiDebounceTimer = window.setTimeout(() => {
      this.metadataUiDebounceTimer = null;
      this.notify();
    }, METADATA_UI_DEBOUNCE_MS);
  }

  appendTranscriptEnvelope(env: Envelope): void {
    if (env.spaceId !== undefined && env.spaceId !== this.activeSpaceId) {
      return;
    }
    const dedupeKey = `${env.spaceId ?? "none"}:${env.id}`;
    if (this.transcriptDedupe.has(dedupeKey)) {
      return;
    }
    this.transcriptDedupe.add(dedupeKey);
    const receivedAtMs = Date.now();
    this.transcriptLines = [
      ...this.transcriptLines,
      { dedupeKey, receivedAtMs, envelope: env },
    ];
    this.notify();
  }

  hydrateFromSpaceSummary(
    summary: OversightSpaceSummary,
    selfSessionId: string,
  ): void {
    this.selfSessionId = selfSessionId;
    this.currentSpaceSlug = summary.slug;
    if (this.metadataUiDebounceTimer !== null) {
      clearTimeout(this.metadataUiDebounceTimer);
      this.metadataUiDebounceTimer = null;
    }
    this.roster.clear();
    const orch = summary.orchestratorSessionId;
    const owner = summary.ownerSessionId;
    for (const m of summary.members) {
      const sid = m.sessionId;
      this.roster.set(sid, {
        sessionId: sid,
        displayName: m.displayName,
        isHuman: m.isHuman,
        runtime: m.runtime,
        workspaceLabel: m.workspaceLabel,
        orchestrator: orch !== null && sid === orch,
        owner: owner !== null && sid === owner,
        role: m.role,
        focus: m.focus,
        progress: m.progress,
        blockedReason: m.blockedReason ?? "",
      });
    }
    this.notify();
  }

  /**
   * Updates `RosterRow.orchestrator` from relay WS fan-out / acks (CTRL-02).
   * Ignores other spaces; only mutates rows already present in `roster`.
   */
  syncOrchestratorFromRelay(
    spaceId: string,
    orchestratorSessionId: string | null,
  ): void {
    if (spaceId !== this.activeSpaceId) {
      return;
    }
    let changed = false;
    for (const [id, row] of this.roster) {
      const next =
        orchestratorSessionId !== null && id === orchestratorSessionId;
      if (row.orchestrator !== next) {
        this.roster.set(id, { ...row, orchestrator: next });
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  scheduleSnapshotRefresh(
    fetchSummary: () => Promise<void>,
    intervalMs: number,
  ): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshTimer = window.setInterval(() => {
      void fetchSummary();
    }, intervalMs);
  }
}
