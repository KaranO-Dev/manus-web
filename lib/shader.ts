/*
  The stage shader: one full-screen fragment pass with two states.

  No camera (u_hasCamera == 0): a dark instrument field of grid, concentric rings, a standing-wave contour and
  Voronoi facet lines, tinted with the look's accent colour and bent by the note ripples and the palms. The
  hands, beams and note labels are drawn over it by the 2D canvas, not here.

  Camera live (u_hasCamera == 1): u_handMask, a silhouette that StageCanvas paints from the hand landmarks,
  splits the picture into hands and background. The mask's gradient gives the hand's edge normal, which offsets
  the background lookup like a refracting glass edge. The background is blurred with 8 taps on a golden-angle
  spiral, each colour channel offset by a different amount, then graded by the selected look (u_look). The
  hands are drawn from the sharp camera picture in front.
*/

export type ShaderLookId =
  | "speculum"
  | "vellum"
  | "ultramarine"
  | "woodcut"
  | "mercury"
  | "stained";

export interface ShaderLookSpec {
  id: ShaderLookId;
  index: number;
  code: string;
  name: string;
  shortDesc: string;
  accentHex: string;
}

export const SHADER_LOOKS: ShaderLookSpec[] = [
  {
    id: "speculum",
    index: 0,
    code: "FX-I",
    name: "Mirror Dimension",
    shortDesc: "Refractive prism shards & kaleidoscopic folding behind the hand",
    accentHex: "#3B7BFF",
  },
  {
    id: "vellum",
    index: 1,
    code: "FX-II",
    name: "Rubric Vellum",
    shortDesc: "Archival parchment grading & vermilion ink shadows",
    accentHex: "#FF3B1D",
  },
  {
    id: "ultramarine",
    index: 2,
    code: "FX-III",
    name: "Lapis Vortex",
    shortDesc: "Deep cobalt swirl & golden-angle chromatic bokeh",
    accentHex: "#4E8BFF",
  },
  {
    id: "woodcut",
    index: 3,
    code: "FX-IV",
    name: "1480 Woodcut",
    shortDesc: "Reactive woodblock engraving screen behind sharp hands",
    accentHex: "#F5B82E",
  },
  {
    id: "mercury",
    index: 4,
    code: "FX-V",
    name: "Liquid Mercury",
    shortDesc: "Specular quicksilver chrome & temporal echo trails",
    accentHex: "#16C784",
  },
  {
    id: "stained",
    index: 5,
    code: "FX-VI",
    name: "Vitrum Sacrum",
    shortDesc: "Crystalline Voronoi rose mosaic & harmonic light rays",
    accentHex: "#E85DDF",
  },
];

export const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 1.0 - (a_pos.y * 0.5 + 0.5));
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;       // The webcam picture
uniform vec2 u_camScale;       // The part of the webcam's width and height the stage shows (lib/camera-fit.ts)
uniform sampler2D u_handMask;  // Feathered hand mask: R = the hand, G = a wider halo, B = the motion trail
uniform vec2 u_res;
uniform float u_time;
uniform int u_hasCamera;
uniform int u_look;
uniform float u_audioRms;
uniform float u_audioLow;
uniform float u_audioHigh;
uniform float u_spaceWarp;     // 0..1: the E2 PRISM WARP knob, eased toward the hand's spread
uniform float u_blurAmount;    // 0..1 background blur: the E4 knob, nudged up as the hand closes
uniform float u_wristTwist;    // 0..1: the E3 ROTATIO knob, eased toward the wrist's roll
uniform float u_portalSurge;   // 0..1 burst on a hand macro (0.85) or the G key (1.0), decaying about 6% a frame
uniform vec2 u_palmLeft;
uniform vec2 u_palmRight;
uniform vec4 u_ripples[8];     // xy=pos, z=age(0..1), w=finger(0..3)

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(262144.0, 32768.0) * n);
}

// Voronoi cell distance and facet normal, for the Mirror Dimension and Vitrum Sacrum looks
vec3 voronoiFacet(vec2 x, float t) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md = 8.0;
  vec2 bestVec = vec2(0.0);
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.42 * sin(t * 0.55 + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        bestVec = r;
        id = o.x;
      }
    }
  }
  return vec3(sqrt(md), bestVec.x + bestVec.y, id);
}

// The stage before the camera is on: a dark grid, rings and glass facets that move with the sound
vec3 renderOledField(vec2 uv, vec2 aspect, vec2 disp, vec3 rippleLight, float palmAura) {
  vec2 p = (uv + disp * 0.45 - 0.5) * aspect;
  float r = length(p);
  float a = atan(p.y, p.x);

  // Near-black base with a fine grid
  vec3 base = vec3(0.032, 0.034, 0.042);
  vec2 gridUv = fract(p * 14.0);
  float microGrid = smoothstep(0.96, 1.0, max(gridUv.x, gridUv.y));
  base += vec3(0.08, 0.09, 0.12) * microGrid * 0.45;

  // Concentric rings
  float ring1 = smoothstep(0.004, 0.0, abs(r - 0.24));
  float ring2 = smoothstep(0.003, 0.0, abs(r - 0.38));
  float ring3 = smoothstep(0.003, 0.0, abs(r - 0.52));

  // A standing wave along the second ring, louder with the audio level
  float waveR = r + sin(a * (6.0 + float(u_look) * 2.0) + u_time * 2.2) * (0.012 + u_audioRms * 0.045 + u_spaceWarp * 0.02);
  float harmonicContour = smoothstep(0.005, 0.0, abs(waveR - 0.34));

  // Voronoi glass facets behind the rings
  vec3 vFacet = voronoiFacet(p * (4.0 + u_spaceWarp * 3.5), u_time * 0.35 + u_wristTwist * 2.0);
  float facetLine = smoothstep(0.05, 0.0, abs(vFacet.x - 0.36));

  vec3 accent = u_look == 0 ? vec3(0.23, 0.48, 1.00) :
                u_look == 1 ? vec3(1.00, 0.23, 0.11) :
                u_look == 2 ? vec3(0.30, 0.55, 1.00) :
                u_look == 3 ? vec3(0.96, 0.72, 0.18) :
                u_look == 4 ? vec3(0.09, 0.78, 0.52) :
                              vec3(0.88, 0.36, 0.86);

  base += accent * (ring1 * 0.35 + ring2 * 0.22 + ring3 * 0.15);
  base += mix(accent, vec3(0.96, 0.72, 0.18), 0.4) * harmonicContour * 0.65;
  base += accent * facetLine * (0.12 + u_portalSurge * 0.45 + palmAura * 0.2);
  base += rippleLight * 0.85;
  base += accent * palmAura * (0.09 + u_audioRms * 0.25);

  return base;
}

vec3 fetchWebcam(vec2 uv) {
  vec2 c = 0.5 + (clamp(uv, 0.002, 0.998) - 0.5) * u_camScale;
  return texture(u_tex, vec2(1.0 - c.x, c.y)).rgb;
}

void main() {
  vec2 aspect = vec2(u_res.x / max(1.0, u_res.y), 1.0);
  vec2 uv = v_uv;

  // Ripples from pinches, up to eight at once
  vec2 bgDisp = vec2(0.0);
  float rippleGlow = 0.0;
  vec3 rippleTint = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    vec4 rp = u_ripples[i];
    if (rp.z > 0.0 && rp.z < 1.0) {
      vec2 delta = (uv - rp.xy) * aspect;
      float dist = length(delta);
      float radius = rp.z * 0.58;
      float ring = exp(-pow((dist - radius) * 20.0, 2.0)) * (1.0 - rp.z);
      vec2 dir = dist > 0.0001 ? delta / dist : vec2(0.0);
      bgDisp += dir * ring * 0.042;
      rippleGlow += ring;

      // One colour per finger: vermilion, gold, cobalt, emerald
      vec3 fCol = rp.w < 0.5 ? vec3(1.00, 0.23, 0.11) :
                  rp.w < 1.5 ? vec3(0.96, 0.72, 0.18) :
                  rp.w < 2.5 ? vec3(0.23, 0.48, 1.00) :
                               vec3(0.09, 0.78, 0.52);
      rippleTint += fCol * ring;
    }
  }

  // A swirl around each palm
  float palmField = 0.0;
  vec2 vortexOffset = vec2(0.0);
  float twistAngle = (u_wristTwist - 0.5) * 2.4 + u_portalSurge * 2.0;

  if (u_palmLeft.x >= 0.0) {
    vec2 dL = (uv - u_palmLeft) * aspect;
    float rL = length(dL);
    float falloff = exp(-rL * 4.0);
    palmField += falloff;
    float s = sin(twistAngle * falloff);
    float c = cos(twistAngle * falloff);
    vec2 swirled = vec2(dL.x * c - dL.y * s, dL.x * s + dL.y * c) - dL;
    vortexOffset += swirled * (0.32 + u_spaceWarp * 0.58);
  }
  if (u_palmRight.x >= 0.0) {
    vec2 dR = (uv - u_palmRight) * aspect;
    float rR = length(dR);
    float falloff = exp(-rR * 4.0);
    palmField += falloff;
    float s = sin(-twistAngle * falloff);
    float c = cos(-twistAngle * falloff);
    vec2 swirled = vec2(dR.x * c - dR.y * s, dR.x * s + dR.y * c) - dR;
    vortexOffset += swirled * (0.32 + u_spaceWarp * 0.58);
  }

  // Camera off: draw the pre-camera stage and stop here
  if (u_hasCamera == 0) {
    vec3 oledCol = renderOledField(uv, aspect, bgDisp + vortexOffset * 0.2, rippleTint, palmField);
    float vig = smoothstep(1.25, 0.25, length((uv - 0.5) * aspect));
    outColor = vec4(clamp(oledCol * (0.8 + 0.2 * vig), 0.0, 1.0), 1.0);
    return;
  }

  // Camera on: read the hand mask and the edge normal used for refraction
  vec2 texel = 1.0 / max(vec2(1.0), u_res);
  vec3 maskC = texture(u_handMask, uv).rgb;
  float maskR_x1 = texture(u_handMask, uv + vec2(texel.x * 4.0, 0.0)).r;
  float maskR_x0 = texture(u_handMask, uv - vec2(texel.x * 4.0, 0.0)).r;
  float maskR_y1 = texture(u_handMask, uv + vec2(0.0, texel.y * 4.0)).r;
  float maskR_y0 = texture(u_handMask, uv - vec2(0.0, texel.y * 4.0)).r;

  // Normal along the hand's edge, from the mask's gradient
  vec2 handNormal = vec2(maskR_x1 - maskR_x0, maskR_y1 - maskR_y0);
  float edgeStrength = clamp(length(handNormal) * 2.6, 0.0, 1.0);

  // Soft foreground alpha, so the hand's edge doesn't stair-step
  float handFg = smoothstep(0.22, 0.76, maskC.r);
  float portalAura = clamp(maskC.g - handFg * 0.85, 0.0, 1.0);
  float motionTrail = maskC.b;

  // Fold the background's coordinates, behind the hand only
  vec2 bgUv = uv + bgDisp + vortexOffset * 0.16 + handNormal * 0.045 + motionTrail * 0.015;

  if (u_look == 0 || u_portalSurge > 0.05) {
    // Offset each Voronoi cell, for the prism look
    vec2 p = (bgUv - 0.5) * aspect;
    float shardScale = 4.2 + u_spaceWarp * 4.5;
    vec3 vCell = voronoiFacet(p * shardScale, u_time * 0.65);
    bgUv += vCell.yz * 0.036 * (0.45 + u_spaceWarp * 0.75 + u_portalSurge);
  }

  // Background blur: 8 taps on a golden-angle spiral, with a small RGB split
  float bokehRadius = (0.0025 + u_blurAmount * 0.014 + rippleGlow * 0.015 + u_audioRms * 0.009 + portalAura * 0.012);
  vec3 bgAccum = vec3(0.0);
  const float GOLDEN_ANGLE = 2.39996323;

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float rTap = sqrt((fi + 0.5) / 8.0) * bokehRadius;
    float theta = fi * GOLDEN_ANGLE;
    vec2 tapOff = vec2(cos(theta), sin(theta)) * rTap;
    // Sample red, green and blue at slightly different offsets
    float chR = fetchWebcam(bgUv + tapOff * 1.28).r;
    float chG = fetchWebcam(bgUv + tapOff * 0.95).g;
    float chB = fetchWebcam(bgUv + tapOff * 0.64).b;
    bgAccum += vec3(chR, chG, chB);
  }
  vec3 bgCol = bgAccum / 8.0;
  float bgLuma = dot(bgCol, vec3(0.299, 0.587, 0.114));

  // Grade the background with the selected look
  if (u_look == 0) {
    // FX-I Mirror Dimension: dark glass with cobalt and gold facets
    vec3 darkGlass = vec3(0.04, 0.05, 0.09);
    vec3 cobaltGlass = vec3(0.16, 0.32, 0.64);
    vec3 specHigh = vec3(0.94, 0.88, 0.72);
    vec3 graded = mix(darkGlass, cobaltGlass, smoothstep(0.06, 0.58, bgLuma));
    graded = mix(graded, specHigh, smoothstep(0.55, 0.95, bgLuma));
    vec3 vCell = voronoiFacet((bgUv - 0.5) * aspect * 5.5, u_time * 0.5);
    float seam = smoothstep(0.06, 0.0, vCell.x);
    graded += vec3(0.45, 0.72, 1.0) * seam * 0.32;
    bgCol = mix(bgCol, graded, 0.78);
  } else if (u_look == 1) {
    // FX-II Rubric Vellum: warm parchment with vermilion shadows
    vec3 ink = vec3(0.06, 0.055, 0.05);
    vec3 rubric = vec3(0.82, 0.21, 0.11);
    vec3 vellum = vec3(0.95, 0.91, 0.82);
    vec3 duotone = mix(ink, rubric, smoothstep(0.08, 0.56, bgLuma));
    vec3 parchment = mix(duotone, vellum, smoothstep(0.44, 0.94, bgLuma));
    bgCol = mix(bgCol, parchment, 0.76);
  } else if (u_look == 2) {
    // FX-III Lapis Vortex: deep ultramarine with a gold bloom
    vec3 abyss = vec3(0.03, 0.05, 0.14);
    vec3 lapis = vec3(0.14, 0.34, 0.82);
    vec3 leaf = vec3(0.96, 0.78, 0.28);
    vec3 mapped = mix(abyss, lapis, smoothstep(0.04, 0.60, bgLuma));
    mapped = mix(mapped, leaf, smoothstep(0.58, 0.95, bgLuma + u_audioHigh * 0.22));
    bgCol = mix(bgCol, mapped, 0.84);
  } else if (u_look == 3) {
    // FX-IV 1480 Woodcut: an engraved halftone screen
    vec2 px = gl_FragCoord.xy;
    float angle = 0.58;
    vec2 rot = vec2(px.x * cos(angle) - px.y * sin(angle), px.x * sin(angle) + px.y * cos(angle));
    float pitch = 5.2 - u_audioLow * 1.4;
    float wave = 0.5 + 0.5 * sin(rot.y / pitch * 6.28318);
    float inked = smoothstep(wave - 0.18, wave + 0.18, bgLuma + rippleGlow * 0.3);
    bgCol = mix(vec3(0.06, 0.055, 0.05), vec3(0.94, 0.91, 0.85), inked);
  } else if (u_look == 4) {
    // FX-V Liquid Mercury: chrome with specular ripples
    float chrome = 0.5 + 0.5 * sin(bgLuma * 16.0 + u_time * 1.6 + palmField * 3.8);
    vec3 silver = mix(vec3(0.07, 0.08, 0.10), vec3(0.92, 0.95, 0.99), chrome);
    bgCol = mix(bgCol, silver, 0.82);
  } else {
    // FX-VI Vitrum Sacrum: a stained-glass Voronoi mosaic
    vec3 cell = voronoiFacet((bgUv - 0.5) * aspect * 12.0, u_time * 0.25);
    float leadLine = smoothstep(0.05, 0.12, cell.x);
    vec3 jewel = 0.55 + 0.45 * cos(6.2831 * (cell.z + vec3(0.0, 0.33, 0.67)));
    bgCol = mix(bgCol, jewel * (0.45 + 0.85 * bgLuma), 0.76) * leadLine;
  }

  bgCol += rippleTint * 0.68;
  bgCol += vec3(0.35, 0.62, 1.0) * motionTrail * 0.28;

  // The hand itself, ungraded, in front of the background
  // Bend the picture slightly along the hand's edge, using handNormal
  vec2 fgUv = uv - handNormal * 0.006 * (1.0 - handFg);
  vec3 rawHand = fetchWebcam(fgUv);
  vec3 fgHandCol = pow(rawHand, vec3(0.95)) * 1.04;

  // A thin bright line along the hand's contour
  vec3 glassCaustic = mix(
    vec3(0.45, 0.75, 1.0),
    vec3(0.98, 0.82, 0.38),
    0.5 + 0.5 * sin(u_time * 3.5 + uv.y * 10.0)
  );

  vec3 finalCol = mix(bgCol, fgHandCol, handFg);
  finalCol += glassCaustic * (edgeStrength * 0.48 + portalAura * 0.22) * (0.7 + u_audioRms * 0.5 + u_portalSurge * 0.6);

  float grain = (hash21(uv * u_res + fract(u_time * 17.0)) - 0.5) * 0.022;
  float vig = smoothstep(1.25, 0.28, length((uv - 0.5) * aspect));
  finalCol = (finalCol + grain) * (0.78 + 0.22 * vig);

  outColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
`;
