import type { ChildProcess, SpawnOptions } from "node:child_process";

export type EnsureRelayRunning = (opts: Record<string, unknown>) => Promise<{
  port: number;
}>;

/**
 * Stub for Task 1 build; full implementation in Task 2.
 */
export async function runCodexAdapter(_opts?: {
  spawn?: (
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ) => ChildProcess;
  ensureRelay?: EnsureRelayRunning;
}): Promise<void> {
  void _opts;
}
