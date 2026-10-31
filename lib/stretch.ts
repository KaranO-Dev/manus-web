/*
  A riff's backing stem at another tempo: overlap-add of 2048-sample Hann windows, one about every 512 samples of
  the stem, laid down at the same share of the output and divided by the windows' sum. `stretch` is output length
  over input length. Pitch stays put because the windows are not resampled.

  The stem is a loop, so the windows go round it: those running past the end read from the stem's start and lay
  down over the output's start. The stretched take then loops as smoothly as the stem does, with no silent tail and
  no fade at the seam. The Android app's `dsp/stretch.h` does the same.
*/

const WIN = 2048;
const HOP = 512;

let hann: Float32Array | null = null;

function hannWindow(): Float32Array {
  if (!hann) {
    hann = new Float32Array(WIN);
    for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
  }
  return hann;
}

/** Each channel of a looping stem, stretched to floor(length × stretch) samples. At a stretch of 1 the channels come back as they are */
export function stretchLoop(channels: Float32Array<ArrayBuffer>[], stretch: number): Float32Array<ArrayBuffer>[] {
  const inLen = channels[0]?.length ?? 0;
  if (stretch === 1 || inLen === 0) return channels;
  const outLen = Math.max(1, Math.floor(inLen * stretch));
  const windows = Math.max(1, Math.round(inLen / HOP));
  const w = hannWindow();
  const outputs = channels.map(() => new Float32Array(outLen));
  const weight = new Float32Array(outLen);
  for (let k = 0; k < windows; k++) {
    const inPos = Math.round((k * inLen) / windows);
    const outPos = Math.round((k * outLen) / windows);
    for (let i = 0; i < WIN; i++) {
      const from = (inPos + i) % inLen;
      const to = (outPos + i) % outLen;
      weight[to] += w[i];
      for (let c = 0; c < channels.length; c++) outputs[c][to] += channels[c][from] * w[i];
    }
  }
  for (let i = 0; i < outLen; i++) {
    if (weight[i] > 0.0001) for (const out of outputs) out[i] /= weight[i];
  }
  return outputs;
}
