export interface Notice {
  id: number;
  kind: 'info' | 'warn' | 'error';
  message: string;
  /** ms until auto-dismiss; 0 = sticky until closed. */
  ttl: number;
}

// A tiny event bus so non-UI code (storage, the audio engine) can surface
// problems without knowing anything about React. App renders the queue.
let nextId = 1;
const listeners = new Set<(n: Notice) => void>();

export function notify(
  kind: Notice['kind'],
  message: string,
  ttl = 6000
): void {
  const n: Notice = { id: nextId++, kind, message, ttl };
  listeners.forEach((l) => l(n));
}

export function onNotice(cb: (n: Notice) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
