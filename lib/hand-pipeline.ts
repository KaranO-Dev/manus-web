/*
  From the tracker's hands to the hands the stage plays. The tracker gives up to two hands in camera
  coordinates, in no fixed order. Each one is mirrored, fitted to the stage, given its slot and its side, and
  smoothed. The unsmoothed copy goes along too: the pinch is read from it, so a note doesn't wait for the filter.
*/

import type { HandSide } from "./audio";
import { toStage, type CameraFit } from "./camera-fit";
import { HandLandmarkSmoother, HandSlots } from "./gestures";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHand {
  slot: 0 | 1;
  side: HandSide;
  /** A hand this slot did not hold a moment ago */
  fresh: boolean;
  /** Stage coordinates, smoothed */
  landmarks: Landmark[];
  /** Stage coordinates as the tracker gave them */
  fast: Landmark[];
}

/** A slot's filters start over when its hand was out of view this long: what they remember is somewhere else */
const FILTER_GAP_MS = 250;

export class HandPipeline {
  private slots = new HandSlots();
  private smoother = new HandLandmarkSmoother();

  /** `raw` is the tracker's landmarks (0..1 of the camera frame, not mirrored); `tMs` is when the frame was taken */
  public track(raw: Landmark[][], fit: CameraFit, tMs: number): TrackedHand[] {
    const staged = raw
      .filter((hand) => hand.length >= 21)
      .slice(0, 2)
      .map((hand) =>
        hand.map((lm) => toStage({ x: 1.0 - lm.x, y: lm.y, z: lm.z }, fit))
      );
    const assigned = this.slots.assign(
      staged.map((hand) => hand[0]),
      tMs
    );
    return staged.map((fast, i) => {
      const { slot, side, fresh, gapMs } = assigned[i];
      if (fresh || gapMs > FILTER_GAP_MS) this.smoother.reset(slot);
      return {
        slot,
        side,
        fresh,
        landmarks: this.smoother.smooth(slot, fast, tMs / 1000),
        fast,
      };
    });
  }

  /** Forget both hands, for when the camera stops or starts */
  public clear() {
    this.slots.clear();
    this.smoother.reset(0);
    this.smoother.reset(1);
  }
}
