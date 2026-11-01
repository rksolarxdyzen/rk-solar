import { del, get, keys, set } from "idb-keyval";
import { setQueuedMutations } from "@/lib/local-first/sync-status";

export type QueuedMutation = {
  id: string;
  userId: string;
  label: string;
  path: string;
  method: string;
  body?: unknown;
  createdAt: number;
};

const queuePrefix = "rk-mutations-";

function storageKey(userId: string): string {
  return `${queuePrefix}${userId}`;
}

let memory: QueuedMutation[] = [];
let flushing = false;

function publish(): void {
  setQueuedMutations(memory.map((item) => ({ id: item.id, label: item.label })));
}

async function persist(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const items = memory.filter((item) => item.userId === userId);
  if (items.length === 0) {
    await del(storageKey(userId));
    return;
  }
  await set(storageKey(userId), items);
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("offline")
    );
  }
  return false;
}

export async function loadOfflineQueue(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    memory = memory.filter((item) => item.userId === userId);
    publish();
    return;
  }
  const stored = (await get(storageKey(userId))) as QueuedMutation[] | undefined;
  memory = [
    ...memory.filter((item) => item.userId !== userId),
    ...((Array.isArray(stored) ? stored : []) as QueuedMutation[]),
  ];
  publish();
}

export async function enqueueMutation(
  entry: Omit<QueuedMutation, "createdAt"> & { createdAt?: number }
): Promise<void> {
  const item: QueuedMutation = {
    ...entry,
    createdAt: entry.createdAt ?? Date.now(),
  };
  memory = [...memory.filter((current) => current.id !== item.id), item].sort(
    (a, b) => a.createdAt - b.createdAt
  );
  publish();
  await persist(item.userId);
}

export function getOfflineQueue(userId?: string): QueuedMutation[] {
  return userId ? memory.filter((item) => item.userId === userId) : memory;
}

export function isFlushingQueue(): boolean {
  return flushing;
}

export async function flushOfflineQueue(
  userId: string,
  onFlushed?: () => void
): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const pending = memory.filter((item) => item.userId === userId);
  if (pending.length === 0) return;
  flushing = true;
  publish();
  try {
    for (const item of pending) {
      try {
        const res = await fetch(item.path, {
          method: item.method,
          headers:
            item.body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
          credentials: "same-origin",
        });
        if (!res.ok) {
          throw new Error(`Sync failed (${res.status})`);
        }
        memory = memory.filter((current) => current.id !== item.id);
        publish();
        await persist(userId);
      } catch (error) {
        if (isNetworkError(error)) return;
        memory = memory.filter((current) => current.id !== item.id);
        publish();
        await persist(userId);
        throw error;
      }
    }
    onFlushed?.();
  } finally {
    flushing = false;
    publish();
  }
}

export async function wipeOfflineQueues(): Promise<void> {
  memory = [];
  publish();
  if (typeof indexedDB === "undefined") return;
  const all = await keys();
  await Promise.all(
    all
      .filter((key) => String(key).startsWith(queuePrefix))
      .map((key) => del(key))
  );
}
