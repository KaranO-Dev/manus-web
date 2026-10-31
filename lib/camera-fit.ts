/*
  How the camera's picture fills the stage.

  The stage takes whatever shape the window leaves it, and the camera hands over its own: 16:9 from most
  webcams, 4:3 from some, and a tall picture from a phone or tablet held upright. Stretched to the stage,
  faces and hands came out squeezed, so the stage shows the middle of the picture at its true shape, as a
  viewfinder does: the sides of a wider picture are cut, or the top and bottom of a taller one. The hands
  go through the same crop, so they stay on the picture. The Android app does the same (core/CameraFit.kt).
*/

/** The part of the camera's picture the stage shows */
export interface CameraFit {
  /** The part of its width, 0..1 */
  scaleX: number;
  /** The part of its height, 0..1 */
  scaleY: number;
}

export const WHOLE: CameraFit = { scaleX: 1, scaleY: 1 };

/**
 * The crop for a camera picture and a stage, each given as width over height. Shapes within 1% of each
 * other show the whole picture: the canvas rounds to whole pixels.
 */
export function coverFit(camera: number, stage: number): CameraFit {
  if (!(camera > 0) || !(stage > 0) || Math.abs(camera / stage - 1) < 0.01) return WHOLE;
  return camera < stage ? { scaleX: 1, scaleY: camera / stage } : { scaleX: stage / camera, scaleY: 1 };
}

/** A point in the camera's picture (0..1) where the stage shows it; off the stage is outside 0..1 */
export function toStage<P extends { x: number; y: number; z: number }>(p: P, fit: CameraFit): P {
  return { ...p, x: 0.5 + (p.x - 0.5) / fit.scaleX, y: 0.5 + (p.y - 0.5) / fit.scaleY, z: p.z / fit.scaleX };
}
