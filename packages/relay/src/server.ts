/**
 * Placeholder — full WebSocket relay is implemented in the same plan (Task 4).
 */
export async function createRelayServer(_opts: {
  dbPath: string;
  port?: number;
  pepper?: string;
}): Promise<{ url: string; close: () => Promise<void> }> {
  throw new Error("createRelayServer not implemented");
}
