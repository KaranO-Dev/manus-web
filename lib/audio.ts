/*
  The audio engine: one Web Audio graph and everything that plays through it.

  Each of the 12 voices is four pitched samples (/samples/surge) layered with oscillators, tuned by the
  chosen temperament, mode and chord root. Notes go through a lowpass filter, tanh saturation, a vowel
  (formant) path, a chorus, a delay and a convolution reverb. The same audio clock drives the rhythms
  (time-stretched backing stems or beam songs), the hit grading, the 8 s tape looper and the optional
  MIDI out and MIDI clock in.
*/

export type VoiceId =
  | "lute"
  | "organ"
  | "hurdy"
  | "cantus"
  | "psaltery"
  | "carillon"
  | "pluck"
  | "fmbell"
  | "subbass"
  | "brass"
  | "pwm"
  | "choir";

export type VoiceBank = "A" | "B";
export type EngineMode = "surge" | "hybrid" | "synth";
export type UIMode = "simple" | "expert";
export type PlayQuantizeMode = "quantized" | "free" | "guide";
export type TemperamentId = "equal" | "just" | "pythagorean" | "meantone";
export type ModeId = "dorian" | "phrygian" | "lydian" | "mixolydian";
export type RhythmId =
  | "off"
  | "saltarello"
  | "pavane"
  | "macabre"
  | "solar"
  | "anthem"
  | "harbor"
  | "night";
export type FingerIndex = 0 | 1 | 2 | 3;
export type HandSide = "left" | "right";

export interface VoiceSpec {
  id: VoiceId;
  bank: VoiceBank;
  roman: string;
  name: string;
  latin: string;
  surgePatch: string;
  desc: string;
}

export interface SynthParams {
  attackNorm: number;   // 0..1, maps to 0.004..0.284 s
  releaseNorm: number;  // 0..1, maps to 0.28..2.13 s
  subLevel: number;     // 0..1, gain of the sub oscillator (skipped at 0.02 or less)
  driveNorm: number;    // 0..1, tanh saturation amount 1..3.8
  chorusMix: number;    // 0..1, chorus wet gain 0..0.65
  bpm: number;          // the Expert knob spans 80..150; applySongBpm clamps to 72..168 (48..110 for beam songs)
}

export interface TemperamentSpec {
  id: TemperamentId;
  code: string;
  name: string;
  era: string;
  centsOffset: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

export interface ModeSpec {
  id: ModeId;
  roman: string;
  name: string;
  rootNote: string;
  semitonesLeft: [number, number, number, number];
  semitonesRight: [number, number, number, number];
  solmizationLeft: [string, string, string, string];
  solmizationRight: [string, string, string, string];
  noteNamesLeft: [string, string, string, string];
  noteNamesRight: [string, string, string, string];
}

export interface RhythmSpec {
  id: RhythmId;
  code: string;
  name: string;
  bpm: number;
  loopFile?: string;
  loopDurSec?: number;
  defaultVoice: VoiceId;
  steps: number[];
  desc: string;
}

export interface ChordTransposeSpec {
  index: 0 | 1 | 2 | 3;
  roman: string;
  name: string;
  semitones: number;
}

export const CHORD_ROOTS: ChordTransposeSpec[] = [
  { index: 0, roman: "I", name: "Root (I)", semitones: 0 },
  { index: 1, roman: "bVI", name: "Submediant (bVI)", semitones: -4 },
  { index: 2, roman: "IV", name: "Subdominant (IV)", semitones: 5 },
  { index: 3, roman: "V", name: "Dominant (V)", semitones: 7 },
];

export const VOICES: VoiceSpec[] = [
  // Bank A, voices 01 to 06
  {
    id: "lute",
    bank: "A",
    roman: "01",
    name: "Formant Talkbox",
    latin: "VOX FORMANT",
    surgePatch: "Dual Formant + Vocal Lead",
    desc: "Robotic talkbox & formant vocoder lead (Theremin Y morphs U-O-A-E-I vowels)",
  },
  {
    id: "organ",
    bank: "A",
    roman: "02",
    name: "Grid Unison Saw",
    latin: "HYPER SAW",
    surgePatch: "8-Voice Unison + Sub Brass",
    desc: "Detuned unison supersaw layered with wide cinematic sub-brass",
  },
  {
    id: "hurdy",
    bank: "A",
    roman: "03",
    name: "French Touch Poly",
    latin: "POLY VOYAGER",
    surgePatch: "Analog Polysynth + Funk Bass",
    desc: "Warm 8-voice analog polysynth paired with funky slap bass harmonics",
  },
  {
    id: "cantus",
    bank: "A",
    roman: "04",
    name: "Resonant Acid",
    latin: "ACID LINE",
    surgePatch: "18dB Ladder Acid + Sub",
    desc: "Squelchy resonant acid bass-lead with steep filter envelope bite",
  },
  {
    id: "psaltery",
    bank: "A",
    roman: "05",
    name: "Hard-Sync Solo",
    latin: "SYNC LEAD",
    surgePatch: "Oscillator Sync + Overdrive",
    desc: "Searing hard-synced tapping guitar lead with harmonic edge",
  },
  {
    id: "carillon",
    bank: "A",
    roman: "06",
    name: "Solar Organ",
    latin: "SOLAR PIPE",
    surgePatch: "Ensemble Strings + Pipe Organ",
    desc: "Baroque-futuristic analog string ensemble paired with cathedral organ",
  },

  // Bank B, voices 07 to 12
  {
    id: "pluck",
    bank: "B",
    roman: "07",
    name: "Waveguide Harp",
    latin: "LASER PLUCK",
    surgePatch: "Physical String + Comb",
    desc: "Crisp physical-modeling waveguide string pluck with comb resonance",
  },
  {
    id: "fmbell",
    bank: "B",
    roman: "08",
    name: "Crystal FM Bell",
    latin: "GLASS FM",
    surgePatch: "DX Operator Bell + Shimmer",
    desc: "Crystalline FM harmonic chimes with shimmering high-register air",
  },
  {
    id: "subbass",
    bank: "B",
    roman: "09",
    name: "Sub Reactor",
    latin: "SUB GROWL",
    surgePatch: "Foldback Sub + FM Transient",
    desc: "Massive low-end sub-bass reactor with punchy FM attack transient",
  },
  {
    id: "brass",
    bank: "B",
    roman: "10",
    name: "Horizon Brass",
    latin: "CINEMA BRASS",
    surgePatch: "Poly Brass + Warm Pad",
    desc: "Wide widescreen analog synthesizer brass swell with lush chorus",
  },
  {
    id: "pwm",
    bank: "B",
    roman: "11",
    name: "PWM Matrix",
    latin: "PULSE LEAD",
    surgePatch: "Modulated Pulse + Bit Click",
    desc: "Punchy pulse-width modulated lead for fast arpeggios and stabs",
  },
  {
    id: "choir",
    bank: "B",
    roman: "12",
    name: "Aether Choir",
    latin: "HALO VOX",
    surgePatch: "Formant Choir + Bell Pad",
    desc: "Celestial vocal formant pad layered with harmonic glass bells",
  },
];

export const TEMPERAMENTS: TemperamentSpec[] = [
  {
    id: "equal",
    code: "12-TET",
    name: "Equal Studio",
    era: "Modern 12-tone studio standard",
    centsOffset: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "just",
    code: "PURE",
    name: "Just Harmonic",
    era: "Pure integer chord ratios",
    centsOffset: [0, +11.7, +3.9, +15.6, -13.7, -2.0, -17.5, +2.0, +13.7, -15.6, +17.6, -11.7],
  },
  {
    id: "pythagorean",
    code: "FIFTHS",
    name: "Pythagorean",
    era: "Pure 3:2 fifths tuning",
    centsOffset: [0, -9.8, +3.9, -5.9, +7.8, -2.0, -11.7, +2.0, -7.8, +5.9, -3.9, +9.8],
  },
  {
    id: "meantone",
    code: "VINTAGE",
    name: "¼-Comma Warm",
    era: "Sweet vintage organ thirds",
    centsOffset: [0, -24.0, -6.8, +10.3, -13.7, +3.4, -20.5, -3.4, -27.4, -10.3, +6.8, -17.1],
  },
];

const D3_HZ = 146.832;
const D2_HZ = 73.416;

// The pitches each voice is sampled at, in semitones above D3. A note plays from the nearest zone, repitched
const SAMPLE_ZONES = [
  { id: "z0", semi: 0, hz: 146.832 },   // D3 (MIDI 50)
  { id: "z1", semi: 5, hz: 195.998 },   // G3 (MIDI 55)
  { id: "z2", semi: 12, hz: 293.665 },  // D4 (MIDI 62)
  { id: "z3", semi: 17, hz: 391.995 },  // G4 (MIDI 67)
] as const;

/**
 * Where the theremin rests: the height MANUS opens at. Turned off, the height shapes nothing and what it shaped
 * goes back to rest (the filter open, no vowel, no pitch bend, the reverb at this height) instead of staying where
 * the hand last was. Turned on again, it starts from here and follows the hand.
 */
export const THEREMIN_REST = 0.72;
/** The filter with the theremin off: the top of its sweep, so it colours nothing */
const FILTER_OPEN_HZ = 220 * 44.5;
const FORMANT_MIX = 0.36;

const VOWEL_FORMANTS: { vowel: string; f1: number; f2: number }[] = [
  { vowel: "U", f1: 350, f2: 700 },
  { vowel: "O", f1: 450, f2: 850 },
  { vowel: "A", f1: 750, f2: 1200 },
  { vowel: "E", f1: 530, f2: 1850 },
  { vowel: "I", f1: 310, f2: 2350 },
];

/** The vowel a theremin height picks, U at the bottom to I at the top */
function vowelAt(heightNorm: number) {
  return VOWEL_FORMANTS[
    Math.min(VOWEL_FORMANTS.length - 1, Math.floor(heightNorm * VOWEL_FORMANTS.length))
  ];
}

export const MODES: ModeSpec[] = [
  {
    id: "dorian",
    roman: "SCALE I",
    name: "Dorian Grid (Dm)",
    rootNote: "D",
    semitonesLeft: [0, 3, 5, 7],
    semitonesRight: [10, 12, 15, 19],
    solmizationLeft: ["D3", "F3", "G3", "A3"],
    solmizationRight: ["C4", "D4", "F4", "A4"],
    noteNamesLeft: ["Root I", "bIII", "IV", "V"],
    noteNamesRight: ["bVII", "Oct I", "bIII'", "V'"],
  },
  {
    id: "phrygian",
    roman: "SCALE II",
    name: "Electro Minor (Em)",
    rootNote: "E",
    semitonesLeft: [2, 5, 7, 9],
    semitonesRight: [12, 14, 17, 19],
    solmizationLeft: ["E3", "G3", "A3", "B3"],
    solmizationRight: ["D4", "E4", "G4", "A4"],
    noteNamesLeft: ["Root", "bIII", "IV", "V"],
    noteNamesRight: ["bVII", "Oct", "bIII'", "IV'"],
  },
  {
    id: "lydian",
    roman: "SCALE III",
    name: "Horizon Lydian (F)",
    rootNote: "F",
    semitonesLeft: [3, 7, 10, 12],
    semitonesRight: [14, 15, 19, 22],
    solmizationLeft: ["F3", "A3", "C4", "D4"],
    solmizationRight: ["E4", "F4", "A4", "C5"],
    noteNamesLeft: ["Root", "III", "V", "VI"],
    noteNamesRight: ["Maj7", "Oct", "III'", "V'"],
  },
  {
    id: "mixolydian",
    roman: "SCALE IV",
    name: "French Funk (G7)",
    rootNote: "G",
    semitonesLeft: [5, 8, 10, 12],
    semitonesRight: [15, 17, 20, 22],
    solmizationLeft: ["G3", "Bb3", "C4", "D4"],
    solmizationRight: ["F4", "G4", "Bb4", "C5"],
    noteNamesLeft: ["Root", "bIII", "IV", "V"],
    noteNamesRight: ["bVII", "Oct", "bIII'", "IV'"],
  },
];

/** Field Song: 32 beats (8 bars of 4/4), one beam index (0..7) per beat */
export const FIELD_SONG: number[] = [
  5, 1, 2, 3, 3, 2, 1, 0, 5, 4, 3, 2, 1, 2, 3, 5, 7, 6, 5, 4, 4, 5, 6, 7, 7,
  6, 5, 3, 2, 1, 0, 5,
];

/** Harbor: 32 beats that start on the lowest beam, reach the top beam and come back down */
export const HARBOR_SONG: number[] = [
  0, 1, 2, 3, 5, 3, 2, 1, 0, 2, 3, 5, 6, 5, 3, 1, 4, 5, 6, 7, 6, 5, 4, 3, 5,
  3, 2, 1, 0, 1, 3, 5,
];

/** Night Step: 32 beats that open on a high beam and walk down to the lowest one within the first eight */
export const NIGHT_SONG: number[] = [
  5, 7, 6, 4, 5, 3, 2, 0, 1, 2, 3, 5, 7, 6, 5, 4, 3, 1, 0, 2, 3, 5, 6, 7, 5,
  4, 3, 2, 1, 0, 2, 5,
];

export const BEAM_SONGS: Partial<Record<RhythmId, number[]>> = {
  anthem: FIELD_SONG,
  harbor: HARBOR_SONG,
  night: NIGHT_SONG,
};

export function isBeamSong(id: RhythmId): boolean {
  return id === "anthem" || id === "harbor" || id === "night";
}

// The first four rhythms pair a looping backing stem (seq-*.mp3) with a 16-step beam pattern for the lead.
// The last three are beam songs of 32 steps, one per beat, with no stem. Beams are numbered 0 to 7 in `steps`.
export const RHYTHMS: RhythmSpec[] = [
  {
    id: "saltarello",
    code: "SEQ-1",
    name: "Grid Horizon",
    bpm: 120,
    loopFile: "seq-grid-horizon",
    loopDurSec: 4.0,
    defaultVoice: "organ",
    steps: [5, 7, 6, 5, 4, 3, 4, 5, 5, 7, 6, 5, 4, 5, 6, 7],
    desc: "Octave-jumping unison saw riff + sub-brass stem across Beams 4–8",
  },
  {
    id: "pavane",
    code: "SEQ-2",
    name: "Tapping Arp",
    bpm: 120,
    loopFile: "seq-tapping-arp",
    loopDurSec: 4.0,
    defaultVoice: "psaltery",
    steps: [7, 5, 6, 5, 7, 5, 6, 3, 6, 4, 5, 4, 6, 4, 5, 1],
    desc: "Two-hand tapping synth-guitar solo + slap bass across Beams 2–8",
  },
  {
    id: "macabre",
    code: "SEQ-3",
    name: "Acid Drive",
    bpm: 120,
    loopFile: "seq-acid-drive",
    loopDurSec: 4.0,
    defaultVoice: "cantus",
    steps: [0, 0, 5, 4, 3, 2, 1, 3, 0, 0, 6, 5, 4, 3, 1, 2],
    desc: "Resonant 303 acid hook + sub-bass groove across Beams 1–7",
  },
  {
    id: "solar",
    code: "SEQ-4",
    name: "Solar Pulse",
    bpm: 100,
    loopFile: "seq-solar-pulse",
    loopDurSec: 4.8,
    defaultVoice: "hurdy",
    steps: [7, 6, 5, 4, 6, 5, 4, 3, 5, 4, 3, 2, 4, 5, 6, 7],
    desc: "Baroque-electronic analog poly melody + ostinato across Beams 3–8",
  },
  {
    id: "anthem",
    code: "PLAY",
    name: "Field Song",
    bpm: 72,
    defaultVoice: "pluck",
    steps: FIELD_SONG,
    desc: "Slow 32-beat melody across all eight beams",
  },
  {
    id: "harbor",
    code: "SONG",
    name: "Harbor",
    bpm: 80,
    defaultVoice: "pluck",
    steps: HARBOR_SONG,
    desc: "Low-to-high 32-beat song",
  },
  {
    id: "night",
    code: "SONG",
    name: "Night Step",
    bpm: 64,
    defaultVoice: "lute",
    steps: NIGHT_SONG,
    desc: "High-to-low 32-beat song",
  },
];

export const FINGER_LABELS: Record<
  FingerIndex,
  { digit: string; latin: string; role: string }
> = {
  0: { digit: "I", latin: "INDEX", role: "Lead / Pluck" },
  1: { digit: "II", latin: "MIDDLE", role: "Harmony II" },
  2: { digit: "III", latin: "RING", role: "Sub / Fifth" },
  3: { digit: "IV", latin: "PINKY", role: "High Octave" },
};

export type HitGrade = "PERFECT" | "GREAT" | "GOOD" | "MISS";

export interface ArcadeSnapshot {
  score: number;
  combo: number;
  multiplier: number;
  lastGrade: HitGrade | null;
  lastGradeAt: number;
  hits: number;
  misses: number;
  handsPresent: boolean;
}

export interface ArcadeHit {
  grade: Exclude<HitGrade, "MISS">;
  beamIdx: number;
  stepIndex: number;
  freqHz: number;
  solmization: string;
  noteName: string;
  score: number;
  combo: number;
  multiplier: number;
}

export interface ScoreRecap {
  rhythm: RhythmId;
  score: number;
  hits: number;
  misses: number;
  peakCombo: number;
  grades: (HitGrade | null)[];
}

export interface SongClock {
  stepFloat: number;
  stepIndex: number;
  running: boolean;
  bpm: number;
  guideHold: boolean;
}

export interface LoopEvent {
  offsetMs: number;
  hand: HandSide;
  finger: FingerIndex;
  voice: VoiceId;
  mode: ModeId;
  yBend: number;
  velocity: number;
  stepIndex?: number;
  freqHz?: number;
  grade?: HitGrade;
  chartAuto?: boolean;
}

class ManusAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sidechainGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private formantF1: BiquadFilterNode | null = null;
  private formantF2: BiquadFilterNode | null = null;
  private formantMix: GainNode | null = null;
  private directMix: GainNode | null = null;
  private driveShaper: WaveShaperNode | null = null;
  // Chorus: two modulated delay lines summed into one wet gain
  private chorusDelayL: DelayNode | null = null;
  private chorusDelayR: DelayNode | null = null;
  private chorusWetGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private sampleBuffers: Map<string, AudioBuffer> = new Map();
  private samplesLoading = false;
  private samplesReady = false;
  private engineMode: EngineMode = "hybrid"; // sample plus oscillators; "surge" is samples only, "synth" oscillators only
  private temperament: TemperamentId = "equal";
  private currentVowel = vowelAt(THEREMIN_REST).vowel;
  private lastCutoffNorm = THEREMIN_REST;
  private thereminOn = true;
  /** The `E4 REVERB` knob, 0..1. 0.5 is the level the hand and height alone give; see setSpatialParameters */
  private reverbAmount = 0.5;
  /** The last reverb, resonance and hand-bridge values, kept so the theremin's switch and the knob can apply them again */
  private lastSpatial = { reverbNorm: 0.36, resonanceNorm: 0.5, handBridgeNorm: 0.35 };

  // Expert mode synth and envelope settings
  private synthParams: SynthParams = {
    attackNorm: 0.08,
    releaseNorm: 0.55,
    subLevel: 0.52,
    driveNorm: 0.45,
    chorusMix: 0.48,
    bpm: 120,
  };

  private activeVoice: VoiceId = "organ";
  private activeMode: ModeId = "dorian";
  private chordRootIdx: 0 | 1 | 2 | 3 = 0;
  private stutterActive = false;
  private stutterStep = 0;
  private customSteps: Record<string, number[]> = {
    saltarello: [...RHYTHMS[0].steps],
    pavane: [...RHYTHMS[1].steps],
    macabre: [...RHYTHMS[2].steps],
    solar: [...RHYTHMS[3].steps],
  };
  private playQuantizeMode: PlayQuantizeMode = "quantized";
  private pendingQuantizedBeam: number | null = null;

  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneBufferSrc: AudioBufferSourceNode | null = null;
  private droneGain: GainNode | null = null;
  private droneActive = false;

  private midiAccess: MIDIAccess | null = null;
  private midiOutputs: MIDIOutput[] = [];
  private midiEnabled = false;
  private lastMidiCcMs = 0;

  private currentRhythm: RhythmId = "off";
  private rhythmTimer: number | null = null;
  private rhythmLoopSrc: AudioBufferSourceNode | null = null;
  private rhythmLoopGain: GainNode | null = null;
  private rhythmStep = 0;
  private clockStepAt = 0;
  private clockTimeAt = 0;
  private clockBpm = 120;
  private songBpm: Partial<Record<RhythmId, number>> = {};
  private bpmLoaded = false;
  private stretchCache = new Map<string, AudioBuffer>();
  private stemSwapTimer: number | null = null;
  private stemStartedAt = 0;
  private stepGrades: (HitGrade | null)[] = Array(32).fill(null);
  private peakCombo = 0;
  private stashedRecap: ScoreRecap | null = null;
  private replaySteps: number[] | null = null;
  private replayIndex = 0;
  private songBoundary = 0;
  private setlistArmed = false;
  private midiClockOn = false;
  private midiClockCount = 0;
  private lastMidiClockAt = 0;
  private smoothedMidiBpm = 96;
  private midiInputsBound = false;
  /** In sixteenths: 4 = one catchable gem per beat, 2 = eighths, 1 = every sixteenth. Beam songs always use 1. */
  private catchStride: 1 | 2 | 4 = 4;
  private stutterFrozenAt = 0;
  private lastDispatchedStep = -1;
  private missCursor = 0;
  private lastStutterHat = 0;
  private judgedSteps: Set<number> = new Set();
  private arcadeHandsPresent = false;
  private arcade: ArcadeSnapshot = {
    score: 0,
    combo: 0,
    multiplier: 1,
    lastGrade: null,
    lastGradeAt: 0,
    hits: 0,
    misses: 0,
    handsPresent: false,
  };

  public readonly loopLengthMs = 8000;
  private loopRecording = false;
  private loopPlaying = false;
  private loopStartTime = 0;
  private loopEvents: LoopEvent[] = [];
  private loopTimer: number | null = null;
  private lastLoopTick = 0;
  private onLoopTriggerCallback: ((ev: LoopEvent) => void) | null = null;

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.88;

      this.sidechainGain = this.ctx.createGain();
      this.sidechainGain.gain.value = 1.0;

      this.driveShaper = this.ctx.createWaveShaper();
      this.driveShaper.curve = this.makeSaturationCurve(1.8);
      this.driveShaper.oversample = "2x";

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = "lowpass";
      this.filterNode.frequency.value = 5200;
      this.filterNode.Q.value = 1.8;

      this.formantF1 = this.ctx.createBiquadFilter();
      this.formantF1.type = "bandpass";
      this.formantF1.frequency.value = 750;
      this.formantF1.Q.value = 4.2;

      this.formantF2 = this.ctx.createBiquadFilter();
      this.formantF2.type = "bandpass";
      this.formantF2.frequency.value = 1200;
      this.formantF2.Q.value = 5.0;

      this.formantMix = this.ctx.createGain();
      this.formantMix.gain.value = this.thereminOn ? FORMANT_MIX : 0;

      this.directMix = this.ctx.createGain();
      this.directMix.gain.value = 0.86;

      // Chorus: delays of 14 ms and 19 ms, each swept by a slow LFO (0.65 and 0.78 Hz, +/-2.5 and +/-2.8 ms)
      this.chorusDelayL = this.ctx.createDelay(0.05);
      this.chorusDelayR = this.ctx.createDelay(0.05);
      this.chorusDelayL.delayTime.value = 0.014;
      this.chorusDelayR.delayTime.value = 0.019;
      this.chorusWetGain = this.ctx.createGain();
      this.chorusWetGain.gain.value = 0.36;

      const lfoL = this.ctx.createOscillator();
      const lfoR = this.ctx.createOscillator();
      const lfoGainL = this.ctx.createGain();
      const lfoGainR = this.ctx.createGain();
      lfoL.frequency.value = 0.65;
      lfoR.frequency.value = 0.78;
      lfoGainL.gain.value = 0.0025;
      lfoGainR.gain.value = 0.0028;
      lfoL.connect(lfoGainL);
      lfoR.connect(lfoGainR);
      lfoGainL.connect(this.chorusDelayL.delayTime);
      lfoGainR.connect(this.chorusDelayR.delayTime);
      lfoL.start();
      lfoR.start();

      this.delayNode = this.ctx.createDelay(1.5);
      this.delayNode.delayTime.value = 0.25;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.28;

      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = 0.8;

      this.wetGain = this.ctx.createGain();
      this.wetGain.gain.value = 0.4;

      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = this.buildCathedralImpulse(this.ctx, 2.6, 2.3);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx, 1.0);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.76;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);

      this.recordDest = this.ctx.createMediaStreamDestination();

      this.filterNode.connect(this.driveShaper);
      this.driveShaper.connect(this.directMix);
      this.driveShaper.connect(this.formantF1);
      this.driveShaper.connect(this.formantF2);
      this.formantF1.connect(this.formantMix);
      this.formantF2.connect(this.formantMix);

      // The chorus runs in parallel with the direct and formant paths
      this.driveShaper.connect(this.chorusDelayL);
      this.driveShaper.connect(this.chorusDelayR);
      this.chorusDelayL.connect(this.chorusWetGain);
      this.chorusDelayR.connect(this.chorusWetGain);
      this.chorusWetGain.connect(this.sidechainGain);

      this.directMix.connect(this.sidechainGain);
      this.formantMix.connect(this.sidechainGain);

      this.sidechainGain.connect(this.dryGain);
      this.sidechainGain.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.convolver);
      this.sidechainGain.connect(this.convolver);
      this.convolver.connect(this.wetGain);

      this.dryGain.connect(this.masterGain);
      this.wetGain.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.masterGain.connect(this.recordDest);
      this.analyser.connect(this.ctx.destination);

      // Apply the stored height and switch state to the new graph, so the first note matches what the screen shows
      const { reverbNorm, resonanceNorm, handBridgeNorm } = this.lastSpatial;
      this.setSpatialParameters(this.lastCutoffNorm, reverbNorm, resonanceNorm, handBridgeNorm);

      this.loadSurgeSamples();
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    const k = Math.max(0.5, amount);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return curve;
  }

  public getSynthParams(): SynthParams {
    return { ...this.synthParams };
  }

  public setSynthParams(partial: Partial<SynthParams>) {
    this.ensureContext();
    this.synthParams = { ...this.synthParams, ...partial };
    if (partial.driveNorm !== undefined && this.driveShaper) {
      this.driveShaper.curve = this.makeSaturationCurve(
        1.0 + this.synthParams.driveNorm * 2.8
      );
    }
    if (partial.chorusMix !== undefined && this.chorusWetGain && this.ctx) {
      this.chorusWetGain.gain.setTargetAtTime(
        this.synthParams.chorusMix * 0.65,
        this.ctx.currentTime,
        0.04
      );
    }
    if (partial.bpm !== undefined) {
      this.applySongBpm(
        this.currentRhythm === "off" ? "saltarello" : this.currentRhythm,
        partial.bpm
      );
    }
  }

  private loadSongBpms() {
    if (this.bpmLoaded || typeof window === "undefined") return;
    this.bpmLoaded = true;
    try {
      const raw = window.localStorage.getItem("manus.bpm.v1");
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Record<RhythmId, number>>;
      this.songBpm = { ...this.songBpm, ...data };
    } catch {
      /* storage blocked or unreadable: keep the default tempos */
    }
  }

  public getSongBpm(id: RhythmId): number {
    this.loadSongBpms();
    const stored = this.songBpm[id];
    if (stored) return stored;
    return RHYTHMS.find((r) => r.id === id)?.bpm ?? 120;
  }

  public applySongBpm(id: RhythmId, bpm: number) {
    this.loadSongBpms();
    const beam = isBeamSong(id);
    const next = Math.max(beam ? 48 : 72, Math.min(beam ? 110 : 168, Math.round(bpm)));
    this.songBpm[id] = next;
    this.synthParams = { ...this.synthParams, bpm: next };
    try {
      window.localStorage.setItem("manus.bpm.v1", JSON.stringify(this.songBpm));
    } catch {
      /* storage blocked: the tempo is just not remembered */
    }
    const ctx = this.ctx;
    if (!ctx || this.currentRhythm !== id || this.midiClockOn) return;
    this.clockStepAt = this.readStepFloat();
    this.clockTimeAt = ctx.currentTime;
    this.clockBpm = next;
    if (!isBeamSong(id)) this.scheduleStemStretch();
  }

  private scheduleStemStretch() {
    if (this.stemSwapTimer !== null) window.clearTimeout(this.stemSwapTimer);
    this.stemSwapTimer = window.setTimeout(() => {
      this.stemSwapTimer = null;
      this.swapStemPreservingPhase();
    }, 80);
  }

  /**
   * Overlap-add time stretch with 2048-sample Hann grains and a 512-sample analysis hop. `stretch` is output length
   * over input length; within 1.5% of 1 the input is returned as is. Pitch stays put because grains are not resampled.
   */
  private timeStretch(input: AudioBuffer, stretch: number): AudioBuffer {
    const ctx = this.ctx;
    if (!ctx || stretch > 0.985 && stretch < 1.015) return input;
    const channels = input.numberOfChannels;
    const inLen = input.length;
    const outLen = Math.max(1, Math.floor(inLen * stretch));
    const output = ctx.createBuffer(channels, outLen, input.sampleRate);
    const win = 2048;
    const analysisHop = 512;
    const synthesisHop = Math.max(1, Math.round(analysisHop * stretch));
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) {
      hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
    }
    const weight = new Float32Array(outLen);
    const inputs = Array.from({ length: channels }, (_, c) =>
      input.getChannelData(c)
    );
    const outputs = Array.from({ length: channels }, (_, c) =>
      output.getChannelData(c)
    );
    let inPos = 0;
    let outPos = 0;
    while (inPos + win <= inLen && outPos < outLen) {
      const n = Math.min(win, outLen - outPos);
      for (let i = 0; i < n; i++) {
        const w = hann[i];
        weight[outPos + i] += w;
        for (let c = 0; c < channels; c++) {
          outputs[c][outPos + i] += inputs[c][inPos + i] * w;
        }
      }
      inPos += analysisHop;
      outPos += synthesisHop;
    }
    for (let i = 0; i < outLen; i++) {
      const w = weight[i];
      if (w > 0.0001) {
        for (let c = 0; c < channels; c++) outputs[c][i] /= w;
      }
    }
    const fade = Math.min(512, Math.floor(outLen / 8));
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      for (let c = 0; c < channels; c++) {
        outputs[c][i] *= g;
        outputs[c][outLen - 1 - i] *= g;
      }
    }
    return output;
  }

  private stretchedStem(): AudioBuffer | null {
    if (this.currentRhythm === "off" || !this.ctx) return null;
    const spec = RHYTHMS.find((r) => r.id === this.currentRhythm);
    if (!spec?.loopFile) return null;
    const native = this.sampleBuffers.get(spec.loopFile);
    if (!native) return null;
    const stretch = spec.bpm / Math.max(40, this.clockBpm);
    const key = `${spec.loopFile}:${Math.round(this.clockBpm)}`;
    const cached = this.stretchCache.get(key);
    if (cached) return cached;
    const buf = this.timeStretch(native, stretch);
    this.stretchCache.set(key, buf);
    if (this.stretchCache.size > 6) {
      const oldest = this.stretchCache.keys().next().value;
      if (oldest) this.stretchCache.delete(oldest);
    }
    return buf;
  }

  private chordRate(): number {
    const chordOffset = CHORD_ROOTS[this.chordRootIdx]?.semitones ?? 0;
    return Math.pow(2, chordOffset / 12);
  }

  private startStem(offsetSec = 0) {
    const ctx = this.ctx;
    const buf = this.stretchedStem();
    if (!ctx || !buf || this.playQuantizeMode === "guide") return;
    if (this.rhythmLoopSrc) {
      try {
        this.rhythmLoopSrc.stop();
      } catch {
        /* already stopped */
      }
      this.rhythmLoopSrc = null;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    src.playbackRate.setValueAtTime(this.chordRate(), ctx.currentTime);
    const lg = ctx.createGain();
    lg.gain.value = this.arcadeHandsPresent ? 0.38 : 0.68;
    src.connect(lg);
    lg.connect(this.filterNode!);
    const offset = Math.max(0, Math.min(buf.duration - 0.01, offsetSec));
    src.start(ctx.currentTime, offset);
    this.rhythmLoopSrc = src;
    this.rhythmLoopGain = lg;
    this.stemStartedAt = ctx.currentTime - offset;
  }

  private swapStemPreservingPhase() {
    if (!this.ctx || !this.rhythmLoopSrc?.buffer) {
      this.startStem(0);
      return;
    }
    const oldDur = this.rhythmLoopSrc.buffer.duration || 1;
    const elapsed = Math.max(0, this.ctx.currentTime - this.stemStartedAt);
    const phase = (elapsed % oldDur) / oldDur;
    const next = this.stretchedStem();
    this.startStem(next ? phase * next.duration : 0);
  }

  public async loadSurgeSamples(): Promise<void> {
    if (this.samplesLoading || this.samplesReady || typeof window === "undefined")
      return;
    const ctx = this.ensureContext();
    this.samplesLoading = true;

    const keys: string[] = [
      "bourdon-drone",
      "seq-grid-horizon",
      "seq-tapping-arp",
      "seq-acid-drive",
      "seq-solar-pulse",
    ];
    for (const v of VOICES) {
      keys.push(`${v.id}-z0`, `${v.id}-z1`, `${v.id}-z2`, `${v.id}-z3`);
    }

    await Promise.all(
      keys.map(async (k) => {
        try {
          const res = await fetch(`/samples/surge/${k}.mp3`);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          this.sampleBuffers.set(k, buf);
        } catch {}
      })
    );

    this.samplesReady = this.sampleBuffers.size > 0;
    this.samplesLoading = false;
  }

  public setActiveVoiceAndMode(voice: VoiceId, mode: ModeId) {
    this.activeVoice = voice;
    this.activeMode = mode;
  }

  public setChordRootIndex(idx: 0 | 1 | 2 | 3) {
    if (this.chordRootIdx !== idx) {
      this.chordRootIdx = idx;
      const chordOffset = CHORD_ROOTS[idx]?.semitones ?? 0;
      const rateRatio = Math.pow(2, chordOffset / 12);

      if (this.rhythmLoopSrc && this.ctx) {
        this.rhythmLoopSrc.playbackRate.setTargetAtTime(
          rateRatio,
          this.ctx.currentTime,
          0.04
        );
      }
      if (this.droneActive) {
        this.toggleBourdonDrone(true, this.activeMode);
      }
    }
  }

  public getChordRootIndex(): 0 | 1 | 2 | 3 {
    return this.chordRootIdx;
  }

  public setStutterFreeze(active: boolean) {
    if (active && !this.stutterActive) {
      this.stutterFrozenAt = this.readStepFloat();
      this.stutterStep = Math.floor(this.stutterFrozenAt);
    }
    if (!active && this.stutterActive && this.ctx) {
      this.clockStepAt = this.stutterFrozenAt;
      this.clockTimeAt = this.ctx.currentTime;
      this.lastDispatchedStep = Math.floor(this.stutterFrozenAt);
    }
    this.stutterActive = active;
  }

  public isStutterActive(): boolean {
    return this.stutterActive;
  }

  public setPlayQuantizeMode(mode: PlayQuantizeMode) {
    if (mode === "guide" && this.playQuantizeMode !== "guide") {
      this.rhythmStep = Math.floor(this.readStepFloat());
    }
    if (mode !== "guide" && this.playQuantizeMode === "guide" && this.ctx) {
      this.clockStepAt = this.rhythmStep;
      this.clockTimeAt = this.ctx.currentTime;
      this.lastDispatchedStep = this.rhythmStep - 1;
      this.missCursor = this.rhythmStep;
    }
    this.playQuantizeMode = mode;
  }

  public getPlayQuantizeMode(): PlayQuantizeMode {
    return this.playQuantizeMode;
  }

  public queueQuantizedBeam(beamIdx: number) {
    this.pendingQuantizedBeam = Math.max(0, Math.min(7, beamIdx));
  }

  public getSequenceSteps(rhythmId: RhythmId): number[] {
    const song = BEAM_SONGS[rhythmId];
    if (song) return [...song];
    if (rhythmId === "off") return RHYTHMS[0].steps;
    return this.customSteps[rhythmId] ?? RHYTHMS[0].steps;
  }

  private chartLength(rhythm: RhythmId = this.currentRhythm): number {
    return BEAM_SONGS[rhythm]?.length ?? 16;
  }

  private slot(n: number): number {
    const m = this.chartLength();
    return ((n % m) + m) % m;
  }

  /**
   * Beam songs advance one step per beat, with the tempo clamped to 48..110. The stem rhythms advance in
   * sixteenths, with the tempo floored at 72.
   */
  private stepDurationSec(): number {
    if (isBeamSong(this.currentRhythm)) {
      return 60 / Math.max(48, Math.min(110, this.clockBpm));
    }
    return 60 / Math.max(72, this.clockBpm) / 4;
  }

  public setSequenceStepBeam(
    rhythmId: RhythmId,
    stepIdx: number,
    beamIdx: number
  ) {
    if (rhythmId === "off") return;
    const arr = this.customSteps[rhythmId];
    if (arr && stepIdx >= 0 && stepIdx < 16) {
      arr[stepIdx] = Math.max(0, Math.min(7, beamIdx));
    }
  }

  public getCurrentSequenceStep(): number {
    if (this.playQuantizeMode === "guide" || this.currentRhythm === "off") {
      return this.slot(this.rhythmStep);
    }
    return this.getSongClock().stepIndex;
  }

  private resetArcade() {
    this.arcade = {
      score: 0,
      combo: 0,
      multiplier: 1,
      lastGrade: null,
      lastGradeAt: 0,
      hits: 0,
      misses: 0,
      handsPresent: this.arcadeHandsPresent,
    };
    this.judgedSteps.clear();
    this.missCursor = 0;
    this.lastDispatchedStep = -1;
    this.arcadeHandsPresent = false;
    this.stepGrades = Array(32).fill(null);
    this.peakCombo = 0;
    this.duckStemForPlayer(false);
  }

  /** Keeps the score of the rhythm that just ended. Called after the change, so it is passed the previous id. */
  private stashRecap(rhythm: RhythmId) {
    const judged = this.stepGrades.some((g) => g !== null);
    if (!judged && this.arcade.hits === 0 && this.arcade.misses === 0) return;
    this.stashedRecap = {
      rhythm,
      score: this.arcade.score,
      hits: this.arcade.hits,
      misses: this.arcade.misses,
      peakCombo: this.peakCombo,
      grades: this.stepGrades.slice(0, this.chartLength(rhythm)),
    };
  }

  public takeRecap(): ScoreRecap | null {
    const recap = this.stashedRecap;
    this.stashedRecap = null;
    return recap;
  }

  public armReplay(steps: number[]) {
    if (!steps.length) return;
    this.replaySteps = steps;
    this.replayIndex = 0;
    this.rhythmStep = steps[0];
    this.playQuantizeMode = "guide";
  }

  public replayRemaining(): number {
    if (!this.replaySteps) return 0;
    return this.replaySteps.length - this.replayIndex;
  }

  public setSetlistArmed(on: boolean) {
    this.setlistArmed = on;
    this.songBoundary = 0;
  }

  public consumeSongBoundary(): number {
    const n = this.songBoundary;
    this.songBoundary = 0;
    return n;
  }

  public setMidiClockFollow(on: boolean) {
    this.midiClockOn = on;
    if (on) this.bindMidiInputs();
  }

  public isMidiClockFollow(): boolean {
    return this.midiClockOn;
  }

  public getDetectedMidiBpm(): number {
    return Math.round(this.smoothedMidiBpm);
  }

  private bindMidiInputs() {
    if (!this.midiAccess || this.midiInputsBound) return;
    this.midiInputsBound = true;
    this.midiAccess.inputs.forEach((input) => {
      input.onmidimessage = (event) => this.onMidiClock(event);
    });
    this.midiAccess.onstatechange = () => {
      this.midiInputsBound = false;
      if (this.midiClockOn) this.bindMidiInputs();
      const outs: MIDIOutput[] = [];
      this.midiAccess?.outputs.forEach((port) => outs.push(port));
      this.midiOutputs = outs;
    };
  }

  private onMidiClock(event: MIDIMessageEvent) {
    const status = event.data?.[0];
    const ctx = this.ctx;
    if (!this.midiClockOn || !ctx || status === undefined) return;
    if (status === 0xfa) {
      this.midiClockCount = 0;
      this.clockStepAt = 0;
      this.clockTimeAt = ctx.currentTime;
      this.lastDispatchedStep = -1;
      this.missCursor = 0;
      return;
    }
    if (status !== 0xf8) return;
    const now = ctx.currentTime;
    const prev = this.lastMidiClockAt;
    this.lastMidiClockAt = now;
    if (prev && now > prev) {
      const dt = now - prev;
      if (dt > 0.004 && dt < 0.08) {
        const bpm = 60 / (dt * 24);
        this.smoothedMidiBpm = this.smoothedMidiBpm * 0.85 + bpm * 0.15;
        const rounded = Math.max(40, Math.min(200, Math.round(this.smoothedMidiBpm)));
        if (Math.abs(rounded - this.clockBpm) >= 2 && this.currentRhythm !== "off") {
          this.clockBpm = rounded;
          this.synthParams = { ...this.synthParams, bpm: rounded };
          this.scheduleStemStretch();
        } else {
          this.clockBpm = rounded;
        }
      }
    }
    this.midiClockCount += 1;
    const clocksPerStep = isBeamSong(this.currentRhythm) ? 24 : 6;
    this.clockStepAt = this.midiClockCount / clocksPerStep;
    this.clockTimeAt = now;
  }

  private readStepFloat(): number {
    if (this.stutterActive) return this.stutterFrozenAt;
    if (!this.ctx || this.currentRhythm === "off") return this.clockStepAt;
    const dur = this.stepDurationSec();
    return this.clockStepAt + (this.ctx.currentTime - this.clockTimeAt) / dur;
  }

  private hitWindows() {
    const stepSec = this.stepDurationSec();
    return {
      perfect: 0.09 / stepSec,
      great: 0.16 / stepSec,
      good: 0.26 / stepSec,
    };
  }

  public setCatchStride(stride: 1 | 2 | 4) {
    this.catchStride = stride;
  }

  public getCatchStride(): 1 | 2 | 4 {
    if (isBeamSong(this.currentRhythm)) return 1;
    return this.catchStride;
  }

  private isCatchStep(absStep: number): boolean {
    if (isBeamSong(this.currentRhythm)) return true;
    return this.catchStride <= 1 || absStep % this.catchStride === 0;
  }

  public getSongClock(): SongClock {
    const guideHold = this.playQuantizeMode === "guide";
    if (guideHold) {
      return {
        stepFloat: this.rhythmStep,
        stepIndex: this.slot(this.rhythmStep),
        running: true,
        bpm: this.clockBpm,
        guideHold: true,
      };
    }
    if (this.currentRhythm === "off" || !this.ctx) {
      return {
        stepFloat: 0,
        stepIndex: 0,
        running: false,
        bpm: this.synthParams.bpm,
        guideHold: false,
      };
    }
    const stepFloat = Math.max(0, this.readStepFloat());
    return {
      stepFloat,
      stepIndex: this.slot(Math.floor(stepFloat)),
      running: true,
      bpm: this.clockBpm,
      guideHold: false,
    };
  }

  public getArcadeState(): ArcadeSnapshot {
    return { ...this.arcade, handsPresent: this.arcadeHandsPresent };
  }

  public setArcadeHandsPresent(present: boolean) {
    if (!present || this.arcadeHandsPresent) return;
    this.arcadeHandsPresent = true;
    this.arcade.handsPresent = true;
    this.duckStemForPlayer(true);
  }

  private duckStemForPlayer(present: boolean) {
    if (!this.rhythmLoopGain || !this.ctx) return;
    this.rhythmLoopGain.gain.setTargetAtTime(
      present ? 0.38 : 0.68,
      this.ctx.currentTime,
      0.08
    );
  }

  public isChartNear(beamIdx: number, withinSteps?: number): boolean {
    if (this.currentRhythm === "off" || this.playQuantizeMode === "guide") {
      return false;
    }
    const reach = withinSteps ?? Math.max(1.6, this.catchStride * 0.85);
    const steps = this.getSequenceSteps(this.currentRhythm);
    const stepFloat = this.readStepFloat();
    const base = Math.floor(stepFloat);
    for (let n = base - this.catchStride; n <= base + this.catchStride; n++) {
      if (n < 0 || this.judgedSteps.has(n) || !this.isCatchStep(n)) continue;
      const beam = steps[this.slot(n)];
      if (beam !== beamIdx) continue;
      if (Math.abs(n - stepFloat) <= reach) return true;
    }
    return false;
  }

  private award(grade: HitGrade, absStep?: number) {
    if (grade === "MISS") {
      this.arcade.combo = 0;
      this.arcade.multiplier = 1;
      this.arcade.misses += 1;
    } else {
      this.arcade.combo += 1;
      this.arcade.hits += 1;
      this.arcade.multiplier = Math.min(
        8,
        1 + Math.floor(this.arcade.combo / 8)
      );
      const base = grade === "PERFECT" ? 300 : grade === "GREAT" ? 200 : 100;
      this.arcade.score += base * this.arcade.multiplier;
    }
    this.arcade.lastGrade = grade;
    this.arcade.lastGradeAt = performance.now();
    if (this.arcade.combo > this.peakCombo) this.peakCombo = this.arcade.combo;
    if (absStep !== undefined) {
      this.stepGrades[this.slot(absStep)] = grade;
    }
  }

  private fireChartNote(
    absStep: number,
    beamIdx: number,
    grade: HitGrade | null,
    chartAuto: boolean
  ): { noteName: string; solmization: string; freqHz: number } {
    const hand: HandSide = beamIdx < 4 ? "left" : "right";
    const finger = (beamIdx % 4) as FingerIndex;
    const velocity =
      grade === "PERFECT"
        ? 0.98
        : grade === "GREAT"
          ? 0.86
          : grade === "GOOD"
            ? 0.72
            : 0.7;
    const res = this.triggerNote({
      hand,
      finger,
      voice: this.activeVoice,
      mode: this.activeMode,
      yBend: this.lastCutoffNorm,
      velocity,
      fromLooper: true,
    });
    this.onLoopTriggerCallback?.({
      offsetMs: 0,
      hand,
      finger,
      voice: this.activeVoice,
      mode: this.activeMode,
      yBend: this.lastCutoffNorm,
      velocity,
      stepIndex: this.slot(absStep),
      freqHz: res.freqHz,
      grade: grade ?? undefined,
      chartAuto,
    });
    return res;
  }

  public tryArcadeCatch(beamIdx: number): ArcadeHit | null {
    if (
      this.currentRhythm === "off" ||
      this.playQuantizeMode === "guide" ||
      !this.ctx
    ) {
      return null;
    }
    const safeBeam = Math.max(0, Math.min(7, beamIdx));
    const steps = this.getSequenceSteps(this.currentRhythm);
    const stepFloat = this.readStepFloat();
    const windows = this.hitWindows();
    const base = Math.floor(stepFloat);
    let best: { abs: number; dist: number } | null = null;
    const reach = Math.max(1, this.catchStride);
    for (let n = base - reach; n <= base + reach; n++) {
      if (n < 0 || this.judgedSteps.has(n) || !this.isCatchStep(n)) continue;
      const beam = steps[this.slot(n)];
      if (beam !== safeBeam) continue;
      const dist = Math.abs(n - stepFloat);
      if (dist <= windows.good && (!best || dist < best.dist)) {
        best = { abs: n, dist };
      }
    }
    if (!best) return null;
    this.judgedSteps.add(best.abs);
    const grade: Exclude<HitGrade, "MISS"> =
      best.dist <= windows.perfect
        ? "PERFECT"
        : best.dist <= windows.great
          ? "GREAT"
          : "GOOD";
    this.award(grade, best.abs);
    const res = this.fireChartNote(best.abs, safeBeam, grade, false);
    return {
      grade,
      beamIdx: safeBeam,
      stepIndex: this.slot(best.abs),
      freqHz: res.freqHz,
      solmization: res.solmization,
      noteName: res.noteName,
      score: this.arcade.score,
      combo: this.arcade.combo,
      multiplier: this.arcade.multiplier,
    };
  }

  private resolveMisses(stepFloat: number) {
    const overdue = Math.floor(stepFloat - this.hitWindows().good);
    for (let n = this.missCursor; n <= overdue; n++) {
      if (n < 0 || this.judgedSteps.has(n)) continue;
      if (!this.isCatchStep(n)) {
        this.judgedSteps.add(n);
        continue;
      }
      this.judgedSteps.add(n);
      this.award("MISS", n);
    }
    if (overdue + 1 > this.missCursor) this.missCursor = overdue + 1;
    if (this.judgedSteps.size > 48) {
      const keep = Math.floor(stepFloat) - 8;
      for (const n of this.judgedSteps) {
        if (n < keep) this.judgedSteps.delete(n);
      }
    }
  }

  /**
   * Called every animation frame. Plays the backing for each step the clock has passed. With no hands in frame it also
   * plays the chart's lead notes; with hands, it grades the gems the player let go by as misses.
   */
  public serviceArcade() {
    if (
      !this.ctx ||
      this.currentRhythm === "off" ||
      this.playQuantizeMode === "guide"
    ) {
      return;
    }
    if (this.stutterActive) {
      const stepSec = this.stepDurationSec();
      if (this.ctx.currentTime - this.lastStutterHat >= stepSec) {
        this.lastStutterHat = this.ctx.currentTime;
        this.playDrumHit("hat");
        if (this.stutterStep % 2 === 0) this.playDrumHit("snare");
        this.stutterStep += 1;
      }
      return;
    }
    const stepFloat = this.readStepFloat();
    const stepNow = Math.floor(stepFloat);
    if (stepNow - this.lastDispatchedStep > 2) {
      this.lastDispatchedStep = stepNow - 1;
      this.missCursor = Math.max(this.missCursor, stepNow - 1);
    }
    while (this.lastDispatchedStep < stepNow) {
      this.lastDispatchedStep += 1;
      const s16 = this.slot(this.lastDispatchedStep);
      this.dispatchBacking(s16);
      const catchable = this.isCatchStep(this.lastDispatchedStep);
      if (!this.arcadeHandsPresent) {
        const steps = this.getSequenceSteps(this.currentRhythm);
        const beam = steps[s16];
        this.judgedSteps.add(this.lastDispatchedStep);
        this.fireChartNote(this.lastDispatchedStep, beam, null, true);
      } else if (!catchable) {
        this.judgedSteps.add(this.lastDispatchedStep);
      }
      if (
        this.setlistArmed &&
        this.lastDispatchedStep > 0 &&
        this.lastDispatchedStep %
          (isBeamSong(this.currentRhythm) ? this.chartLength() : 128) ===
          0
      ) {
        this.songBoundary += 1;
      }
    }
    if (this.arcadeHandsPresent) this.resolveMisses(stepFloat);
  }

  private dispatchBacking(s16: number) {
    if (isBeamSong(this.currentRhythm)) {
      if (s16 % 4 === 0) {
        this.playDrumHit("kick");
        this.triggerNote({
          hand: "left",
          finger: 0,
          voice: this.activeVoice,
          mode: this.activeMode,
          yBend: this.lastCutoffNorm,
          velocity: 0.36,
          fromLooper: true,
        });
      } else if (s16 % 2 === 0) {
        this.playDrumHit("hat");
        this.triggerNote({
          hand: "left",
          finger: 3,
          voice: this.activeVoice,
          mode: this.activeMode,
          yBend: this.lastCutoffNorm,
          velocity: 0.22,
          fromLooper: true,
        });
      }
      return;
    }
    if (s16 % 4 === 0) this.playDrumHit("kick");
    if (s16 === 4 || s16 === 12) this.playDrumHit("snare");
    if (s16 % 4 === 2) this.playDrumHit("hat");
  }

  public stepSequenceByHand(): { beamIdx: number; stepIdx: number } | null {
    const seqId =
      this.currentRhythm === "off" ? "saltarello" : this.currentRhythm;
    const steps = this.getSequenceSteps(seqId);
    const s16 = this.slot(this.rhythmStep);
    const beamIdx = steps[s16];
    this.award("PERFECT", this.rhythmStep);
    const res = this.fireChartNote(this.rhythmStep, beamIdx, "PERFECT", false);
    if (this.replaySteps) {
      this.replayIndex += 1;
      if (this.replayIndex >= this.replaySteps.length) {
        this.replaySteps = null;
        this.rhythmStep += 1;
      } else {
        this.rhythmStep = this.replaySteps[this.replayIndex];
      }
    } else {
      this.rhythmStep += 1;
    }
    return {
      beamIdx,
      stepIdx: s16,
      ...res,
    };
  }

  public getCurrentVowel(): string {
    return this.thereminOn ? this.currentVowel : "–";
  }

  /** The theremin's switch. Either way the height goes back to rest; off, it shapes nothing until it is on again */
  public setThereminActive(on: boolean) {
    this.thereminOn = on;
    this.lastMidiCcMs = 0; // clears the 33 ms CC throttle so the CC 74 sent below always goes out
    const { reverbNorm, resonanceNorm, handBridgeNorm } = this.lastSpatial;
    this.setSpatialParameters(THEREMIN_REST, reverbNorm, resonanceNorm, handBridgeNorm);
    if (!this.ctx || !this.formantMix) return;
    this.formantMix.gain.setTargetAtTime(on ? FORMANT_MIX : 0, this.ctx.currentTime, 0.05);
  }

  public setEngineMode(mode: EngineMode) {
    this.ensureContext();
    this.engineMode = mode;
    this.playMechanicalClick(1420);
  }

  public getEngineMode(): EngineMode {
    return this.engineMode;
  }

  public setTemperament(temp: TemperamentId) {
    this.temperament = temp;
    this.playMechanicalClick(1240);
  }

  public getTemperament(): TemperamentId {
    return this.temperament;
  }

  public async initWebMidi(): Promise<{
    enabled: boolean;
    portNames: string[];
  }> {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      return { enabled: false, portNames: [] };
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      const refreshPorts = () => {
        if (!this.midiAccess) return;
        const outs: MIDIOutput[] = [];
        this.midiAccess.outputs.forEach((port) => outs.push(port));
        this.midiOutputs = outs;
      };
      refreshPorts();
      this.midiAccess.onstatechange = () => {
        refreshPorts();
        this.midiInputsBound = false;
        if (this.midiClockOn) this.bindMidiInputs();
      };
      this.midiEnabled = true;
      if (this.midiClockOn) this.bindMidiInputs();
      return {
        enabled: true,
        portNames: this.midiOutputs.map((p) => p.name || "MIDI Out"),
      };
    } catch {
      this.midiEnabled = false;
      return { enabled: false, portNames: [] };
    }
  }

  public getOutputLatencyMs(): number {
    if (!this.ctx) return 0;
    const extra =
      "outputLatency" in this.ctx
        ? (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ??
          0
        : 0;
    return Math.round(((this.ctx.baseLatency ?? 0) + extra) * 1000);
  }

  public getRecordingAudioStream(): MediaStream | null {
    this.ensureContext();
    return this.recordDest?.stream ?? null;
  }

  private buildCathedralImpulse(
    ctx: AudioContext,
    durationSec: number,
    decay: number
  ): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const early = i < rate * 0.05 && i % 380 < 8 ? 1.35 : 1.0;
        data[i] = (Math.random() * 2 - 1) * env * early * 0.42;
      }
    }
    return impulse;
  }

  private buildNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const buf = ctx.createBuffer(1, length, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  public playMechanicalClick(pitch = 1200) {
    const ctx = this.ensureContext();
    this.clickAt(ctx, pitch, ctx.currentTime);
  }

  /** The theremin's switch: two clicks 55 ms apart, rising (700, then 1250 Hz) when it turns on and falling when it turns off */
  public playSwitchCue(on: boolean) {
    const ctx = this.ensureContext();
    const [first, second] = on ? [700, 1250] : [1250, 700];
    this.clickAt(ctx, first, ctx.currentTime);
    this.clickAt(ctx, second, ctx.currentTime + 0.055);
  }

  /** Sets the `E4 REVERB` knob (0..1) and re-applies the spatial values, so it is heard at once */
  public setReverbAmount(norm: number) {
    this.reverbAmount = Math.max(0, Math.min(1, norm));
    const { reverbNorm, resonanceNorm, handBridgeNorm } = this.lastSpatial;
    this.setSpatialParameters(this.lastCutoffNorm, reverbNorm, resonanceNorm, handBridgeNorm);
  }

  private clickAt(ctx: AudioContext, pitch: number, now: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(170, now + 0.016);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.018);
  }

  public setSpatialParameters(
    cutoffNorm: number,
    reverbNorm: number,
    resonanceNorm: number,
    handBridgeNorm = 0.35
  ) {
    // Kept before audio starts too, so the vowel shown is right and ensureContext can apply them
    this.lastSpatial = { reverbNorm, resonanceNorm, handBridgeNorm };
    // Off, the height is ignored: the filter stays open and the reverb at the theremin's rest
    const clampedCut = this.thereminOn ? Math.max(0.02, Math.min(1, cutoffNorm)) : THEREMIN_REST;
    this.lastCutoffNorm = clampedCut;
    // The vowel follows the height only while the theremin is on; off, its layer is silent (setThereminActive)
    const vSpec = vowelAt(clampedCut);
    if (this.thereminOn) this.currentVowel = vSpec.vowel;
    if (
      !this.ctx ||
      !this.filterNode ||
      !this.wetGain ||
      !this.delayFeedback ||
      !this.formantF1 ||
      !this.formantF2
    )
      return;
    const now = this.ctx.currentTime;

    const targetHz = this.thereminOn ? 220 * Math.pow(44.5, clampedCut) : FILTER_OPEN_HZ;
    this.filterNode.frequency.setTargetAtTime(targetHz, now, 0.03);
    // Off, the open filter has no resonant peak either, so it colours nothing
    this.filterNode.Q.setTargetAtTime(
      this.thereminOn ? 1.4 + resonanceNorm * 6.5 + (this.stutterActive ? 4.0 : 0) : Math.SQRT1_2,
      now,
      0.04
    );
    const combinedReverb = Math.min(1, reverbNorm * 0.55 + clampedCut * 0.45);
    // `E4 REVERB` scales the wet level: 0.5 leaves it as the hand and height set it, 1 doubles it (up to 1), 0 is dry
    const wet = Math.min(1, (0.12 + combinedReverb * 0.78) * this.reverbAmount * 2);
    this.wetGain.gain.setTargetAtTime(wet, now, 0.045);
    this.delayFeedback.gain.setTargetAtTime(
      0.14 + Math.min(0.55, handBridgeNorm * 0.45),
      now,
      0.05
    );

    if (this.thereminOn) {
      this.formantF1.frequency.setTargetAtTime(vSpec.f1, now, 0.04);
      this.formantF2.frequency.setTargetAtTime(vSpec.f2, now, 0.04);
    }

    const nowPerf = performance.now();
    if (
      this.midiEnabled &&
      this.midiOutputs.length > 0 &&
      nowPerf - this.lastMidiCcMs > 33
    ) {
      this.lastMidiCcMs = nowPerf;
      // Off, CC 74 (filter cutoff) is 127, so an external synth's filter opens too
      const cc74 = this.thereminOn ? Math.max(0, Math.min(127, Math.round(clampedCut * 127))) : 127;
      const cc1 = Math.max(0, Math.min(127, Math.round(resonanceNorm * 127)));
      const cc11 = Math.max(0, Math.min(127, Math.round(reverbNorm * 127)));
      for (const out of this.midiOutputs) {
        try {
          out.send([0xb0, 74, cc74]);
          out.send([0xb0, 1, cc1]);
          out.send([0xb0, 11, cc11]);
        } catch {}
      }
    }
  }

  public toggleBourdonDrone(active: boolean, modeId: ModeId): boolean {
    const ctx = this.ensureContext();
    const mode = MODES.find((m) => m.id === modeId) ?? MODES[0];
    const chordOffset = CHORD_ROOTS[this.chordRootIdx]?.semitones ?? 0;
    const rootSemi = mode.semitonesLeft[0] + chordOffset - 12;
    const rootHz = D3_HZ * Math.pow(2, rootSemi / 12);

    if (active && !this.droneActive) {
      const now = ctx.currentTime;
      this.droneGain = ctx.createGain();
      this.droneGain.gain.setValueAtTime(0.001, now);
      this.droneGain.gain.linearRampToValueAtTime(0.34, now + 0.3);
      this.droneGain.connect(this.filterNode!);

      const droneBuf = this.sampleBuffers.get("bourdon-drone");
      if (droneBuf && this.engineMode !== "synth") {
        this.droneBufferSrc = ctx.createBufferSource();
        this.droneBufferSrc.buffer = droneBuf;
        this.droneBufferSrc.loop = true;
        this.droneBufferSrc.loopStart = 0.35;
        this.droneBufferSrc.loopEnd = Math.max(1.5, droneBuf.duration - 0.35);
        this.droneBufferSrc.playbackRate.setValueAtTime(rootHz / D2_HZ, now);
        this.droneBufferSrc.connect(this.droneGain);
        this.droneBufferSrc.start(now);
      } else {
        this.droneOsc1 = ctx.createOscillator();
        this.droneOsc2 = ctx.createOscillator();
        this.droneOsc1.type = "sawtooth";
        this.droneOsc2.type = "sawtooth";
        this.droneOsc1.frequency.setValueAtTime(rootHz, now);
        this.droneOsc2.frequency.setValueAtTime(rootHz * 1.5, now);
        this.droneOsc2.detune.setValueAtTime(12, now);

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(520, now);

        this.droneOsc1.connect(lp);
        this.droneOsc2.connect(lp);
        lp.connect(this.droneGain);
        this.droneOsc1.start(now);
        this.droneOsc2.start(now);
      }
      this.droneActive = true;
    } else if (!active && this.droneActive) {
      const now = ctx.currentTime;
      if (this.droneGain) {
        this.droneGain.gain.setTargetAtTime(0.0001, now, 0.08);
      }
      const o1 = this.droneOsc1;
      const o2 = this.droneOsc2;
      const bs = this.droneBufferSrc;
      setTimeout(() => {
        try {
          o1?.stop();
          o2?.stop();
          bs?.stop();
        } catch {}
      }, 280);
      this.droneOsc1 = null;
      this.droneOsc2 = null;
      this.droneBufferSrc = null;
      this.droneActive = false;
    } else if (active && this.droneActive) {
      const now = ctx.currentTime;
      if (this.droneBufferSrc) {
        this.droneBufferSrc.playbackRate.setTargetAtTime(
          rootHz / D2_HZ,
          now,
          0.08
        );
      }
      if (this.droneOsc1 && this.droneOsc2) {
        this.droneOsc1.frequency.setTargetAtTime(rootHz, now, 0.08);
        this.droneOsc2.frequency.setTargetAtTime(rootHz * 1.5, now, 0.08);
      }
    }
    return this.droneActive;
  }

  public isDroneActive(): boolean {
    return this.droneActive;
  }

  public triggerCrownChord(modeId: ModeId, voiceId: VoiceId) {
    this.ensureContext();
    const fingers: FingerIndex[] = [0, 1, 2, 3];
    fingers.forEach((f, idx) => {
      setTimeout(() => {
        this.triggerNote({
          hand: idx < 2 ? "left" : "right",
          finger: f,
          voice: voiceId,
          mode: modeId,
          yBend: 0.72,
          velocity: 0.92,
          fromLooper: true,
        });
      }, idx * 42);
    });
  }

  private playDrumHit(kind: "kick" | "snare" | "hat") {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const dest = this.masterGain!;

    if (kind === "kick") {
      const osc = ctx.createOscillator();
      const clickOsc = ctx.createOscillator();
      const g = ctx.createGain();
      const clickG = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(44, now + 0.09);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.24);

      g.gain.setValueAtTime(0.54, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      clickOsc.type = "triangle";
      clickOsc.frequency.setValueAtTime(920, now);
      clickOsc.frequency.exponentialRampToValueAtTime(120, now + 0.015);
      clickG.gain.setValueAtTime(0.22, now);
      clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      osc.connect(g);
      clickOsc.connect(clickG);
      g.connect(dest);
      clickG.connect(dest);

      osc.start(now);
      clickOsc.start(now);
      osc.stop(now + 0.28);
      clickOsc.stop(now + 0.02);

      if (this.sidechainGain) {
        this.sidechainGain.gain.cancelScheduledValues(now);
        this.sidechainGain.gain.setValueAtTime(0.26, now);
        this.sidechainGain.gain.exponentialRampToValueAtTime(1.0, now + 0.2);
      }
    } else if (kind === "snare" && this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1850, now);
      bp.Q.value = 1.2;

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.26, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      const body = ctx.createOscillator();
      const bg = ctx.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(210, now);
      body.frequency.exponentialRampToValueAtTime(115, now + 0.08);
      bg.gain.setValueAtTime(0.22, now);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      noise.connect(bp);
      bp.connect(ng);
      ng.connect(dest);
      body.connect(bg);
      bg.connect(dest);

      noise.start(now);
      body.start(now);
      noise.stop(now + 0.18);
      body.stop(now + 0.11);
    } else if (kind === "hat" && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(7500, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      src.connect(hp);
      hp.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.08);
    }
  }

  // Switches the rhythm and restarts its clock from step 0, and starts the looping stem for the stem rhythms.
  // Steps are then dispatched from the audio clock by serviceArcade.
  public setRhythmPattern(rhythmId: RhythmId): RhythmId {
    const ctx = this.ensureContext();
    const previous = this.currentRhythm;
    this.currentRhythm = rhythmId;

    if (this.rhythmTimer !== null) {
      window.clearInterval(this.rhythmTimer);
      this.rhythmTimer = null;
    }
    if (this.rhythmLoopSrc) {
      try {
        this.rhythmLoopSrc.stop();
      } catch {}
      this.rhythmLoopSrc = null;
    }
    this.rhythmLoopGain = null;

    if (rhythmId === "off" || previous !== rhythmId) {
      if (previous !== "off") this.stashRecap(previous);
      this.resetArcade();
      this.rhythmStep = 0;
    }

    if (rhythmId === "off") {
      return this.currentRhythm;
    }

    const spec = RHYTHMS.find((r) => r.id === rhythmId) ?? RHYTHMS[0];
    const effectiveBpm = this.getSongBpm(rhythmId);
    this.synthParams = { ...this.synthParams, bpm: effectiveBpm };
    this.clockBpm = effectiveBpm;
    this.clockStepAt = 0;
    this.clockTimeAt = ctx.currentTime;
    this.lastDispatchedStep = -1;
    this.missCursor = 0;
    this.judgedSteps.clear();
    this.rhythmStep = 0;

    if (
      spec.loopFile &&
      !isBeamSong(rhythmId) &&
      this.playQuantizeMode !== "guide"
    ) {
      this.startStem(0);
    }

    return this.currentRhythm;
  }

  public getRhythmPattern(): RhythmId {
    return this.currentRhythm;
  }

  public triggerNote(params: {
    hand: HandSide;
    finger: FingerIndex;
    voice: VoiceId;
    mode: ModeId;
    yBend?: number;
    velocity?: number;
    fromLooper?: boolean;
  }): { noteName: string; solmization: string; freqHz: number } {
    const ctx = this.ensureContext();
    const modeSpec = MODES.find((m) => m.id === params.mode) ?? MODES[0];
    const tempSpec =
      TEMPERAMENTS.find((t) => t.id === this.temperament) ?? TEMPERAMENTS[0];

    const semitones =
      params.hand === "left"
        ? modeSpec.semitonesLeft
        : modeSpec.semitonesRight;
    const solm =
      params.hand === "left"
        ? modeSpec.solmizationLeft[params.finger]
        : modeSpec.solmizationRight[params.finger];
    const noteName = String(
      params.hand === "left"
        ? modeSpec.noteNamesLeft[params.finger]
        : modeSpec.noteNamesRight[params.finger]
    );

    const chordOffset = CHORD_ROOTS[this.chordRootIdx]?.semitones ?? 0;
    const semi = semitones[params.finger] + chordOffset;
    // The height bends the pitch by up to +/-3 cents (0.5 is none). Off, no note is bent, a recorded one included
    const yBend = this.thereminOn ? (params.yBend ?? this.lastCutoffNorm) : 0.5;
    const tempCents = tempSpec.centsOffset[((semi % 12) + 12) % 12] ?? 0;
    const fineDetuneCents = tempCents + (yBend - 0.5) * 6;
    const freqHz = D3_HZ * Math.pow(2, (semi + fineDetuneCents / 100) / 12);

    if (params.velocity !== undefined && params.velocity <= 0.01) {
      return { noteName, solmization: solm, freqHz };
    }

    const vel = Math.max(0.25, Math.min(1, params.velocity ?? 0.92));
    const now = ctx.currentTime;
    const dest = this.filterNode!;

    const attackSec = 0.004 + this.synthParams.attackNorm * 0.28;
    const releaseSec = 0.28 + this.synthParams.releaseNorm * 1.85;

    if (this.midiEnabled && this.midiOutputs.length > 0) {
      const midiNote = 50 + semi;
      const midiVel = Math.max(1, Math.min(127, Math.round(vel * 120)));
      for (const out of this.midiOutputs) {
        try {
          out.send([0x90, midiNote, midiVel]);
          setTimeout(() => {
            try {
              out.send([0x80, midiNote, 0]);
            } catch {}
          }, Math.round(releaseSec * 450));
        } catch {}
      }
    }

    let bestZone: (typeof SAMPLE_ZONES)[number] = SAMPLE_ZONES[0];
    let minSemiDiff = 999;
    for (const z of SAMPLE_ZONES) {
      const diff = Math.abs(semi - z.semi);
      if (diff < minSemiDiff) {
        minSemiDiff = diff;
        bestZone = z;
      }
    }

    const sampleKey = `${params.voice}-${bestZone.id}`;
    const sampleBuf = this.sampleBuffers.get(sampleKey);
    const useSample =
      Boolean(sampleBuf) &&
      (this.engineMode === "surge" || this.engineMode === "hybrid");

    if (useSample && sampleBuf) {
      const src = ctx.createBufferSource();
      src.buffer = sampleBuf;
      src.playbackRate.setValueAtTime(freqHz / bestZone.hz, now);

      const g = ctx.createGain();
      const gainScale = this.engineMode === "hybrid" ? 0.85 : 1.0;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(vel * gainScale, now + attackSec);
      g.gain.exponentialRampToValueAtTime(0.0008, now + attackSec + releaseSec);

      src.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + attackSec + releaseSec + 0.05);
    }

    if (!useSample || this.engineMode === "hybrid") {
      const synthScale = useSample ? 0.48 : 0.96;

      if (params.voice === "lute" || params.voice === "choir") {
        const detunes = [-16, -5, +5, +16];
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(
          0.26 * vel * synthScale,
          now + attackSec
        );
        env.gain.exponentialRampToValueAtTime(
          0.0008,
          now + attackSec + releaseSec
        );
        env.connect(dest);

        for (const d of detunes) {
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freqHz, now);
          osc.detune.setValueAtTime(d, now);
          osc.connect(env);
          osc.start(now);
          osc.stop(now + attackSec + releaseSec + 0.05);
        }
      } else if (params.voice === "cantus" || params.voice === "subbass") {
        const osc = ctx.createOscillator();
        const acidFilter = ctx.createBiquadFilter();
        const env = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freqHz, now);

        acidFilter.type = "lowpass";
        acidFilter.Q.value = 12.5;
        acidFilter.frequency.setValueAtTime(freqHz * 11, now);
        acidFilter.frequency.exponentialRampToValueAtTime(
          freqHz * 1.3,
          now + 0.24
        );

        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(
          0.34 * vel * synthScale,
          now + attackSec
        );
        env.gain.exponentialRampToValueAtTime(
          0.0008,
          now + attackSec + releaseSec * 0.75
        );

        osc.connect(acidFilter);
        acidFilter.connect(env);
        env.connect(dest);
        osc.start(now);
        osc.stop(now + attackSec + releaseSec * 0.75 + 0.05);
      } else {
        const detunes = [-22, -9, 0, +9, +22];
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(
          0.2 * vel * synthScale,
          now + attackSec
        );
        env.gain.exponentialRampToValueAtTime(
          0.0008,
          now + attackSec + releaseSec
        );
        env.connect(dest);

        for (const d of detunes) {
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freqHz, now);
          osc.detune.setValueAtTime(d, now);
          osc.connect(env);
          osc.start(now);
          osc.stop(now + attackSec + releaseSec + 0.05);
        }
      }

      // Sub oscillator: a triangle an octave down, scaled by synthParams.subLevel
      if (this.synthParams.subLevel > 0.02) {
        const sub = ctx.createOscillator();
        const subEnv = ctx.createGain();
        sub.type = "triangle";
        sub.frequency.setValueAtTime(freqHz * 0.5, now);
        subEnv.gain.setValueAtTime(0.001, now);
        subEnv.gain.linearRampToValueAtTime(
          0.28 * vel * this.synthParams.subLevel,
          now + attackSec
        );
        subEnv.gain.exponentialRampToValueAtTime(
          0.0008,
          now + attackSec + releaseSec
        );
        sub.connect(subEnv);
        subEnv.connect(dest);
        sub.start(now);
        sub.stop(now + attackSec + releaseSec + 0.05);
      }
    }

    if (this.loopRecording && !params.fromLooper) {
      const nowPerf = performance.now();
      if (!this.loopPlaying) {
        this.startLooperPlayback(nowPerf);
      }
      const offsetMs = (nowPerf - this.loopStartTime) % this.loopLengthMs;
      this.loopEvents.push({
        offsetMs,
        hand: params.hand,
        finger: params.finger,
        voice: params.voice,
        mode: params.mode,
        yBend,
        velocity: vel,
      });
    }

    return { noteName, solmization: solm, freqHz };
  }

  public setOnLoopTrigger(cb: ((ev: LoopEvent) => void) | null) {
    this.onLoopTriggerCallback = cb;
  }

  private startLooperPlayback(startNow = performance.now()) {
    this.loopPlaying = true;
    this.loopStartTime = startNow;
    this.lastLoopTick = 0;

    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
    }

    this.loopTimer = window.setInterval(() => {
      if (!this.loopPlaying) return;
      const elapsed = performance.now() - this.loopStartTime;
      const curPos = elapsed % this.loopLengthMs;

      for (const ev of this.loopEvents) {
        const wrapped = curPos < this.lastLoopTick;
        const hit = wrapped
          ? ev.offsetMs >= this.lastLoopTick || ev.offsetMs <= curPos
          : ev.offsetMs >= this.lastLoopTick && ev.offsetMs <= curPos;
        if (hit) {
          this.triggerNote({
            hand: ev.hand,
            finger: ev.finger,
            voice: ev.voice,
            mode: ev.mode,
            yBend: ev.yBend,
            velocity: ev.velocity * 0.85,
            fromLooper: true,
          });
          this.onLoopTriggerCallback?.(ev);
        }
      }
      this.lastLoopTick = curPos;
    }, 16);
  }

  public toggleRecordLoop(): {
    recording: boolean;
    playing: boolean;
    count: number;
  } {
    this.ensureContext();
    this.playMechanicalClick(1500);
    if (!this.loopRecording) {
      this.loopRecording = true;
      if (!this.loopPlaying) {
        this.startLooperPlayback(performance.now());
      }
    } else {
      this.loopRecording = false;
    }
    return {
      recording: this.loopRecording,
      playing: this.loopPlaying,
      count: this.loopEvents.length,
    };
  }

  public clearLoop() {
    this.playMechanicalClick(820);
    this.loopRecording = false;
    this.loopPlaying = false;
    this.loopEvents = [];
    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public getLoopState(): {
    recording: boolean;
    playing: boolean;
    progress: number;
    bar: number;
    count: number;
  } {
    if (!this.loopPlaying) {
      return {
        recording: false,
        playing: false,
        progress: 0,
        bar: 1,
        count: this.loopEvents.length,
      };
    }
    const elapsed = Math.max(0, performance.now() - this.loopStartTime);
    const progress = (elapsed % this.loopLengthMs) / this.loopLengthMs;
    const bar = Math.floor(progress * 4) + 1;
    return {
      recording: this.loopRecording,
      playing: this.loopPlaying,
      progress,
      bar,
      count: this.loopEvents.length,
    };
  }

  public getAudioEnergy(): { rms: number; low: number; high: number } {
    if (!this.analyser || !this.freqData) {
      return { rms: 0, low: 0, high: 0 };
    }
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    let lowSum = 0;
    let highSum = 0;
    const n = this.freqData.length;
    for (let i = 0; i < n; i++) {
      const v = this.freqData[i] / 255;
      sum += v * v;
      if (i < 16) lowSum += v;
      else if (i < 64) highSum += v;
    }
    return {
      rms: Math.sqrt(sum / n),
      low: lowSum / 16,
      high: highSum / 48,
    };
  }

  public getWaveformSnapshot(): number[] {
    if (!this.analyser || !this.timeData) {
      return Array(32).fill(0);
    }
    this.analyser.getByteTimeDomainData(this.timeData);
    const out: number[] = [];
    const step = Math.floor(this.timeData.length / 32);
    for (let i = 0; i < 32; i++) {
      out.push((this.timeData[i * step] - 128) / 128);
    }
    return out;
  }
}

export const audioEngine = new ManusAudioEngine();
