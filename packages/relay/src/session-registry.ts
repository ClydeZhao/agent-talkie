import type { WebSocket } from "ws";

export class SessionRegistry {
  private readonly bySession = new Map<string, WebSocket>();

  bind(sessionId: string, ws: WebSocket): void {
    const existing = this.bySession.get(sessionId);
    if (existing && existing !== ws) {
      try {
        existing.close();
      } catch {
        /* ignore */
      }
    }
    this.bySession.set(sessionId, ws);
  }

  remove(ws: WebSocket): void {
    for (const [sid, socket] of this.bySession) {
      if (socket === ws) {
        this.bySession.delete(sid);
        return;
      }
    }
  }

  get(sessionId: string): WebSocket | undefined {
    return this.bySession.get(sessionId);
  }
}
