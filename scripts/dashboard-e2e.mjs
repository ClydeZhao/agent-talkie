#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { TalkieSessionClient } from "@agent-talkie/client";
import { openDatabase } from "@agent-talkie/persistence";
import { createRelayServer } from "@agent-talkie/relay";

const dataDir = mkdtempSync(join(tmpdir(), "agent-talkie-dashboard-e2e-"));
const dbPath = join(dataDir, "relay.sqlite");
const mainSlug = `dashboard-e2e-${Date.now().toString(36)}`;
const noOrchestratorSlug = `${mainSlug}-no-orch`;
const staleOrchestratorSlug = `${mainSlug}-stale-orch`;
const staleAfterMs = 60000;

const clients = [];
let server;
let browser;
let serverClosed = false;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor(fn, label, timeoutMs = 8000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function makeClient(url, identity) {
  const client = new TalkieSessionClient({ url });
  await client.connect();
  const session = await client.registerSession(identity);
  clients.push(client);
  return { client, session };
}

async function fetchJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!res.ok) {
    throw new Error(`${path} failed with ${res.status}`);
  }
  return res.json();
}

async function spaceSummary(port, slug) {
  return fetchJson(
    port,
    `/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(slug)}`,
  );
}

async function activeSpaces(port) {
  return fetchJson(port, "/__agent-talkie/v1/oversight/spaces");
}

function countDashboardHumans(summary) {
  return summary.members.filter(
    (member) => member.isHuman === true && member.runtime === "browser",
  ).length;
}

async function shadowText(page, selector) {
  return page.locator(selector).evaluate((el) =>
    el.shadowRoot?.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
}

async function visibleDiscussionTexts(page) {
  return page.locator("talkie-transcript").evaluate((el) =>
    el.store?.getVisibleDiscussionLines?.().map(
      (line) => line.envelope.payload?.text,
    ) ?? [],
  );
}

async function setupFixture() {
  server = await createRelayServer({
    dbPath,
    port: 0,
    idleShutdownMs: 0,
    presenceStaleAfterMs: staleAfterMs,
  });
  const port = Number(new URL(server.url).port);
  const wsUrl = `ws://127.0.0.1:${port}`;

  const lead = await makeClient(wsUrl, {
    displayName: "Lead Runtime",
    runtime: "claude-code",
    workspaceLabel: "repo",
    isHuman: false,
    inboxMode: "live",
  });
  const joined = await lead.client.joinSpace({
    slug: mainSlug,
    label: "Dashboard E2E Main",
    idempotencyKey: randomUUID(),
    creatorOrchestrator: true,
  });
  lead.client.onEnvelope((env) => {
    if (env.kind !== "conversation") {
      return;
    }
    const text = typeof env.payload?.text === "string" ? env.payload.text : "";
    if (text.includes("default e2e ping")) {
      lead.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: lead.session.sessionId,
        kind: "conversation",
        type: "chat.message",
        spaceId: joined.spaceId,
        idempotencyKey: randomUUID(),
        payload: { text: `default e2e ack from Lead Runtime: ${text}` },
      });
    }
  });

  const worker = await makeClient(wsUrl, {
    displayName: "Worker Runtime",
    runtime: "codex-cli",
    workspaceLabel: "repo",
    isHuman: false,
    inboxMode: "live",
  });
  await worker.client.joinSpace({
    slug: mainSlug,
    label: "Dashboard E2E Main",
    idempotencyKey: randomUUID(),
  });
  worker.client.onEnvelope((env) => {
    if (env.kind !== "conversation") {
      return;
    }
    const text = typeof env.payload?.text === "string" ? env.payload.text : "";
    if (!text.includes("private e2e ping")) {
      return;
    }
    const replyTo = env.type === "chat.direct" ? env.sessionId : undefined;
    worker.client.sendEnvelope({
      version: 1,
      id: randomUUID(),
      sessionId: worker.session.sessionId,
      kind: "conversation",
      type: replyTo ? "chat.direct" : "chat.message",
      ...(replyTo ? { to: replyTo } : {}),
      spaceId: joined.spaceId,
      idempotencyKey: randomUUID(),
      payload: { text: `private e2e ack from Worker Runtime: ${text}` },
    });
  });

  const offline = await makeClient(wsUrl, {
    displayName: "Offline Worker",
    runtime: "codex-cli",
    workspaceLabel: "repo",
    isHuman: false,
    inboxMode: "live",
  });
  await offline.client.joinSpace({
    slug: mainSlug,
    label: "Dashboard E2E Main",
    idempotencyKey: randomUUID(),
  });
  offline.client.close();

  const pull = await makeClient(wsUrl, {
    displayName: "Pull Worker",
    runtime: "codex-app",
    workspaceLabel: "repo",
    isHuman: false,
    inboxMode: "pull",
  });
  await pull.client.joinSpace({
    slug: mainSlug,
    label: "Dashboard E2E Main",
    idempotencyKey: randomUUID(),
  });
  pull.client.close();

  const noOrchestrator = await makeClient(wsUrl, {
    displayName: "No Orchestrator Runtime",
    runtime: "codex-cli",
    workspaceLabel: "repo",
    isHuman: false,
    inboxMode: "live",
  });
  await noOrchestrator.client.joinSpace({
    slug: noOrchestratorSlug,
    label: "No Orchestrator Space",
    idempotencyKey: randomUUID(),
  });

  const stale = await makeClient(wsUrl, {
    displayName: "Stale Lead",
    runtime: "claude-code",
    workspaceLabel: "repo",
    isHuman: false,
    inboxMode: "live",
  });
  const staleJoined = await stale.client.joinSpace({
    slug: staleOrchestratorSlug,
    label: "Stale Orchestrator Space",
    idempotencyKey: randomUUID(),
    creatorOrchestrator: true,
  });
  stale.client.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId: stale.session.sessionId,
    kind: "control",
    type: "metadata.patch",
    spaceId: staleJoined.spaceId,
    idempotencyKey: randomUUID(),
    payload: {
      namespace: "status",
      patch: { progress: "idle", blockedReason: "" },
    },
  });
  await waitFor(async () => {
    const summary = await spaceSummary(port, staleOrchestratorSlug);
    return summary.members.some(
      (member) =>
        member.sessionId === stale.session.sessionId &&
        member.lastSeenAtMs !== null,
    );
  }, "stale orchestrator status row");
  const db = openDatabase(dbPath);
  try {
    db.prepare(
      `UPDATE collaboration_status
       SET last_activity_ms = ?
       WHERE space_id = ? AND session_id = ?`,
    ).run(Date.now() - staleAfterMs - 1000, staleJoined.spaceId, stale.session.sessionId);
  } finally {
    db.close();
  }
  stale.client.close();

  return {
    port,
    dashboardUrl: `http://127.0.0.1:${port}/dashboard?space=${mainSlug}`,
  };
}

async function runBrowserChecks({ port, dashboardUrl }) {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(8000);

  await page.goto(dashboardUrl, {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  await page.getByText("Connected").waitFor();
  await page
    .getByRole("button", { name: /Orchestrator Lead Runtime/ })
    .waitFor();
  await page
    .getByRole("button", { name: /Worker Runtime idle Available/ })
    .waitFor();
  await page
    .getByRole("button", { name: /Offline Worker idle Offline/ })
    .waitFor();
  await page
    .getByRole("button", { name: /Pull Worker idle Manual pull/ })
    .waitFor();

  const initialStatus = await shadowText(page, "talkie-console-status");
  assert(initialStatus.includes("Dashboard E2E Main"), "space label missing");
  assert(initialStatus.includes("Lead Runtime"), "orchestrator missing");
  assert(initialStatus.includes("Send Target Lead Runtime"), "default target missing");

  const mainSummary = await spaceSummary(port, mainSlug);
  assert(countDashboardHumans(mainSummary) === 1, "expected one dashboard human");
  assert(
    mainSummary.members.some(
      (member) =>
        member.displayName === "Offline Worker" &&
        member.presenceState === "offline",
    ),
    "offline runtime did not appear as offline",
  );
  assert(
    mainSummary.members.some(
      (member) =>
        member.displayName === "Pull Worker" &&
        member.presenceState === "offline" &&
        member.inboxMode === "pull",
    ),
    "pull runtime did not appear as offline pull mode",
  );

  const pickerButton = page.getByRole("button", { name: /Dashboard E2E Main/ });
  await pickerButton.click();
  if (process.env.TALKIE_E2E_DEBUG === "1") {
    await page.waitForTimeout(1000);
    console.error(await shadowText(page, "talkie-space-picker"));
    console.error(JSON.stringify(await activeSpaces(port), null, 2));
  }
  await waitFor(async () => {
    const pickerText = await shadowText(page, "talkie-space-picker");
    return pickerText.includes("No Orchestrator Space") &&
      pickerText.includes("No orchestrator") &&
      pickerText.includes("Orchestrator stale")
      ? pickerText
      : undefined;
  }, "space picker actionability labels");
  const spaces = await activeSpaces(port);
  assert(
    spaces.some(
      (space) =>
        space.slug === noOrchestratorSlug &&
        space.actionability?.reason === "no_orchestrator",
    ),
    "no-orchestrator space was not marked blocked",
  );
  assert(
    spaces.some(
      (space) =>
        space.slug === staleOrchestratorSlug &&
        space.actionability?.reason === "orchestrator_stale",
    ),
    "stale-orchestrator space was not marked blocked",
  );
  await page.keyboard.press("Escape");

  const defaultText = `default e2e ping ${Date.now()}`;
  const defaultAck = `default e2e ack from Lead Runtime: ${defaultText}`;
  await page.locator("talkie-send-bar textarea").fill(defaultText);
  await page.locator("talkie-send-bar button.send").click();
  await waitFor(async () => {
    const visible = await visibleDiscussionTexts(page);
    return visible.includes(defaultAck) ? visible : undefined;
  }, "default orchestrator ack");

  const transcriptSurface = await shadowText(page, "talkie-transcript");
  assert(
    !transcriptSurface.includes('"sessionId"') &&
      !transcriptSurface.includes('"version"'),
    "raw protocol fields leaked into the default transcript surface",
  );

  await page.getByRole("button", { name: /Worker Runtime idle Available/ }).click();
  await page.locator("talkie-send-bar").getByText("Private chat with Worker Runtime").waitFor();
  const privateStatus = await shadowText(page, "talkie-console-status");
  assert(
    privateStatus.includes("Send Target Worker Runtime Private chat"),
    "private send target status did not switch to Worker Runtime",
  );
  const privateText = `private e2e ping ${Date.now()}`;
  const privateAck = `private e2e ack from Worker Runtime: ${privateText}`;
  await page.locator("talkie-send-bar textarea").fill(privateText);
  await page.locator("talkie-send-bar button.send").click();
  await waitFor(async () => {
    const visible = await visibleDiscussionTexts(page);
    return visible.includes(privateAck) ? visible : undefined;
  }, "private worker ack");

  await page.getByRole("button", { name: /Offline Worker idle Offline/ }).click();
  await page.locator("talkie-send-bar").getByText("participant is offline").waitFor();
  assert(
    (await page.locator("talkie-send-bar button.send").isDisabled()) === true,
    "offline private target should disable send",
  );

  await page.getByRole("button", { name: /Pull Worker idle Manual pull/ }).click();
  await page.locator("talkie-send-bar").getByText("manual pull").waitFor();
  assert(
    (await page.locator("talkie-send-bar button.send").isEnabled()) === true,
    "manual-pull private target should keep send available",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Connected").waitFor();
  await waitFor(async () => {
    const summary = await spaceSummary(port, mainSlug);
    return countDashboardHumans(summary) === 1 ? summary : undefined;
  }, "dashboard reload without duplicate active humans");

  const desktopLayout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(
    desktopLayout.scrollWidth <= desktopLayout.width + 1,
    "desktop viewport has horizontal overflow",
  );

  await page.setViewportSize({ width: 390, height: 820 });
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sendVisible:
      document
        .querySelector("talkie-send-bar")
        ?.shadowRoot?.querySelector("button.send")
        ?.getBoundingClientRect().width ?? 0,
  }));
  assert(
    mobileLayout.scrollWidth <= mobileLayout.width + 1,
    "mobile viewport has horizontal overflow",
  );
  assert(mobileLayout.sendVisible > 0, "mobile send button is not visible");

  await page.locator('talkie-connection-shell button[data-action="stop"]').click();
  await page.getByText("Disconnected").waitFor({ timeout: 5000 });

  return {
    initialStatus,
    defaultAck,
    privateAck,
    activeSpaceActionability: spaces
      .filter((space) =>
        [mainSlug, noOrchestratorSlug, staleOrchestratorSlug].includes(
          space.slug,
        ),
      )
      .map((space) => ({
        slug: space.slug,
        actionability: space.actionability,
      })),
    desktopLayout,
    mobileLayout,
  };
}

try {
  const fixture = await setupFixture();
  const proof = await runBrowserChecks(fixture);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mainSlug,
        noOrchestratorSlug,
        staleOrchestratorSlug,
        ...proof,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  for (const client of clients) {
    client.close();
  }
  if (server && !serverClosed) {
    await server.close().catch(() => {});
  }
  rmSync(dataDir, { recursive: true, force: true });
}
