/** Session-scoped UI retention for SoftLink back (filters / scroll). */

function key(scope: string) {
  return `rk-list-state-${scope}`;
}

export function loadListState<T>(scope: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(scope));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveListState<T>(scope: string, value: T): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key(scope), JSON.stringify(value));
  } catch {
    // quota / private mode — ignore
  }
}

export function clearListState(scope: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key(scope));
  } catch {
    // ignore
  }
}
