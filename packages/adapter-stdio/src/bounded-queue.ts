export function createBoundedQueue<T>(maxLen: number) {
  const items: T[] = [];
  return {
    enqueue(item: T, onDrop: (dropped: T) => void): void {
      if (items.length >= maxLen) {
        const dropped = items.shift()!;
        onDrop(dropped);
      }
      items.push(item);
    },
    shift(): T | undefined {
      return items.shift();
    },
    get length(): number {
      return items.length;
    },
  };
}
