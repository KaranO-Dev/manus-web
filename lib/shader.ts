/*
  The stage shader: one full-screen fragment pass with two states.

  No camera (u_hasCamera == 0): a dark instrument field of grid, concentric rings, a standing-wave contour and
  Voronoi facet edges, tinted with the look's accent colour and bent by the note ripples and the palms. The
  hands, beams and note labels are drawn over it by the 2D canvas, not here.

  Camera live (u_hasCamera == 1): u_handMask, a silhouette that StageCanvas paints from the hand landmarks,
  splits the picture into hands and background. The mask's gradient gives the hand's edge normal, which offsets
  the background lookup like a refracting glass edge. The background is blurred with 8 taps on a golden-angle
  spiral, each colour channel offset by a different amount, then made into the selected look's material
  (u_look): glass shards, parchment, lapis stone, an engraving, liquid chrome, or haze lit from behind the
  hands. The hands are drawn from the sharp camera picture in front, their shadows lifted a little, with an edge
  in the look's own material.
*/

export type ShaderLookId =
  | "speculum"
  | "vellum"
  | "ultramarine"
  | "woodcut"
  | "mercury"
  | "lumen";

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
    shortDesc: "Tilted glass shards with lit facets and fine cobalt and gold seams behind the hand",
    accentHex: "#3B7BFF",
  },
  {
    id: "vellum",
    index: 1,
    code: "FX-II",
    name: "Rubric Vellum",
    shortDesc: "Parchment with its fibre and ruled lines, and a vermilion ink shadow under each hand",
    accentHex: "#FF3B1D",
  },
  {
    id: "ultramarine",
    index: 2,
    code: "FX-III",
    name: "Lapis Vortex",
    shortDesc: "Lapis stone with calcite veins and gold flecks, turning round the palms",
    accentHex: "#4E8BFF",
  },
  {
    id: "woodcut",
    index: 3,
    code: "FX-IV",
    name: "1480 Woodcut",
    shortDesc: "Engraved lines that bend round the hands, crosshatched in the shadows",
    accentHex: "#F5B82E",
  },
  {
    id: "mercury",
    index: 4,
    code: "FX-V",
    name: "Liquid Mercury",
    shortDesc: "Liquid chrome that reflects a studio and rings with each note",
    accentHex: "#DCE6F5",
  },
  {
    id: "lumen",
    index: 5,
    code: "FX-VI",
    name: "Lumen Haze",
    shortDesc: "Haze lit from behind the hands, light shafts past the fingers, laser sheets on the beams",
    accentHex: "#FFC46B",
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
uniform float u_strings[8];    // How hard each beam is ringing: 1 when played, then decaying

const float TAU = 6.2831853;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(262144.0, 32768.0) * n);
}

// Smooth value noise and its sums, for paper fibre, stone, haze and the liquid surface
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic easing: its slope is smooth across cell edges too, so a surface lit from this noise shows no grid
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Each layer is turned against the last, so the sums have no grain along the x and y axes
const mat2 TURN = mat2(0.8, -0.6, 0.6, 0.8);

float fbm2(vec2 p) {
  return vnoise(p) * 0.65 + vnoise(TURN * p * 2.03 + 17.1) * 0.35;
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = TURN * p * 2.02 + vec2(11.3, 5.7);
    a *= 0.5;
  }
  return v / 0.875;
}

float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = TURN * p * 2.03 + vec2(7.9, 13.4);
    a *= 0.5;
  }
  return v / 0.9375;
}

// A moving Voronoi point for each cell
vec2 cellPoint(vec2 cell, float t) {
  return 0.5 + 0.42 * sin(t * 0.55 + TAU * hash22(cell));
}

// Voronoi cells: x = distance to the nearest edge between two cells, y = the cell's id (0..1), zw = the vector to
// its point. Two passes over the 3 x 3 neighbourhood: the nearest point first, then the nearest bisector
vec4 voronoiEdges(vec2 x, float t) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 mg = vec2(0.0);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + cellPoint(n + g, t) - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
        mg = g;
      }
    }
  }
  float edge = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + cellPoint(n + g, t) - f;
      vec2 d = r - mr;
      if (dot(d, d) > 0.00001) edge = min(edge, dot(0.5 * (mr + r), normalize(d)));
    }
  }
  return vec4(edge, hash21(n + mg), mr);
}

// Each look's own colour: the camera-off field, the motion trail and the rim of the hand
vec3 lookAccent(int look) {
  return look == 0 ? vec3(0.23, 0.48, 1.00) :
         look == 1 ? vec3(0.80, 0.20, 0.10) :
         look == 2 ? vec3(0.30, 0.55, 1.00) :
         look == 3 ? vec3(0.96, 0.72, 0.18) :
         look == 4 ? vec3(0.86, 0.92, 1.00) :
                     vec3(1.00, 0.84, 0.62);
}

// The four channel colours of the console, one per finger: blue, ochre, silver (as a warm white) and orange
vec3 channelColour(int i) {
  return i == 0 ? vec3(0.18, 0.50, 0.98) :
         i == 1 ? vec3(0.96, 0.65, 0.14) :
         i == 2 ? vec3(0.92, 0.90, 0.86) :
                  vec3(1.00, 0.23, 0.18);
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

  // Glass facet edges behind the rings
  vec4 vFacet = voronoiEdges(p * (4.0 + u_spaceWarp * 3.5), u_time * 0.35 + u_wristTwist * 2.0);
  float facetLine = 1.0 - smoothstep(0.0, 0.02 + fwidth(vFacet.x), vFacet.x);

  vec3 accent = lookAccent(u_look);

  base += accent * (ring1 * 0.35 + ring2 * 0.22 + ring3 * 0.15);
  base += mix(accent, vec3(0.96, 0.72, 0.18), 0.4) * harmonicContour * 0.65;
  base += accent * facetLine * (0.10 + u_portalSurge * 0.45 + palmAura * 0.2);
  base += rippleLight * 0.85;
  base += accent * palmAura * (0.09 + u_audioRms * 0.25);

  return base;
}

vec3 fetchWebcam(vec2 uv) {
  vec2 c = 0.5 + (clamp(uv, 0.002, 0.998) - 0.5) * u_camScale;
  return texture(u_tex, vec2(1.0 - c.x, c.y)).rgb;
}

// FX-V: a studio around the liquid chrome, seen in its reflection: a dark floor, a bright horizon and two softboxes
vec3 studioReflection(vec3 r) {
  float up = r.y;
  vec3 col = mix(vec3(0.03, 0.033, 0.04), vec3(0.26, 0.28, 0.32), smoothstep(-0.5, 0.7, up));
  col += vec3(1.0) * exp(-pow((up + 0.04) * 9.0, 2.0)) * 0.75;
  vec2 box1 = abs(r.xy - vec2(-0.42, 0.46)) - vec2(0.16, 0.09);
  vec2 box2 = abs(r.xy - vec2(0.48, 0.30)) - vec2(0.07, 0.20);
  col += vec3(1.0, 0.98, 0.95) * (1.0 - smoothstep(0.0, 0.03, max(box1.x, box1.y))) * 1.4;
  col += vec3(0.92, 0.96, 1.0) * (1.0 - smoothstep(0.0, 0.03, max(box2.x, box2.y))) * 1.1;
  return col;
}

// FX-V: the liquid's height: slow swells, plus a ring for each note played
float mercuryHeight(vec2 q) {
  vec2 w = q * 1.1 + vec2(u_time * 0.10, -u_time * 0.07);
  return fbm3(w + 0.6 * vec2(vnoise(TURN * w * 0.7), vnoise(TURN * w * 0.7 + 4.2))) * 0.55 + vnoise(TURN * q * 2.6 - u_time * 0.2) * 0.08;
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

      // One colour per finger, the console's four channel colours
      rippleTint += channelColour(int(rp.w + 0.5)) * ring;
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

  // Normal along the hand's edge, from the mask's gradient (it points into the hand)
  vec2 handNormal = vec2(maskR_x1 - maskR_x0, maskR_y1 - maskR_y0);
  float edgeStrength = clamp(length(handNormal) * 2.6, 0.0, 1.0);

  // Soft foreground alpha, so the hand's edge doesn't stair-step
  float handFg = smoothstep(0.3, 0.8, maskC.r);
  float portalAura = clamp(maskC.g - handFg * 0.85, 0.0, 1.0);
  float motionTrail = maskC.b;

  // Fold the background's coordinates, behind the hand only
  vec2 bgUv = uv + bgDisp + vortexOffset * 0.16 + handNormal * 0.045 + motionTrail * 0.015;

  // FX-I's glass shards, and every look's on a surge: each shard is a pane of glass tilted its own way, so it
  // shows the room from a slightly different place
  vec4 shard = vec4(1.0, 0.0, 0.0, 0.0);
  vec2 shardTilt = vec2(0.0);
  if (u_look == 0 || u_portalSurge > 0.05) {
    vec2 p = (bgUv - 0.5) * aspect;
    shard = voronoiEdges(p * (4.2 + u_spaceWarp * 4.5), u_time * 0.65);
    shardTilt = vec2(cos(shard.y * TAU), sin(shard.y * TAU));
    bgUv += shardTilt * 0.026 * (0.6 + u_spaceWarp * 0.8 + u_portalSurge);
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

  // FX-VI's light sits above the stage, moved a little by the wrist's roll
  vec2 lightPos = vec2(0.5 + (u_wristTwist - 0.5) * 0.5, 0.02);
  float shaftLight = 1.0;

  // Grade the background with the selected look
  if (u_look == 0) {
    // FX-I Mirror Dimension: obsidian glass in cobalt and gold, each shard lit by its tilt, with fine bright seams
    vec3 glass = mix(vec3(0.025, 0.035, 0.075), vec3(0.13, 0.29, 0.66), smoothstep(0.05, 0.62, bgLuma));
    glass = mix(glass, vec3(0.96, 0.88, 0.68), smoothstep(0.66, 0.98, bgLuma));
    float lightAngle = u_time * 0.25 + (u_wristTwist - 0.5) * 3.0;
    float facing = dot(shardTilt, vec2(cos(lightAngle), sin(lightAngle)));
    vec3 graded = glass * (0.55 + 0.75 * (0.5 + 0.5 * facing));
    graded += vec3(0.85, 0.92, 1.0) * pow(max(0.0, facing), 14.0) * 0.32;
    float seam = 1.0 - smoothstep(0.004, 0.022 + fwidth(shard.x) * 1.5, shard.x);
    vec3 seamCol = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.82, 0.42), step(0.62, fract(shard.y * 7.31)));
    graded += seamCol * seam * (0.5 + u_audioHigh * 0.7 + u_portalSurge * 0.6);
    bgCol = mix(bgCol, graded, 0.8);
  } else if (u_look == 1) {
    // FX-II Rubric Vellum: parchment with its fibre and stains, faint ruled lines, and a vermilion ink shadow
    // that each hand casts down and to the right
    vec2 pq = uv * aspect;
    float fibre = vnoise(pq * vec2(320.0, 46.0)) * 0.55 + vnoise(pq * vec2(110.0, 20.0)) * 0.45;
    float stain = fbm3(pq * 2.6 + 3.1);
    vec3 ink = vec3(0.07, 0.055, 0.045);
    vec3 rubric = vec3(0.78, 0.20, 0.10);
    vec3 vellum = vec3(0.93, 0.87, 0.74);
    vec3 duo = mix(ink, rubric, smoothstep(0.03, 0.2, bgLuma));
    vec3 parchment = mix(duo, vellum, smoothstep(0.16, 0.46, bgLuma));
    parchment *= 0.9 + 0.16 * fibre - 0.12 * smoothstep(0.5, 0.85, stain);
    float rows = 22.0;
    float rowPx = abs(fract(uv.y * rows) - 0.5) * u_res.y / rows;
    float ruled = 1.0 - smoothstep(0.4, 1.4, rowPx);
    parchment = mix(parchment, parchment * vec3(0.82, 0.55, 0.45), ruled * 0.5 * smoothstep(0.2, 0.5, bgLuma));
    float inkShadow = smoothstep(0.25, 0.75, texture(u_handMask, uv - vec2(0.012, 0.02)).r);
    parchment = mix(parchment, parchment * vec3(0.9, 0.3, 0.18), inkShadow * 0.7);
    bgCol = mix(bgCol, parchment, 0.85);
  } else if (u_look == 2) {
    // FX-III Lapis Vortex: lapis stone, deep blue with lighter mottling, white calcite veins and gold flecks that
    // catch the light with the treble, all turning round the palms
    vec2 q = (bgUv - 0.5) * aspect * 2.4 + vortexOffset * 1.6;
    vec2 w = vec2(fbm3(q + vec2(0.0, u_time * 0.05)), fbm3(q + vec2(5.2, 1.3) - u_time * 0.04));
    float stone = fbm4(q + 1.7 * w + u_wristTwist);
    vec3 lapis = mix(vec3(0.015, 0.035, 0.16), vec3(0.08, 0.20, 0.66), smoothstep(0.22, 0.78, stone));
    lapis = mix(lapis, vec3(0.28, 0.46, 0.96), smoothstep(0.6, 0.9, stone) * 0.7);
    lapis *= 0.8 + 0.4 * fbm2(q * 9.0);
    float vein = 1.0 - smoothstep(0.0, 0.035 + fwidth(w.x) * 1.5, abs(w.x - 0.53));
    lapis = mix(lapis, vec3(0.78, 0.83, 0.9), vein * 0.3);
    vec2 gp = q * 22.0;
    float gh = hash21(floor(gp));
    float size = 0.1 + 0.22 * fract(gh * 31.7);
    float fleck = step(0.978, gh) * (1.0 - smoothstep(size * 0.5, size, length(fract(gp) - 0.5)));
    float glint = 0.5 + 0.5 * sin(u_time * 3.0 + gh * 40.0);
    lapis += vec3(1.0, 0.78, 0.30) * fleck * (0.35 + glint * 0.4 + u_audioHigh * 1.2);
    lapis *= 0.72 + 0.6 * bgLuma;
    bgCol = mix(bgCol, lapis, 0.88);
  } else if (u_look == 3) {
    // FX-IV 1480 Woodcut: cut lines on warm paper, thicker where the picture is darker. Near a hand the lines
    // bend round it like the contour lines of an engraving, and the shadows are crosshatched
    vec2 px = gl_FragCoord.xy;
    float angle = 0.58 + (u_wristTwist - 0.5) * 0.6;
    vec2 rot = vec2(px.x * cos(angle) - px.y * sin(angle), px.x * sin(angle) + px.y * cos(angle));
    // About 130 lines down the stage, whatever its resolution, so the cuts stay bold on a dense screen
    float pitch = max(6.0, u_res.y / 130.0) * (1.0 - u_audioLow * 0.18);
    float halo = maskC.g;
    float tone = clamp(bgLuma * 1.1 + rippleGlow * 0.3, 0.0, 1.0);
    float wave1 = 0.5 + 0.5 * cos((rot.y / pitch + halo * 7.0) * TAU);
    float aa1 = fwidth(wave1) + 0.04;
    float cut1 = 1.0 - smoothstep((1.0 - tone) - aa1, (1.0 - tone) + aa1, wave1);
    vec2 rot2 = vec2(px.x * cos(-0.62) - px.y * sin(-0.62), px.x * sin(-0.62) + px.y * cos(-0.62));
    float wave2 = 0.5 + 0.5 * cos((rot2.y / (pitch * 1.15) + halo * 5.0) * TAU);
    float aa2 = fwidth(wave2) + 0.04;
    float shade = smoothstep(0.42, 0.08, tone) * 0.75;
    float cut2 = 1.0 - smoothstep(shade - aa2, shade + aa2, wave2);
    float fibre = vnoise(px * vec2(0.35, 0.06));
    vec3 paper = vec3(0.93, 0.89, 0.80) * (0.96 + 0.06 * fibre);
    vec3 inkCol = vec3(0.07, 0.06, 0.05);
    bgCol = mix(paper, inkCol, max(cut1, cut2 * step(0.001, shade)));
  } else if (u_look == 4) {
    // FX-V Liquid Mercury: liquid chrome. Its surface swells slowly and rings with each note, and reflects a
    // studio and, faintly, the room
    vec2 q = (bgUv - 0.5) * aspect * 2.0;
    float e = 0.015;
    float h0 = mercuryHeight(q);
    float hx = mercuryHeight(q + vec2(e, 0.0));
    float hy = mercuryHeight(q + vec2(0.0, e));
    vec2 slope = vec2(hx - h0, hy - h0) / e * 0.16;
    slope += bgDisp * 9.0 + vortexOffset * 1.2 + handNormal * 0.5 * (1.0 - handFg) + motionTrail * 0.3;
    slope *= min(1.0, 1.2 / max(0.0001, length(slope)));
    vec3 n = normalize(vec3(-slope, 1.0));
    vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
    vec3 env = studioReflection(vec3(r.x, -r.y, r.z));
    vec3 room = fetchWebcam(uv + n.xy * 0.12);
    float fresnel = pow(1.0 - n.z, 3.0);
    vec3 chrome = env * vec3(0.90, 0.94, 1.0) * (0.85 + fresnel * 0.9) + room * 0.12;
    // Highlights roll off instead of clipping to flat white
    chrome = 1.0 - exp(-chrome * 1.5);
    bgCol = mix(bgCol, chrome, 0.9);
  } else {
    // FX-VI Lumen Haze: a dark room full of haze, lit from above. The hands stand in the light, so it streams
    // past the fingers in shafts and leaves their shadows in the haze. The eight beams are sheets of laser light
    // in the console's channel colours that flare when they are played
    vec2 toLight = (lightPos - uv) / 24.0 * 0.9;
    vec2 s = uv + toLight * hash21(gl_FragCoord.xy + fract(u_time * 7.0));
    float lit = 0.0;
    float weight = 1.0;
    float total = 0.0;
    for (int i = 0; i < 24; i++) {
      s += toLight;
      lit += (1.0 - smoothstep(0.25, 0.7, texture(u_handMask, s).r)) * weight;
      total += weight;
      weight *= 0.965;
    }
    shaftLight = lit / total;
    float shafts = shaftLight * shaftLight;
    shafts *= shafts;
    float d = length((uv - lightPos) * aspect);
    float near = exp(-d * 2.4) * 1.1 + exp(-d * 0.8) * 0.38;
    float haze = 0.35 + 0.65 * fbm2(uv * aspect * 3.0 + vec2(0.0, u_time * 0.06) + vortexOffset * 0.8);
    vec3 warm = vec3(1.0, 0.86, 0.66);
    vec3 fog = warm * shafts * near * haze * (0.75 + u_audioLow * 0.6 + u_portalSurge * 0.6);

    int beam = int(clamp(floor(uv.x * 8.0), 0.0, 7.0));
    float ring = u_strings[beam];
    float dx = abs(uv.x - (float(beam) + 0.5) / 8.0) * aspect.x;
    float sheet = exp(-dx * dx / (0.00003 + 0.0003 * ring)) + 0.35 * exp(-dx * 34.0);
    vec3 lasers = channelColour(beam - (beam / 4) * 4) * sheet * (0.24 + ring * 1.6) * (0.4 + 0.6 * haze)
                * mix(0.3, 1.0, shaftLight) * smoothstep(0.0, 0.12, uv.y + 0.05);

    vec2 dg = uv * aspect * 85.0 + vec2(u_time * 0.6, -u_time * 1.4);
    float dh = hash21(floor(dg));
    float mote = step(0.984, dh) * (1.0 - smoothstep(0.08, 0.32, length(fract(dg) - 0.5)));
    vec3 dust = warm * mote * shafts * near * (0.35 + u_audioHigh * 2.0) * (0.6 + 0.4 * sin(u_time * 2.0 + dh * 50.0));

    vec3 room = bgCol * vec3(0.07, 0.08, 0.11);
    bgCol = room + fog + lasers + dust;
  }

  bgCol += rippleTint * (u_look == 5 ? 1.0 : 0.68);
  bgCol += lookAccent(u_look) * motionTrail * 0.24;

  // The hand itself, in front of the background. A dim room leaves hands dark, so the shadows are lifted a
  // little and the highlights kept. The picture bends slightly along the hand's edge
  vec2 fgUv = uv - handNormal * 0.006 * (1.0 - handFg);
  vec3 rawHand = fetchWebcam(fgUv);
  vec3 fgHandCol = rawHand * (1.3 - 0.3 * rawHand);

  vec3 finalCol = mix(bgCol, fgHandCol, handFg);

  // The hand's edge, in each look's own material
  float pulse = 0.75 + u_audioRms * 0.5 + u_portalSurge * 0.6;
  if (u_look == 1 || u_look == 3) {
    // Ink: a drawn outline
    finalCol = mix(finalCol, vec3(0.07, 0.055, 0.045), edgeStrength * (u_look == 3 ? 0.7 : 0.45));
  } else if (u_look == 5) {
    // Back light: the rim is brightest on the side that faces the light
    vec2 toward = normalize((lightPos - uv) * aspect);
    vec2 outward = -handNormal / max(0.0001, length(handNormal));
    float facing = clamp(dot(outward, toward) * 0.8 + 0.35, 0.0, 1.0);
    vec3 warm = vec3(1.0, 0.86, 0.66);
    finalCol = mix(finalCol, finalCol * 0.82, handFg);
    finalCol += warm * edgeStrength * facing * 0.95 * pulse * mix(0.5, 1.0, shaftLight);
    finalCol += warm * portalAura * 0.05;
  } else {
    // Light along the contour: cobalt and gold glass, gold leaf, or chrome
    vec3 rimCol = u_look == 0
      ? mix(vec3(0.45, 0.75, 1.0), vec3(1.0, 0.84, 0.45), 0.5 + 0.5 * sin(u_time * 2.0 + uv.y * 9.0))
      : u_look == 2 ? vec3(1.0, 0.80, 0.36) : vec3(0.92, 0.96, 1.0);
    finalCol += rimCol * (edgeStrength * 0.42 + portalAura * 0.06) * pulse;
  }

  float grain = (hash21(uv * u_res + fract(u_time * 17.0)) - 0.5) * 0.022;
  float vig = smoothstep(1.25, 0.28, length((uv - 0.5) * aspect));
  finalCol = (finalCol + grain) * (0.78 + 0.22 * vig);

  outColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
`;
