/*
  The hand tracker as the stage sees it: offer a camera frame, get the hands back.

  The tracker can run in two places. On the page's thread, finding the hands in a frame holds the page's drawing
  up for as long as it takes, but the answer comes soonest. On a thread of its own (lib/tracker.worker.ts) the
  page never waits, but the tracker and the stage then use the GPU at the same moment and each answer takes
  longer. Measured in Chrome on an M4 Pro Mac with a 30-frame camera, from a frame arriving to its hands being
  read: 27 ms on the page with the stage at 52 frames a second, 72 ms on the thread with the stage at 60 (and
  44 ms on the thread with the CPU doing the work). An instrument wants the short answer, so the stage asks for
  the page's thread, and `?tracker=worker` in the address asks for the other, for trying on other machines: the
  footer's "seen" figure is this time.

  Either way one frame is with the tracker at a time: a frame that arrives while it is busy is dropped, and the
  next result is from the newest frame there was. The GPU is tried before the CPU. A thread that stops answering
  is given up on, and tracking carries on from the page.
*/

import type { Landmark } from "./hand-pipeline";
import {
  createLandmarker,
  HAND_FLOATS,
  type Delegate,
  type FromWorker,
  type ToWorker,
} from "./tracker-shared";

export type TrackerMode = "worker" | "main";

export interface TrackerResult {
  /** Up to two hands of 21 landmarks, in 0..1 of the camera frame, not mirrored */
  hands: Landmark[][];
  /** The time the frame was offered with */
  capturedAtMs: number;
  /** How long the tracker took over the frame */
  detectMs: number;
}

export interface Tracker {
  readonly mode: TrackerMode;
  readonly delegate: Delegate;
  /** A frame is with the tracker: an offer now would be turned down */
  readonly busy: boolean;
  /** Hands the video's current frame to the tracker. False when the frame was not taken */
  offer(video: HTMLVideoElement, capturedAtMs: number): boolean;
  close(): void;
}

type OnResult = (result: TrackerResult) => void;

/** The thread's script should load and answer in this long; the runtime and the model come after */
const ALIVE_TIMEOUT_MS = 8000;
/** A frame the thread hasn't answered in this long means it is stuck. Its first frame can take over a second */
const ANSWER_TIMEOUT_MS = 4000;

/** MediaPipe wants each frame's time later than the last one's */
function nextStamp(wanted: number, last: number): number {
  return wanted > last ? wanted : last + 1;
}

export function canTrackInWorker(): boolean {
  return (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof VideoFrame === "function"
  );
}

function unpack(count: number, data: Float32Array): Landmark[][] {
  const hands: Landmark[][] = [];
  for (let h = 0; h < count; h++) {
    const hand: Landmark[] = [];
    for (let i = h * HAND_FLOATS; i < (h + 1) * HAND_FLOATS; i += 3) {
      hand.push({ x: data[i], y: data[i + 1], z: data[i + 2] });
    }
    hands.push(hand);
  }
  return hands;
}

function startWorkerTracker(
  delegate: Delegate,
  onResult: OnResult,
  onLost: () => void
): Promise<Tracker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./tracker.worker.ts", import.meta.url), {
      type: "module",
    });
    const send = (msg: ToWorker, transfer: Transferable[] = []) =>
      worker.postMessage(msg, transfer);

    let ready = false;
    let over = false;
    let busy = false;
    let sentId = 0;
    let sentAtMs = 0;
    let lastStamp = 0;
    let answerTimer = 0;
    let aliveTimer = window.setTimeout(() => stop("the tracker's thread did not start"), ALIVE_TIMEOUT_MS);

    /** Ends the thread. Before it was ready that fails the start; after, the stage is told it is lost */
    function stop(reason?: string) {
      if (over) return;
      over = true;
      window.clearTimeout(aliveTimer);
      window.clearTimeout(answerTimer);
      worker.terminate();
      if (reason === undefined) return;
      if (ready) onLost();
      else reject(new Error(reason));
    }

    worker.onerror = (e) => {
      e.preventDefault?.();
      stop(e.message || "the tracker's thread failed");
    };
    worker.onmessageerror = () => stop("the tracker's thread sent something unreadable");

    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      if (over) return;
      const msg = e.data;
      if (msg.type === "alive") {
        window.clearTimeout(aliveTimer);
        aliveTimer = 0;
      } else if (msg.type === "failed") {
        stop(msg.reason);
      } else if (msg.type === "ready") {
        ready = true;
        resolve({
          mode: "worker",
          delegate,
          get busy() {
            return busy;
          },
          offer(video, capturedAtMs) {
            if (over || busy) return false;
            let image: VideoFrame;
            try {
              image = new VideoFrame(video);
            } catch {
              // no frame to take yet, or the stream has just ended
              return false;
            }
            busy = true;
            sentId += 1;
            sentAtMs = capturedAtMs;
            lastStamp = nextStamp(capturedAtMs, lastStamp);
            send({ type: "frame", id: sentId, image, stampMs: lastStamp }, [image]);
            answerTimer = window.setTimeout(
              () => stop("the tracker's thread stopped answering"),
              ANSWER_TIMEOUT_MS
            );
            return true;
          },
          close: () => stop(),
        });
      } else if (msg.type === "hands" && msg.id === sentId) {
        window.clearTimeout(answerTimer);
        busy = false;
        onResult({
          hands: unpack(msg.count, msg.data),
          capturedAtMs: sentAtMs,
          detectMs: msg.detectMs,
        });
      }
    };

    send({ type: "init", delegate });
  });
}

async function startMainTracker(delegate: Delegate, onResult: OnResult): Promise<Tracker> {
  const vision = await import("@mediapipe/tasks-vision");
  const landmarker = await createLandmarker(vision, delegate, false);
  let over = false;
  let busy = false;
  let lastStamp = 0;
  return {
    mode: "main",
    delegate,
    get busy() {
      return busy;
    },
    offer(video, capturedAtMs) {
      if (over || busy) return false;
      busy = true;
      lastStamp = nextStamp(capturedAtMs, lastStamp);
      const startedMs = performance.now();
      let hands: Landmark[][] = [];
      try {
        hands = landmarker.detectForVideo(video, lastStamp).landmarks ?? [];
      } catch {
        hands = [];
      }
      busy = false;
      onResult({ hands, capturedAtMs, detectMs: performance.now() - startedMs });
      return true;
    },
    close() {
      if (over) return;
      over = true;
      try {
        landmarker.close();
      } catch {}
    },
  };
}

/**
 * Starts hand tracking, on its own thread when `prefer` says "worker" and the browser can. `onChange` is told
 * when a stuck thread has been replaced by the page's tracker, and `onLost` when there is no tracker left.
 * Rejects when no tracker could be started at all.
 */
export async function startTracker(opts: {
  prefer: TrackerMode;
  onResult: OnResult;
  onChange?: () => void;
  onLost?: () => void;
}): Promise<Tracker> {
  let current: Tracker | null = null;
  let closed = false;

  async function firstOf(attempts: [TrackerMode, Delegate][]): Promise<Tracker> {
    let lastError: unknown = new Error("no tracker");
    for (const [mode, delegate] of attempts) {
      try {
        return mode === "worker"
          ? await startWorkerTracker(delegate, opts.onResult, replaceLostThread)
          : await startMainTracker(delegate, opts.onResult);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  function replaceLostThread() {
    current = null;
    if (closed) return;
    firstOf([
      ["main", "GPU"],
      ["main", "CPU"],
    ]).then(
      (tracker) => {
        if (closed) tracker.close();
        else {
          current = tracker;
          opts.onChange?.();
        }
      },
      () => opts.onLost?.()
    );
  }

  const inWorker = opts.prefer === "worker" && canTrackInWorker();
  current = await firstOf(
    inWorker
      ? [
          ["worker", "GPU"],
          ["main", "GPU"],
          ["worker", "CPU"],
          ["main", "CPU"],
        ]
      : [
          ["main", "GPU"],
          ["main", "CPU"],
        ]
  );

  return {
    get mode() {
      return current?.mode ?? "main";
    },
    get delegate() {
      return current?.delegate ?? "CPU";
    },
    get busy() {
      return current ? current.busy : true;
    },
    offer(video, capturedAtMs) {
      return current ? current.offer(video, capturedAtMs) : false;
    },
    close() {
      closed = true;
      current?.close();
      current = null;
    },
  };
}
