import type { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import "../diagnostics/talkie-diagnostics-panel.js";
import "../errors/talkie-error-bar.js";
import "../roster/talkie-roster.js";
import "../shell/connection-shell.js";
import "../shell/talkie-search-panel.js";
import "../shell/talkie-send-bar.js";
import "../shell/talkie-metadata-editor.js";
import "../shell/talkie-space-picker.js";
import type { DashboardStore } from "../store/dashboard-store.js";
import type { RosterRow } from "../store/dashboard-store.js";
import { TalkieTranscript } from "../transcript/talkie-transcript.js";
import "../transcript/talkie-transcript.js";
import "./talkie-console-status.js";

type SpacePickerElement = HTMLElement & {
  bridge: BrowserSessionBridge;
  currentSlug: string;
  currentSpaceLabel: string;
  destroyedSlug: string | null;
  archivedSlug: string | null;
  httpOrigin: string;
  selfIsOwner: boolean;
  store: DashboardStore;
};

type ConnectionShellElement = HTMLElement & {
  activeConnectionCount: number;
  healthState: string;
  refreshBannerText: string;
  relayRunning: boolean;
  restartSupported: boolean;
  showRefreshBanner: boolean;
  stopSupported: boolean;
};

type RosterElement = HTMLElement & {
  entries: unknown[];
  selfIsOwner: boolean;
  selfSessionId: string;
};

type DiagnosticsPanelElement = HTMLElement & {
  open: boolean;
  store: DashboardStore;
};

type MetadataEditorElement = HTMLElement & {
  bridge: BrowserSessionBridge;
  open: boolean;
  row: RosterRow | null;
  spaceId: string;
};

export type DashboardAppShellRefs = {
  picker: SpacePickerElement;
  connectionShell: ConnectionShellElement;
  consoleStatus: HTMLElement;
  errorBar: HTMLElement;
  roster: RosterElement;
  transcript: TalkieTranscript;
  searchPanel: HTMLElement;
  diagnosticsPanel: DiagnosticsPanelElement;
  metadataEditor: MetadataEditorElement;
  sendBar: HTMLElement;
};

export function mountDashboardAppShell(options: {
  mount: HTMLElement;
  store: DashboardStore;
  bridge: BrowserSessionBridge;
  httpOrigin: string;
}): DashboardAppShellRefs {
  const { mount, store, bridge, httpOrigin } = options;
  mount.classList.add("talkie-app");

  const headerRow = document.createElement("div");
  headerRow.classList.add("talkie-app__header");

  const picker = document.createElement(
    "talkie-space-picker",
  ) as SpacePickerElement;
  const consoleStatus = document.createElement("talkie-console-status");
  const connectionShell = document.createElement(
    "talkie-connection-shell",
  ) as ConnectionShellElement;
  headerRow.appendChild(picker);
  headerRow.appendChild(consoleStatus);
  headerRow.appendChild(connectionShell);

  const errorBar = document.createElement("talkie-error-bar");
  const bodyRow = document.createElement("div");
  bodyRow.className = "talkie-app__body";

  const roster = document.createElement("talkie-roster") as RosterElement;
  const mainPanel = document.createElement("div");
  mainPanel.id = "talkie-main-panel";
  const workspace = document.createElement("div");
  workspace.className = "talkie-transcript-workspace";
  const transcript = document.createElement("talkie-transcript") as TalkieTranscript;
  const searchPanel = document.createElement("talkie-search-panel");
  const diagnosticsPanel = document.createElement(
    "talkie-diagnostics-panel",
  ) as DiagnosticsPanelElement;
  const metadataEditor = document.createElement(
    "talkie-metadata-editor",
  ) as MetadataEditorElement;
  const sendBar = document.createElement("talkie-send-bar");

  for (const element of [
    picker,
    consoleStatus,
    errorBar,
    roster,
    transcript,
    searchPanel,
    diagnosticsPanel,
    metadataEditor,
    sendBar,
  ]) {
    (element as unknown as { store: DashboardStore }).store = store;
  }
  (picker as unknown as { bridge: BrowserSessionBridge }).bridge = bridge;
  (picker as unknown as { httpOrigin: string }).httpOrigin = httpOrigin;
  (metadataEditor as unknown as { bridge: BrowserSessionBridge }).bridge = bridge;
  (sendBar as unknown as { bridge: BrowserSessionBridge }).bridge = bridge;

  searchPanel.style.display = "none";
  workspace.appendChild(transcript);
  workspace.appendChild(searchPanel);
  workspace.appendChild(diagnosticsPanel);
  mainPanel.appendChild(workspace);
  mainPanel.appendChild(sendBar);
  mainPanel.appendChild(metadataEditor);
  bodyRow.appendChild(roster);
  bodyRow.appendChild(mainPanel);

  mount.appendChild(headerRow);
  mount.appendChild(errorBar);
  mount.appendChild(bodyRow);

  return {
    picker,
    connectionShell,
    consoleStatus,
    errorBar,
    roster,
    transcript,
    searchPanel,
    diagnosticsPanel,
    metadataEditor,
    sendBar,
  };
}
