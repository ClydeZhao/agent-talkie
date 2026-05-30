import { describe, it, expect, vi } from "vitest";
import { createBoundedQueue } from "./bounded-queue.js";

describe("createBoundedQueue", () => {
  it("drops oldest when at capacity and invokes onDrop once", () => {
    const q = createBoundedQueue<number>(2);
    const onDrop = vi.fn();
    q.enqueue(1, onDrop);
    q.enqueue(2, onDrop);
    q.enqueue(3, onDrop);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(1);
    expect(q.length).toBe(2);
    expect(q.shift()).toBe(2);
    expect(q.shift()).toBe(3);
  });
});
