export type TalkieOutboundFrame = { kind: "envelope"; body: unknown };

export type TalkieInboundFrame =
  | { kind: "ack"; duplicate: boolean }
  | { kind: "error"; error: unknown };

export interface TalkieTransport {
  send(frame: TalkieOutboundFrame): void | Promise<void>;
  onMessage(handler: (frame: TalkieInboundFrame) => void): void;
  close(): void | Promise<void>;
}
