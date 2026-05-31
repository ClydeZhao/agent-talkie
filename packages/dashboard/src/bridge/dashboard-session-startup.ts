import type { BrowserSessionBridge } from "./browser-session-bridge.js";

export const DASHBOARD_SESSION_PROFILE = {
  displayName: "Dashboard",
  runtime: "browser",
  workspaceLabel: "dashboard",
} as const;

export type DashboardSessionStartupBridge = Pick<
  BrowserSessionBridge,
  | "connect"
  | "resumeFromStorage"
  | "registerNewSession"
  | "joinSpace"
  | "clearStoredSessionCredentials"
  | "close"
>;

export type DashboardSessionStartupResult = {
  selfSessionId: string;
  spaceId: string;
  slug: string;
  recoveredFromStaleStoredSession: boolean;
};

async function registerFreshDashboardSession(
  bridge: DashboardSessionStartupBridge,
): Promise<string> {
  let registered: Awaited<
    ReturnType<DashboardSessionStartupBridge["registerNewSession"]>
  >;
  try {
    registered = await bridge.registerNewSession(DASHBOARD_SESSION_PROFILE);
  } catch (error) {
    bridge.clearStoredSessionCredentials();
    bridge.close();
    await bridge.connect({ autoReconnect: true });
    registered = await bridge.registerNewSession(DASHBOARD_SESSION_PROFILE);
  }
  return registered.sessionId;
}

async function joinSpace(
  bridge: DashboardSessionStartupBridge,
  slug: string,
  label?: string,
): Promise<{ spaceId: string; slug: string }> {
  const args: Parameters<DashboardSessionStartupBridge["joinSpace"]>[0] = {
    slug,
    idempotencyKey: crypto.randomUUID(),
  };
  if (label !== undefined && label.trim().length > 0) {
    args.label = label.trim();
  }
  return bridge.joinSpace(args);
}

function isRecoverableStoredSessionJoinError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("already_in_space")) {
    return true;
  }
  try {
    const parsed = JSON.parse(message) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      parsed.error === "already_in_space"
    );
  } catch {
    return false;
  }
}

export async function connectJoinDashboardSession(
  bridge: DashboardSessionStartupBridge,
  slug: string,
  label?: string,
): Promise<DashboardSessionStartupResult> {
  await bridge.connect({ autoReconnect: true });

  const resumed = await bridge.resumeFromStorage();
  const selfSessionId =
    resumed === null
      ? await registerFreshDashboardSession(bridge)
      : resumed.sessionId;

  try {
    const joined = await joinSpace(bridge, slug, label);
    return {
      selfSessionId,
      spaceId: joined.spaceId,
      slug: joined.slug,
      recoveredFromStaleStoredSession: false,
    };
  } catch (error) {
    if (
      resumed === null ||
      !isRecoverableStoredSessionJoinError(error)
    ) {
      bridge.close();
      throw error;
    }
  }

  bridge.clearStoredSessionCredentials();
  bridge.close();
  await bridge.connect({ autoReconnect: true });
  const freshSessionId = await registerFreshDashboardSession(bridge);
  let joined: { spaceId: string; slug: string };
  try {
    joined = await joinSpace(bridge, slug, label);
  } catch (error) {
    bridge.close();
    throw error;
  }
  return {
    selfSessionId: freshSessionId,
    spaceId: joined.spaceId,
    slug: joined.slug,
    recoveredFromStaleStoredSession: true,
  };
}
