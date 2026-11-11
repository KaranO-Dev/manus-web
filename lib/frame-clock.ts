/*
  When each camera frame was taken, on the page's clock.

  The page hears of a new frame only when the screen next refreshes, so the times it sees are rounded to the
  screen's rhythm: a 30-frame camera on a 60 Hz screen looks like steps of 17, 33 and 50 ms. The camera stamps
  each frame with its own time, and those stamps are evenly spaced. This clock keeps the camera's spacing and
  hangs it on the page's clock, which is what the smoothing filter needs: it reads speed from the time between
  two frames.
*/

/** The two clocks may sit this far apart before the camera's time is hung on the page's clock afresh */
const DRIFT_MS = 100;

export class FrameClock {
  private anchorPageMs = 0;
  private anchorMediaSec = 0;
  private lastMediaSec = -Infinity;
  private lastMs = -Infinity;

  /**
   * `pageMs` is when the page saw the frame and `mediaSec` the camera's stamp for it, if the browser gives one.
   * The answer is always later than the one before.
   */
  public stamp(pageMs: number, mediaSec?: number): number {
    let t = pageMs;
    if (mediaSec !== undefined && Number.isFinite(mediaSec) && mediaSec > this.lastMediaSec) {
      const first = this.lastMediaSec === -Infinity;
      this.lastMediaSec = mediaSec;
      t = this.anchorPageMs + (mediaSec - this.anchorMediaSec) * 1000;
      if (first || Math.abs(t - pageMs) > DRIFT_MS) {
        this.anchorPageMs = pageMs;
        this.anchorMediaSec = mediaSec;
        t = pageMs;
      }
    } else {
      // No stamp, or one that did not move on: the page's own time, and the next stamped frame starts afresh
      this.lastMediaSec = -Infinity;
    }
    this.lastMs = t > this.lastMs ? t : this.lastMs + 1;
    return this.lastMs;
  }
}
