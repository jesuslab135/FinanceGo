type Listener = () => void;

let token: string | null = null;
const listeners = new Set<Listener>();

/** The access token lives only in memory; a reload restores it via the refresh cookie. */
export const tokenStore = {
  get: () => token,
  set(t: string | null) {
    token = t;
    listeners.forEach((l) => l());
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
