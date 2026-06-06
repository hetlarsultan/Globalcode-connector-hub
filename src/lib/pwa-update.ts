// Bridge between service worker registration and the React UpdateDialog.
type Payload = { current: string; next: string; activate: () => void };
type Listener = (p: Payload | null) => void;

let current: Payload | null = null;
const listeners = new Set<Listener>();

export function setPendingUpdate(p: Payload | null) {
  current = p;
  listeners.forEach((fn) => fn(p));
}

export function subscribePendingUpdate(fn: Listener) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
