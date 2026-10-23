/// <reference lib="webworker" />
// Background removal runs here, off the main thread, so the form stays
// responsive while the model works. The model files (~40 MB, cached by the
// browser after the first visit) come from the library's default CDN.
import { removeBackground } from "@imgly/background-removal";

type Request = { id: number; file: Blob };

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, file } = event.data;
  try {
    const out = await removeBackground(file, {
      device: "cpu",
      model: "isnet_quint8",
      output: { format: "image/png" },
      progress: (key: string, current: number, total: number) => {
        (self as DedicatedWorkerGlobalScope).postMessage({ id, type: "progress", key, current, total });
      },
    });
    (self as DedicatedWorkerGlobalScope).postMessage({ id, type: "done", blob: out });
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
