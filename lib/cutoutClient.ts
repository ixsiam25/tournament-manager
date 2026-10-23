"use client";

/** Browser-side wrapper around the background-removal worker. One shared
 * worker; each call gets its own request id so a newer photo supersedes an
 * older one cleanly. */
export type CutoutProgress = { fraction: number };

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("./cutout.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

export function removeBackgroundInWorker(
  file: Blob,
  onProgress?: (p: CutoutProgress) => void,
): { promise: Promise<Blob>; cancel: () => void } {
  const w = getWorker();
  const id = nextId++;
  let cancelled = false;
  let cleanup = () => {};

  const promise = new Promise<Blob>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { id: number; type: string; blob?: Blob; message?: string; current?: number; total?: number };
      if (msg.id !== id) return;
      if (msg.type === "progress" && onProgress && msg.total) {
        onProgress({ fraction: Math.min(1, (msg.current ?? 0) / msg.total) });
      } else if (msg.type === "done" && msg.blob) {
        cleanup();
        resolve(msg.blob);
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message ?? "Background removal failed"));
      }
    };
    const errorHandler = (e: ErrorEvent) => {
      cleanup();
      // A crashed worker can't be reused.
      worker = null;
      reject(new Error(e.message || "Background removal crashed"));
    };
    cleanup = () => {
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
    };
    w.addEventListener("message", handler);
    w.addEventListener("error", errorHandler);
    w.postMessage({ id, file });
  });

  return {
    promise: promise.then((b) => {
      if (cancelled) throw new Error("cancelled");
      return b;
    }),
    cancel: () => {
      cancelled = true;
      cleanup();
    },
  };
}
