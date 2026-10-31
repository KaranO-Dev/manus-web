import { SITE_URL } from "@/lib/site";

/*
  llms.txt (llmstxt.org): what MANUS is, in plain Markdown for language models. Prerendered at build
  time with the version from package.json, so it always matches the release.
*/
export const dynamic = "force-static";

const VERSION = process.env.NEXT_PUBLIC_MANUS_VERSION;

const BODY = `# MANUS

> MANUS is a hand-tracked laser-harp synth that runs in the browser. You play eight beams of light with your hands through a webcam, or with a mouse and keys. Hands are tracked on the device and camera frames are never uploaded. It is live and free at ${SITE_URL}, version ${VERSION}, with nothing to install.

Designed and built by Karan Oroumchi.

## What it is

- Eight laser-harp beams over the camera picture. An open hand aims without a sound, and a pinch of thumb and index plays the beam under the fingertip. Glide strum plays every beam the hand crosses.
- The four left beams set the chord (I, bVI, IV, V) and play the bass. The four right beams play the lead.
- Hand height is a theremin: it sweeps a filter, a vowel and the reverb. The Theremin button or the T key turns height off, and the setting is kept for the next visit.
- Twelve voices in two banks, built from studio samples and a synth layer. Four backing riffs, six looks drawn behind the hands, an 8-second tape looper, and a clip recorder that saves the picture and the sound as a WebM file.
- Play Along is a song book of three tunes: Field Song (72 BPM), Harbor (80) and Night Step (64). Notes fall as gems to a white line and a pinch on time scores them. Replay misses holds each missed beat until you catch it.
- Expert mode adds a synth and envelope rack, a 16-step beam sequencer, the scales and MIDI out. Recall keeps four patches and a setlist, calibrates the pinch and can follow an external MIDI clock.

## How to try it

- Open ${SITE_URL} in a desktop browser. Allow the camera to play with your hands, or click and drag across the beams with the mouse.
- The stage needs a browser with WebGL 2. A webcam is only needed to play with your hands. It plays best on a laptop, and on a phone the console stacks under the stage.
- Keys: A, S, D and F play the chords and bass. J, K, L and the semicolon key play the lead beams. 1 to 6 pick a voice and B switches between bank A and B. Space holds the drone, G fires the drone and a five-voice chord, and Z holds the stutter while it is down. Every toolbar button has a key, shown on the button: P plays a riff, N plays along, I switches between pinch play and glide strum, T turns the theremin on or off, E opens Recall, Q switches between quantize and hand guide, V records a clip, C turns the camera on or off. R records the tape loop and Delete clears it. X switches between Simple and Expert, M connects MIDI in Expert, W opens the lesson, ? opens the gesture guide, which lists every key, and Escape closes it. The E1 to E4 knobs also take the arrow keys.
- A three-step lesson opens on the first visit, and the Guide button explains each gesture.

## Privacy

- Hand tracking runs in the page with MediaPipe Hand Landmarker in WebAssembly, and it loads only when the camera is turned on. The model, the code and the sounds all load from manus.karano.me.
- It installs as an app, and once opened it plays without a connection.
- Camera frames and sound stay in the browser. There is no account. Vercel Web Analytics counts page views without cookies, and a few steps of play, once per visit each: the camera turned on or refused, the first note, the first song, the first gem caught, and a browser coming back. It sees nothing of the camera or the sound. Patches, tempos and the pinch calibration are kept in the browser's local storage.

## Read more

- [How it was made](https://karano.me/work/manus): the case study on karano.me.
- [Karan Oroumchi](https://karano.me): the portfolio, with its own [llms.txt](https://karano.me/llms.txt).
- [karano.me MCP server](https://karano.me/mcp): a public, read-only MCP server over Streamable HTTP. Call get_project with slug "manus" for the case study.
`;

export function GET() {
  return new Response(BODY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
