export type QueuedSync = { id: string; label: string };

type SyncSnapshot = {
  online: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  queued: QueuedSync[];
};

type SyncListener = () => void;

let online = typeof navigator !== "undefined" ? navigator.onLine : true;
let syncing = false;
let lastSyncedAt: number | null = null;
let queued: QueuedSync[] = [];
/** Stable reference until a field actually changes (required by useSyncExternalStore). */
let snapshot: SyncSnapshot = { online, syncing, lastSyncedAt, queued };
const listeners = new Set<SyncListener>();

function queuedEqual(a: QueuedSync[], b: QueuedSync[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].label !== b[i].label) return false;
  }
  return true;
}

function emit() {
  const next: SyncSnapshot = { online, syncing, lastSyncedAt, queued };
  if (
    next.online === snapshot.online &&
    next.syncing === snapshot.syncing &&
    next.lastSyncedAt === snapshot.lastSyncedAt &&
    queuedEqual(next.queued, snapshot.queued)
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function setOnlineStatus(next: boolean) {
  if (online === next) return;
  online = next;
  emit();
}

export function setSyncing(next: boolean) {
  if (syncing === next) return;
  syncing = next;
  emit();
}

export function setQueuedMutations(next: QueuedSync[]) {
  if (queuedEqual(queued, next)) return;
  queued = next;
  emit();
}

export function markSynced() {
  const at = Date.now();
  if (
    syncing === false &&
    lastSyncedAt !== null &&
    at - lastSyncedAt < 250 &&
    queued.length === 0
  ) {
    return;
  }
  lastSyncedAt = at;
  syncing = false;
  emit();
}
