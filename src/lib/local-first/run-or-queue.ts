import {
  enqueueMutation,
  isNetworkError,
} from "@/lib/local-first/offline-queue";
import { crmFetch, CrmFetchError } from "@/lib/local-first/crm-fetch";

export type RunOrQueueResult<T> =
  | { ok: true; queued: false; data: T }
  | { ok: true; queued: true }
  | { ok: false; error: string };

/**
 * Call a local-first JSON API; if offline / network fails, enqueue for flush.
 * Keeps caller optimistic UI intact when queued.
 */
export async function runCrmMutationOrQueue<T>(opts: {
  userId: string;
  mutationId: string;
  label: string;
  path: string;
  method: string;
  body?: unknown;
}): Promise<RunOrQueueResult<T>> {
  const entry = {
    id: opts.mutationId,
    userId: opts.userId,
    label: opts.label,
    path: opts.path,
    method: opts.method,
    body: opts.body,
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueueMutation(entry);
    return { ok: true, queued: true };
  }

  try {
    const data = await crmFetch<T>(
      opts.path,
      opts.body === undefined
        ? { method: opts.method }
        : { method: opts.method, body: JSON.stringify(opts.body) }
    );
    return { ok: true, queued: false, data };
  } catch (error) {
    if (isNetworkError(error)) {
      await enqueueMutation(entry);
      return { ok: true, queued: true };
    }
    if (error instanceof CrmFetchError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}
