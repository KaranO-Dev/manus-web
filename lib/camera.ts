/*
  Which selfie camera faces the player.

  A phone has one selfie camera, and asking the browser for the front camera gets it. A book-style foldable,
  such as a Galaxy Z Fold, has two, one for each screen, and Chrome on Android always hands out the first:
  the outer screen's, which faces away from the player once the phone is open. So with exactly two, the
  screen in use decides. A foldable's inner screen is close to square; its outer screen is tall and narrow.
*/

/** The parts of a MediaDeviceInfo the choice needs */
export interface CameraDevice {
  deviceId: string;
  kind: string;
  label: string;
}

/** A screen whose long side is under this many times its short side is a foldable's inner screen */
export const UNFOLDED_MAX_RATIO = 1.5;

/**
 * The deviceId of the selfie camera for a screen of this size, or null to let the browser pick its own
 * front camera (one selfie camera, or none, or labels not readable yet: they come with the camera permission).
 */
export function pickSelfieCamera(devices: CameraDevice[], screenWidth: number, screenHeight: number): string | null {
  const selfies = devices
    .filter((d) => d.kind === "videoinput" && d.deviceId && /front/i.test(d.label))
    .sort((a, b) => cameraNumber(a.label) - cameraNumber(b.label));
  const long = Math.max(screenWidth, screenHeight);
  const short = Math.min(screenWidth, screenHeight);
  if (selfies.length !== 2 || short <= 0) return null;
  return long / short < UNFOLDED_MAX_RATIO ? selfies[1].deviceId : selfies[0].deviceId;
}

/** Android names its cameras "camera2 1, facing front" (older Chrome: "camera 1, facing front") */
function cameraNumber(label: string): number {
  const m = label.match(/camera2?\s+(\d+)/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}
