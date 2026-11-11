/*
  What the page's tracker (lib/tracker.ts) and the tracker's own thread (lib/tracker.worker.ts) share: how the
  hand landmarker is made, and the messages that pass between the two.
*/

import type { HandLandmarker } from "@mediapipe/tasks-vision";

type Vision = Pick<
  typeof import("@mediapipe/tasks-vision"),
  "FilesetResolver" | "HandLandmarker"
>;

export type Delegate = "GPU" | "CPU";

/** The model and MediaPipe's runtime are served from this site (public/models, public/wasm), never from a CDN */
const MODEL_PATH = "/models/hand_landmarker.task";
const WASM_PATH = "/wasm";

/**
 * `moduleWasm` picks the runtime file that loads as a module, which is the one a module worker can import. On
 * the GPU the confidences are raised a little from MediaPipe's 0.5; on the CPU they are left as they come.
 */
export async function createLandmarker(
  vision: Vision,
  delegate: Delegate,
  moduleWasm: boolean
): Promise<HandLandmarker> {
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH, moduleWasm);
  return vision.HandLandmarker.createFromOptions(
    fileset,
    delegate === "GPU"
      ? {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        }
      : {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: "VIDEO",
          numHands: 2,
        }
  );
}

/** Numbers per hand in a result: 21 landmarks of x, y, z */
export const HAND_FLOATS = 21 * 3;

export type ToWorker =
  | { type: "init"; delegate: Delegate }
  | { type: "frame"; id: number; image: VideoFrame; stampMs: number };

export type FromWorker =
  /** The thread's script has loaded and it has started on the runtime and the model */
  | { type: "alive" }
  | { type: "ready" }
  | { type: "failed"; reason: string }
  /** `data` holds `count` hands of HAND_FLOATS numbers each, in the camera frame's 0..1 */
  | { type: "hands"; id: number; count: number; data: Float32Array; detectMs: number };
