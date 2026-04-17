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

export class DashboardStore {
  readonly roster = new Map<string, RosterRow>();
  transcriptRows: unknown[] = [];
  errors: unknown[] = [];
  private readonly listeners = new Set<() => void>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

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

  hydrateFromSpaceSummary(
    summary: OversightSpaceSummary,
    _selfSessionId: string,
  ): void {
    /* _selfSessionId reserved for future “self” row styling (09-03+). */
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
