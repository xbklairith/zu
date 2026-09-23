// The page's layout engine: ELK in an inline Web Worker (a blob: URL, allowed
// by the CSP's worker-src). A worker that cannot start fires an error event;
// that rejects the layout instead of leaving the page waiting.
import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker&inline";
import { superseding, type Stoppable } from "./layout";

function workerElk(): Stoppable {
  let fail: (e: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  failed.catch(() => {});
  const elk = new ELK({
    workerFactory: () => {
      const w = new ElkWorker();
      w.addEventListener("error", (e) => fail(new Error(`layout worker failed: ${e.message || "blocked"}`)));
      return w;
    },
  });
  return { layout: (g) => Promise.race([elk.layout(g), failed]), terminateWorker: () => elk.terminateWorker() };
}

export const pageEngine = () => superseding(workerElk);
