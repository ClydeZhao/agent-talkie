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
import {
  buildTranscriptSearchDoc,
  createTranscriptMiniSearch,
} from "../search/transcript-search-index.js";

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
  inboxMode?: "live" | "pull";
  presenceState?: "online" | "offline" | "stale";
  lastSeenAtMs?: number | null;
};

export type OversightSpaceSummary = {
  spaceId: string;
  slug: string;
  label: string;
  status: string;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
  memberCount: number;
  members: OversightMemberSnapshot[];
};

/** Mirrors `GET /oversight/spaces` rows (inline to avoid dashboard → persistence dependency). */
export type SpaceListRow = {
  slug: string;
  label: string;
  status: "active" | "idle";
  memberCount: number;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
  actionability?: {
    state: "ready" | "manual-pull" | "blocked";
    reason: string;
    label: string;
    detail: string;
  };
};

export type RosterRow = {
  sessionId: string;
  displayName: string;
  isHuman: boolean;
  runtime: string;
  workspaceLabel: string;
  inboxMode: "live" | "pull";
  orchestrator: boolean;
  owner: boolean;
  role: string;
  focus: string;
  progress: string;
  blockedReason: string;
  presenceState: "online" | "offline" | "stale";
  lastSeenAtMs: number | null;
};

export type ParticipantAvailabilityKind =
  | "available"
  | "blocked"
  | "manual-pull"
  | "stale"
  | "offline"
  | "unavailable";

export type ParticipantAvailability = {
  kind: ParticipantAvailabilityKind;
  label: string;
  detail: string;
  canReceiveLive: boolean;
  canReceivePrivateIntervention: boolean;
};

export type ParticipantProjection = RosterRow & {
  availability: ParticipantAvailability;
};

export type DiscussionTargetStatus =
  | "ready"
  | "missing-orchestrator"
  | "target-missing"
  | "target-manual-pull"
  | "target-stale"
  | "target-offline"
  | "target-unavailable";

export type DiscussionTargetProjection = {
  mode: "orchestrator" | "private";
  status: DiscussionTargetStatus;
  targetSessionId: string | null;
  targetLabel: string;
  canSend: boolean;
  reason: string;
};

export type DashboardConsoleProjection = {
  space: {
    id: string | null;
    slug: string;
    label: string;
    status: "active" | "destroyed" | "archived" | "unknown";
  };
  orchestrator: ParticipantProjection | null;
  participants: ParticipantProjection[];
  participantsById: Map<string, ParticipantProjection>;
  defaultDiscussion: DiscussionTargetProjection;
  privateIntervention: DiscussionTargetProjection | null;
};

const GENERIC_HUMAN_DISPLAY_NAME_RE = /^human(?:[-_ ]?\d+)?$/i;
const GENERIC_DASHBOARD_DISPLAY_NAME_RE = /^dashboard(?:[-_ ]?\d+)?$/i;
function isPullMode(inboxMode: string): boolean {
  return inboxMode === "pull";
}

function conversationDeliveryTarget(envelope: Envelope): string | undefined {
  if (envelope.kind !== "conversation") {
    return undefined;
  }
  return envelope.to ?? envelope.effectiveTo;
}

function displayNameForRosterMember(
  member: OversightMemberSnapshot,
  selfSessionId: string,
): string {
  if (member.sessionId === selfSessionId) {
    return "You";
  }
  const rawName = member.displayName.trim();
  const runtime = member.runtime.trim().toLowerCase();
  if (
    member.isHuman &&
    runtime === "browser" &&
    (rawName === "" ||
      GENERIC_HUMAN_DISPLAY_NAME_RE.test(rawName) ||
      GENERIC_DASHBOARD_DISPLAY_NAME_RE.test(rawName))
  ) {
    return "Dashboard";
  }
  if (
    member.isHuman &&
    (rawName === "" || GENERIC_HUMAN_DISPLAY_NAME_RE.test(rawName))
  ) {
    return "Human participant";
  }
  return rawName || `${member.sessionId.slice(0, 8)}...`;
}

export type RelayStatusSnapshot = {
  running: boolean;
  activeConnectionCount: number;
  stopSupported: boolean;
  restartSupported: boolean;
};

export type TranscriptLine = {
  dedupeKey: string;
  receivedAtMs: number;
  envelope: Envelope;
};

export type TranscriptTimeFilter =
  | { kind: "all" }
  | { kind: "preset"; preset: "5m" | "30m" }
  | { kind: "custom"; startMs: number; endMs: number };

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
  currentSpaceLabel = "default";
  /** Cached list from `GET /oversight/spaces` for the space picker. */
  spacesList: SpaceListRow[] = [];
  /** Set when relay notifies this tab that the current space was destroyed (WS will drop). */
  spaceDestroyedSlug: string | null = null;
  /** Set when relay notifies this tab that the current space was archived (WS will drop). */
  spaceArchivedSlug: string | null = null;
  relayStatus: RelayStatusSnapshot = {
    running: false,
    activeConnectionCount: 0,
    stopSupported: false,
    restartSupported: false,
  };
  /** `null` -> default human->orchestrator (omit `to`); otherwise direct `to` session. */
  sendTargetSessionId: string | null = null;
  selfSessionId: string | null = null;
  transcriptLines: TranscriptLine[] = [];
  /** Client-side full-text query over loaded lines (AND with filters). */
  transcriptSearchQuery = "";
  /** Right-hand transcript search/filter panel (D-03). */
  transcriptSearchPanelOpen = false;
  diagnosticsPanelOpen = false;
  /** `null` = any sender. */
  transcriptFilterSenderSessionId: string | null = null;
  transcriptFilterKind: "all" | "control" | "conversation" = "all";
  transcriptTimeFilter: TranscriptTimeFilter = { kind: "all" };
  errors: DashboardProtocolErrorItem[] = [];
  private readonly listeners = new Set<() => void>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private transcriptDedupe = new Set<string>();
  private readonly transcriptSearchIndex = createTranscriptMiniSearch();
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

  setTranscriptSearchQuery(q: string): void {
    if (this.transcriptSearchQuery === q) {
      return;
    }
    this.transcriptSearchQuery = q;
    this.notify();
  }

  setTranscriptSearchPanelOpen(open: boolean): void {
    if (this.transcriptSearchPanelOpen === open) {
      return;
    }
    this.transcriptSearchPanelOpen = open;
    this.notify();
  }

  setDiagnosticsPanelOpen(open: boolean): void {
    if (this.diagnosticsPanelOpen === open) {
      return;
    }
    this.diagnosticsPanelOpen = open;
    this.notify();
  }

  setTranscriptFilters(updates: {
    sender?: string | null;
    kind?: "all" | "control" | "conversation";
    time?: TranscriptTimeFilter;
  }): void {
    let changed = false;
    if (updates.sender !== undefined) {
      if (this.transcriptFilterSenderSessionId !== updates.sender) {
        this.transcriptFilterSenderSessionId = updates.sender;
        changed = true;
      }
    }
    if (updates.kind !== undefined) {
      if (this.transcriptFilterKind !== updates.kind) {
        this.transcriptFilterKind = updates.kind;
        changed = true;
      }
    }
    if (updates.time !== undefined) {
      this.transcriptTimeFilter = updates.time;
      changed = true;
    }
    if (changed) {
      this.notify();
    }
  }

  getVisibleTranscriptLines(): TranscriptLine[] {
    const filtered = this.transcriptLines.filter((line) =>
      this.lineMatchesTranscriptFilters(line),
    );
    const q = this.transcriptSearchQuery.trim();
    if (q === "") {
      return filtered;
    }
    const lineByDedupeKey = new Map(
      this.transcriptLines.map((l) => [l.dedupeKey, l] as const),
    );
    const results = this.transcriptSearchIndex.search(q, {
      filter: (r) => {
        const id = r.id;
        const line = lineByDedupeKey.get(id);
        return (
          line !== undefined && this.lineMatchesTranscriptFilters(line)
        );
      },
    });
    const hitSet = new Set(results.map((r) => r.id));
    return this.transcriptLines.filter(
      (line) =>
        this.lineMatchesTranscriptFilters(line) && hitSet.has(line.dedupeKey),
    );
  }

  getVisibleDiscussionLines(): TranscriptLine[] {
    return this.getVisibleTranscriptLines().filter(
      (line) =>
        line.envelope.kind === "conversation" &&
        this.lineMatchesActiveDiscussion(line),
    );
  }

  getActiveDiscussionTitle(): string {
    if (this.sendTargetSessionId === null) {
      return "Human ↔ Orchestrator Discussion";
    }
    const row = this.roster.get(this.sendTargetSessionId);
    const label =
      row?.displayName ?? `${this.sendTargetSessionId.slice(0, 8)}...`;
    return `Private chat with ${label}`;
  }

  getDiagnosticsTranscriptLines(): TranscriptLine[] {
    return [...this.transcriptLines];
  }

  private lineMatchesTranscriptFilters(line: TranscriptLine): boolean {
    if (this.transcriptFilterSenderSessionId !== null) {
      if (line.envelope.sessionId !== this.transcriptFilterSenderSessionId) {
        return false;
      }
    }
    if (this.transcriptFilterKind !== "all") {
      if (line.envelope.kind !== this.transcriptFilterKind) {
        return false;
      }
    }
    const tf = this.transcriptTimeFilter;
    if (tf.kind === "all") {
      return true;
    }
    if (tf.kind === "custom") {
      const t = line.receivedAtMs;
      return t >= tf.startMs && t <= tf.endMs;
    }
    const now = Date.now();
    const windowMs = tf.preset === "5m" ? 5 * 60 * 1000 : 30 * 60 * 1000;
    return line.receivedAtMs >= now - windowMs;
  }

  private lineMatchesActiveDiscussion(line: TranscriptLine): boolean {
    const env = line.envelope;
    if (env.kind !== "conversation") {
      return false;
    }
    const selfId = this.selfSessionId;
    if (selfId === null) {
      return true;
    }
    const target = conversationDeliveryTarget(env);
    if (this.sendTargetSessionId !== null) {
      const selected = this.sendTargetSessionId;
      return (
        (env.sessionId === selfId && target === selected) ||
        (env.sessionId === selected && target === selfId)
      );
    }

    const orchestratorId = Array.from(this.roster.values()).find(
      (row) => row.orchestrator,
    )?.sessionId;
    if (orchestratorId === undefined) {
      return false;
    }
    if (env.sessionId === selfId) {
      return target === undefined || target === orchestratorId;
    }
    if (env.sessionId === orchestratorId) {
      return target === undefined || target === selfId;
    }
    return false;
  }

  setActiveSpaceId(id: string): void {
    if (this.activeSpaceId === id) {
      return;
    }
    this.clearTranscriptState();
    this.activeSpaceId = id;
    this.sendTargetSessionId = null;
    this.spaceDestroyedSlug = null;
    this.spaceArchivedSlug = null;
    this.notify();
  }

  private clearTranscriptState(): void {
    this.transcriptDedupe.clear();
    this.transcriptLines = [];
    this.transcriptSearchIndex.removeAll();
  }

  setSpacesList(rows: SpaceListRow[]): void {
    this.spacesList = rows;
    this.notify();
  }

  setRelayStatus(status: RelayStatusSnapshot): void {
    this.relayStatus = status;
    this.notify();
  }

  setCurrentSpaceSlug(slug: string): void {
    if (this.currentSpaceSlug === slug) {
      return;
    }
    this.currentSpaceSlug = slug;
    this.currentSpaceLabel = slug;
    this.notify();
  }

  noteSpaceDestroyed(slug: string): void {
    this.spaceDestroyedSlug = slug;
    this.spacesList = this.spacesList.filter((row) => row.slug !== slug);
    if (slug === this.currentSpaceSlug) {
      this.activeSpaceId = null;
      this.roster.clear();
      this.sendTargetSessionId = null;
      this.clearTranscriptState();
    }
    this.notify();
  }

  noteSpaceArchived(slug: string): void {
    this.spaceArchivedSlug = slug;
    this.spacesList = this.spacesList.filter((row) => row.slug !== slug);
    if (slug === this.currentSpaceSlug) {
      this.activeSpaceId = null;
      this.roster.clear();
      this.sendTargetSessionId = null;
      this.clearTranscriptState();
    }
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
    return !this.getConsoleProjection().defaultDiscussion.canSend;
  }

  get isSelectedTargetSendBlocked(): boolean {
    if (this.sendTargetSessionId === null) {
      return this.isDefaultOrchestratorSendBlocked;
    }
    return !this.getPrivateInterventionProjection(this.sendTargetSessionId)
      .canSend;
  }

  getConsoleProjection(): DashboardConsoleProjection {
    const participants = Array.from(this.roster.values()).map((row) =>
      this.projectParticipant(row),
    );
    const participantsById = new Map(
      participants.map((row) => [row.sessionId, row] as const),
    );
    const orchestrator =
      participants.find((row) => row.orchestrator) ?? null;
    const spaceStatus =
      this.spaceDestroyedSlug === this.currentSpaceSlug
        ? "destroyed"
        : this.spaceArchivedSlug === this.currentSpaceSlug
          ? "archived"
          : this.activeSpaceId === null
            ? "unknown"
            : "active";
    const privateIntervention =
      this.sendTargetSessionId === null
        ? null
        : this.getPrivateInterventionProjection(this.sendTargetSessionId);
    return {
      space: {
        id: this.activeSpaceId,
        slug: this.currentSpaceSlug,
        label: this.currentSpaceLabel,
        status: spaceStatus,
      },
      orchestrator,
      participants,
      participantsById,
      defaultDiscussion: this.getDefaultDiscussionProjection(orchestrator),
      privateIntervention,
    };
  }

  getDefaultDiscussionProjection(
    orchestrator = this.getConsoleProjection().orchestrator,
  ): DiscussionTargetProjection {
    if (orchestrator === null) {
      return {
        mode: "orchestrator",
        status: "missing-orchestrator",
        targetSessionId: null,
        targetLabel: "No orchestrator",
        canSend: false,
        reason: "No orchestrator is selected for this space.",
      };
    }
    return this.discussionProjectionForTarget(orchestrator, "orchestrator");
  }

  getPrivateInterventionProjection(
    sessionId: string,
  ): DiscussionTargetProjection {
    const row = this.roster.get(sessionId);
    if (row === undefined) {
      return {
        mode: "private",
        status: "target-missing",
        targetSessionId: sessionId,
        targetLabel: `${sessionId.slice(0, 8)}...`,
        canSend: false,
        reason: "This participant is no longer in the space.",
      };
    }
    return this.discussionProjectionForTarget(
      this.projectParticipant(row),
      "private",
    );
  }

  private discussionProjectionForTarget(
    row: ParticipantProjection,
    mode: "orchestrator" | "private",
  ): DiscussionTargetProjection {
    const targetLabel = row.displayName;
    const base = {
      mode,
      targetSessionId: row.sessionId,
      targetLabel,
    };
    if (mode === "private" && row.isHuman) {
      return {
        ...base,
        status: "target-unavailable",
        canSend: false,
        reason:
          "Private intervention targets runtime sessions, not dashboard humans.",
      };
    }
    if (row.availability.kind === "stale") {
      return {
        ...base,
        status: "target-stale",
        canSend: false,
        reason:
          mode === "orchestrator"
            ? "Cannot send until the orchestrator is reachable."
            : "Cannot send until this participant is reachable.",
      };
    }
    if (row.availability.kind === "manual-pull") {
      return {
        ...base,
        status: "target-manual-pull",
        canSend: true,
        reason:
          mode === "orchestrator"
            ? "This pull-based orchestrator will receive the message on its next manual pull."
            : "This pull-based participant will receive the message on its next manual pull.",
      };
    }
    if (row.availability.kind === "offline") {
      return {
        ...base,
        status: "target-offline",
        canSend: false,
        reason:
          mode === "orchestrator"
            ? "Cannot send until the orchestrator is reachable."
            : "Cannot send until this participant is reachable.",
      };
    }
    if (!row.availability.canReceivePrivateIntervention && mode === "private") {
      return {
        ...base,
        status: "target-unavailable",
        canSend: false,
        reason: row.availability.detail,
      };
    }
    return {
      ...base,
      status: "ready",
      canSend: true,
      reason: "",
    };
  }

  private projectParticipant(row: RosterRow): ParticipantProjection {
    return {
      ...row,
      availability: this.projectAvailability(row),
    };
  }

  private projectAvailability(row: RosterRow): ParticipantAvailability {
    if (row.isHuman) {
      return {
        kind: "unavailable",
        label: row.sessionId === this.selfSessionId ? "You" : "Human",
        detail: "Dashboard humans are visible but are not runtime inboxes.",
        canReceiveLive: false,
        canReceivePrivateIntervention: false,
      };
    }
    if (row.presenceState === "stale") {
      if (isPullMode(row.inboxMode)) {
        return {
          kind: "manual-pull",
          label: "Manual pull",
          detail:
            "This pull-based runtime is not connected; messages are queued until it runs pull.",
          canReceiveLive: false,
          canReceivePrivateIntervention: true,
        };
      }
      return {
        kind: "stale",
        label: "Stale",
        detail: "This runtime has not checked in recently.",
        canReceiveLive: false,
        canReceivePrivateIntervention: false,
      };
    }
    if (row.presenceState === "offline") {
      if (isPullMode(row.inboxMode)) {
        return {
          kind: "manual-pull",
          label: "Manual pull",
          detail:
            "This pull-based runtime is not connected; messages are queued until it runs pull.",
          canReceiveLive: false,
          canReceivePrivateIntervention: true,
        };
      }
      return {
        kind: "offline",
        label: "Offline",
        detail: "This runtime is not currently connected.",
        canReceiveLive: false,
        canReceivePrivateIntervention: false,
      };
    }
    if (row.progress === "blocked") {
      return {
        kind: "blocked",
        label: "Blocked",
        detail:
          row.blockedReason.trim() === ""
            ? "This runtime says it is blocked."
            : row.blockedReason,
        canReceiveLive: true,
        canReceivePrivateIntervention: true,
      };
    }
    return {
      kind: "available",
      label: "Available",
      detail: "This runtime is online and can receive Talkie messages.",
      canReceiveLive: true,
      canReceivePrivateIntervention: true,
    };
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
    const line: TranscriptLine = {
      dedupeKey,
      receivedAtMs,
      envelope: parsed.data,
    };
    this.transcriptLines = [...this.transcriptLines, line];
    this.transcriptSearchIndex.add(buildTranscriptSearchDoc(line, this.roster));
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
    const targetSessionId = data.targetSessionId ?? envelope.sessionId;
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
        inboxMode: "live",
        presenceState: "offline",
        lastSeenAtMs: null,
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
    const line: TranscriptLine = { dedupeKey, receivedAtMs, envelope: env };
    this.transcriptLines = [...this.transcriptLines, line];
    this.transcriptSearchIndex.add(buildTranscriptSearchDoc(line, this.roster));
    this.notify();
  }

  hydrateFromSpaceSummary(
    summary: OversightSpaceSummary,
    selfSessionId: string,
  ): void {
    this.selfSessionId = selfSessionId;
    this.currentSpaceSlug = summary.slug;
    this.currentSpaceLabel = summary.label;
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
        displayName: displayNameForRosterMember(m, selfSessionId),
        isHuman: m.isHuman,
        runtime: m.runtime,
        workspaceLabel: m.workspaceLabel,
        inboxMode: m.inboxMode ?? "live",
        orchestrator: orch !== null && sid === orch,
        owner: owner !== null && sid === owner,
        role: m.role,
        focus: m.focus,
        progress: m.progress,
        blockedReason: m.blockedReason ?? "",
        presenceState: m.presenceState ?? "offline",
        lastSeenAtMs: m.lastSeenAtMs ?? null,
      });
    }
    if (
      this.sendTargetSessionId !== null &&
      !this.roster.has(this.sendTargetSessionId)
    ) {
      this.sendTargetSessionId = null;
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

  stopSnapshotRefresh(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
