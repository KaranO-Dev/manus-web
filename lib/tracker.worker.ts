/*
  The hand tracker on its own thread. The page sends one camera frame at a time; this thread finds the hands in
  it and sends their landmarks back, so the page's drawing and sound never wait for the tracker.
*/

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  createLandmarker,
  HAND_FLOATS,
  type FromWorker,
  type ToWorker,
} from "./tracker-shared";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  importScripts(...urls: string[]): void;
  import?: (url: string) => Promise<unknown>;
};

// A classic worker loads MediaPipe's runtime with importScripts. A module worker has none (the call throws), and
// MediaPipe then asks `self.import` for the file. The bundler has to leave that import as it is: the runtime is
// served from /wasm and is not part of the bundle
let moduleWorker = false;
try {
  scope.importScripts();
} catch {
  moduleWorker = true;
}
scope.import = (url: string) =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);

let landmarker: HandLandmarker | null = null;

scope.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    scope.postMessage({ type: "alive" });
    createLandmarker({ FilesetResolver, HandLandmarker }, msg.delegate, moduleWorker).then(
      (made) => {
        landmarker = made;
        scope.postMessage({ type: "ready" });
      },
      (err) => scope.postMessage({ type: "failed", reason: String(err) })
    );
    return;
  }

  // One frame in, one answer out, always: the page offers its next frame when this answer arrives
  const startedMs = performance.now();
  let count = 0;
  let data = new Float32Array(0);
  try {
    const hands = landmarker?.detectForVideo(msg.image, msg.stampMs).landmarks ?? [];
    count = hands.length;
    data = new Float32Array(count * HAND_FLOATS);
    let i = 0;
    for (const hand of hands) {
      for (const lm of hand) {
        data[i++] = lm.x;
        data[i++] = lm.y;
        data[i++] = lm.z;
      }
    }
  } catch {
    count = 0;
    data = new Float32Array(0);
  } finally {
    msg.image.close();
  }
  scope.postMessage(
    { type: "hands", id: msg.id, count, data, detectMs: performance.now() - startedMs },
    [data.buffer]
  );
};
