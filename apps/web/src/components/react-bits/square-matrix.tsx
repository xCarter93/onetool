"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type SquareMatrixPattern =
  | "ripple"
  | "diagonal"
  | "horizontal"
  | "vertical"
  | "spiral"
  | "checker"
  | "noise"
  | "scan";

export interface SquareMatrixHandle {
  ripple: (x?: number, y?: number, strength?: number) => void;
  replay: () => void;
}

export interface SquareMatrixProps {
  colors?: [string, string];
  backgroundColor?: string;
  pattern?: SquareMatrixPattern;
  gridSize?: number;
  cellSize?: number;
  gap?: number;
  roundness?: number;
  glow?: number;
  speed?: number;
  waveScale?: number;
  amplitude?: number;
  contrast?: number;
  angle?: number;
  originX?: number;
  originY?: number;
  wake?: number;
  rippleStrength?: number;
  interactive?: boolean;
  intro?: boolean;
  paused?: boolean;
  dpr?: number;
  opacity?: number;
  width?: string | number;
  height?: string | number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  waveFrequency?: number;
  waveAmplitude?: number;
  cornerRadius?: number;
  edgeSoftness?: number;
  cellGap?: number;
  peakBrightness?: number;
  baseBrightness?: number;
  centerDrift?: number;
  preset?: number;
  color?: string;
  cursorInteraction?: boolean;
  cursorIntensity?: number;
}

interface Settings {
  colors: [string, string];
  backgroundColor: string;
  pattern: number;
  gridSize: number;
  cellSize: number | undefined;
  size: number;
  roundness: number;
  glow: number;
  speed: number;
  frequency: number;
  amplitude: number;
  contrast: number;
  base: number;
  peak: number;
  angle: number;
  originX: number;
  originY: number;
  drift: number;
  wake: number;
  rippleStrength: number;
  interactive: boolean;
  intro: boolean;
  paused: boolean;
  dpr: number;
  opacity: number;
  reduced: boolean;
}

interface Controller {
  sync: () => void;
  ripple: (x?: number, y?: number, strength?: number) => void;
  replay: () => void;
  destroy: () => void;
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  strength: number;
}

interface Point {
  x: number;
  y: number;
}

type Rgba = [number, number, number, number];
type Triple = [number, number, number];

const PATTERNS: Record<SquareMatrixPattern, number> = {
  ripple: 0,
  diagonal: 1,
  horizontal: 2,
  vertical: 3,
  spiral: 4,
  checker: 5,
  noise: 6,
  scan: 7,
};
const DIRECTIONS = [0, 45, 0, 90, 0, 0, 0, 0];
const DEFAULT_COLORS: [string, string] = ["#FF00FF", "#9A2BFF"];
const MAX_RIPPLES = 8;
const RIPPLE_LIFE = 2.8;
const INTRO_SPREAD = 1.1;
const INTRO_RISE = 0.7;
const REST_PHASE = 1.2;
const WAVE_RATE = 0.8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) ? value : fallback;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const smooth = (from: number, to: number, value: number) => {
  const k = clamp((value - from) / (to - from), 0, 1);
  return k * k * (3 - 2 * k);
};

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const toLch = ([r, g, b]: Triple): Triple => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
};

const fromLch = (L: number, C: number, h: number): Triple => {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const inGamut = (rgb: Triple) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

const fitChroma = (L: number, C: number, h: number) => {
  if (inGamut(fromLch(L, C, h))) return C;
  let low = 0;
  let high = C;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (inGamut(fromLch(L, mid, h))) low = mid;
    else high = mid;
  }
  return low;
};

const subscribeToMotion = (notify: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

const readMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const passVertex = `
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const cellFragment = `
precision highp float;
precision highp sampler2D;
uniform sampler2D uPress;
uniform vec2 uHalf;
uniform float uTime;
uniform float uPattern;
uniform float uFreq;
uniform vec2 uDir;
uniform vec2 uOrigin;
uniform float uSpan;
uniform float uRows;
uniform float uBase;
uniform float uPeak;
uniform float uContrast;
uniform float uSharp;
uniform float uAmplitude;
uniform float uSize;
uniform float uIntro;
uniform float uReach;
uniform float uRingSpeed;
uniform float uRingWidth;
uniform vec4 uRipples[${MAX_RIPPLES}];
out vec4 fragColor;

const float TAU = 6.28318530718;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 slope(vec2 cell) {
  float a = hash(cell) * TAU;
  return vec2(cos(a), sin(a));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(slope(i), f);
  float b = dot(slope(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(slope(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(slope(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}

float wave(vec2 id, vec2 center, vec2 d) {
  if (uPattern < 0.5) return sin(length(d) * uFreq - uTime);
  if (uPattern < 1.5) return sin(dot(d, uDir) * 1.41421356 * uFreq * 0.7 - uTime);
  if (uPattern < 3.5) return sin(dot(d, uDir) * uFreq - uTime);
  if (uPattern < 4.5) return sin((atan(d.y, d.x + 0.00001) * 2.0 + length(d) * 0.8) * uFreq - uTime);
  if (uPattern < 5.5) return sin(mod(id.x + id.y, 2.0) * 3.14159265 + length(d) * uFreq * 0.4 - uTime);
  if (uPattern < 6.5) {
    vec2 p = d * uFreq / TAU * 1.6;
    float t = uTime / TAU;
    float n = noise(p + vec2(0.34, -0.21) * t) * 0.72 + noise(p * 2.07 + vec2(-0.29, 0.38) * t + 11.7) * 0.28;
    return 2.0 * smoothstep(-0.4, 0.4, n) - 1.0;
  }
  float width = 1.3 / uFreq;
  float trail = 9.0 / uFreq;
  float margin = 4.0 * width;
  float period = 2.0 * uSpan + margin + trail + 2.0;
  float front = -uSpan - margin + mod(uTime * 5.0, period);
  float x = front - dot(center, uDir);
  float lead = exp(-x * x / (width * width)) * smoothstep(-margin, -0.75 * margin, x);
  float tail = exp(-x / (0.42 * trail)) * (1.0 - smoothstep(0.45 * trail, trail, x));
  return 2.0 * (x < 0.0 ? lead : tail) - 1.0;
}

void main() {
  vec2 texel = floor(gl_FragCoord.xy);
  vec2 id = texel - uHalf;
  vec2 center = id + 0.5;
  vec2 d = center - uOrigin;
  float lit = 0.5 + 0.5 * clamp(wave(id, center, d), -1.0, 1.0);
  float eased = lit * lit * (3.0 - 2.0 * lit);
  float energy = uBase + uPeak * mix(1.0, pow(eased, uSharp), uContrast);
  float size = uSize * (1.0 - uAmplitude * (1.0 - eased));
  float push = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float dist = length(center - r.xy);
    float x = (dist - r.z * uRingSpeed) / uRingWidth;
    float y = x + 1.9;
    float ring = exp(-x * x) - 0.55 * exp(-y * y);
    float life = smoothstep(0.0, 0.05, r.z) * exp(-r.z / 1.6) * (1.0 - smoothstep(1.9, ${RIPPLE_LIFE.toFixed(1)}, r.z));
    push += ring * life * r.w / (1.0 + dist / uRows);
  }
  float press = clamp(texelFetch(uPress, ivec2(texel), 0).r, 0.0, 1.2);
  energy += clamp(push, 0.0, 1.5) * max(uPeak, 0.6) * 0.8 + press * 1.7;
  size *= (1.0 + 0.2 * clamp(push, -1.0, 1.0)) * (1.0 - 0.18 * min(press, 1.0));
  float delay = ${INTRO_SPREAD.toFixed(2)} * clamp(length(d) / uReach, 0.0, 1.0) + 0.12 * hash(id + 17.0);
  float k = clamp((uIntro - delay) / ${INTRO_RISE.toFixed(2)}, 0.0, 1.0);
  float appear = 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
  energy *= appear;
  size *= appear;
  fragColor = vec4(clamp(energy * 0.2, 0.0, 1.0), clamp(size, 0.0, 0.5), clamp(press, 0.0, 1.0), eased);
}
`;

const bloomFragment = `
precision highp float;
precision highp sampler2D;
uniform sampler2D uCells;
uniform vec2 uGrid;
uniform float uKnee;
out vec4 fragColor;

void main() {
  ivec2 at = ivec2(floor(gl_FragCoord.xy));
  ivec2 top = ivec2(uGrid) - 1;
  float sum = 0.0;
  float total = 0.0;
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      float r = length(vec2(float(i), float(j)));
      float w = exp(-r * r / 4.5) * (1.0 - smoothstep(2.0, 3.5, r));
      float energy = texelFetch(uCells, clamp(at + ivec2(i, j), ivec2(0), top), 0).r * 5.0;
      sum += w * max(energy - uKnee, 0.0);
      total += w;
    }
  }
  fragColor = vec4(clamp(sum / total * 0.25, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

const matrixFragment = `
precision highp float;
precision highp sampler2D;
uniform sampler2D uCells;
uniform sampler2D uBloom;
uniform vec2 uGrid;
uniform vec2 uHalf;
uniform vec2 uRes;
uniform float uPitch;
uniform float uRound;
uniform float uGlow;
uniform float uHaloReach;
uniform float uBloomGain;
uniform float uPanel;
uniform float uDrift;
uniform float uInk;
uniform float uOpacity;
uniform vec3 uLchA;
uniform vec3 uLchB;
uniform float uHueDelta;
uniform vec2 uOrigin;
uniform float uReach;
out vec4 fragColor;

vec3 lchToLinear(vec3 lch) {
  vec3 lab = vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.291485548) * lab;
  lms = lms * lms * lms;
  return clamp(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.707614701) * lms, 0.0, 1.0);
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float roundBox(vec2 p, float h, float r) {
  vec2 q = abs(p) - vec2(h - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uPitch;
  vec2 base = floor(p);
  float t = smoothstep(0.42, 1.1, length(p - uOrigin) / uReach);
  vec3 tint = lchToLinear(vec3(mix(uLchA.xy, uLchB.xy, t), uLchA.z + uHueDelta * t));
  float lens = 0.0;
  float halo = 0.0;
  float inkCover = 0.0;
  float inkTone = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      vec2 texel = id + uHalf;
      if (texel.x < 0.0 || texel.y < 0.0 || texel.x > uGrid.x - 1.0 || texel.y > uGrid.y - 1.0) continue;
      vec4 cell = texelFetch(uCells, ivec2(texel), 0);
      float energy = cell.r * 5.0;
      float h = cell.g;
      vec2 local = p - id - 0.5 + uDrift * (cell.a * 2.0 - 1.0) * vec2(0.7071);
      if (uInk < 0.5) {
        float sd = roundBox(local, h, uRound * h);
        float c = clamp(0.5 - sd * uPitch, 0.0, 1.0) * step(0.0005, h);
        float rho = length(local) / max(h, 0.0001);
        float shape = 0.42 + 0.58 * exp(-rho * rho * 1.6) + 0.55 * exp(-rho * rho * 4.0);
        lens += c * (uPanel + energy * shape);
        float gap = max(sd, 0.0);
        halo += energy * exp(-gap / uHaloReach) * (1.0 - smoothstep(0.0, 0.8, gap)) * (1.0 - c);
      } else {
        float tone = 1.0 - exp(-energy * 1.1);
        float hi = h * (0.3 + 0.7 * sqrt(tone));
        float sd = roundBox(local, hi, uRound * hi);
        float c = clamp(0.5 - sd * uPitch, 0.0, 1.0) * step(0.0005, hi);
        if (c > inkCover) {
          inkCover = c;
          inkTone = tone;
        }
      }
    }
  }
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  if (uInk < 0.5) {
    float bloom = texture(uBloom, (p + uHalf) / uGrid).r * 4.0 * uBloomGain;
    float energy = lens + halo * uGlow * 0.22 + bloom;
    float tone = 1.0 - exp(-energy * 1.05);
    float white = smoothstep(1.6, 4.6, energy) * 0.85;
    vec3 hue = tint / max(max(tint.r, tint.g), max(tint.b, 0.0001));
    vec3 shown = encode(tone * mix(hue, vec3(1.0), white));
    float peak = max(max(shown.r, shown.g), shown.b);
    shown += dither * step(0.004, peak);
    float alpha = clamp(max(max(shown.r, shown.g), shown.b), 0.0, 1.0);
    fragColor = vec4(clamp(shown / max(alpha, 0.0001), 0.0, 1.0), alpha * uOpacity);
    return;
  }
  vec3 deep = encode(tint * (1.0 - 0.25 * smoothstep(0.8, 1.0, inkTone)));
  float alpha = inkCover * clamp(0.16 + 0.84 * inkTone, 0.0, 1.0);
  fragColor = vec4(clamp(deep + dither * step(0.004, alpha), 0.0, 1.0), alpha * uOpacity);
}
`;

function createMatrix(
  root: HTMLDivElement,
  stage: HTMLDivElement,
  settingsRef: { current: Settings },
): Controller | null {
  const doc = root.ownerDocument;
  const view = doc.defaultView ?? window;
  const canvas = doc.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(canvas);

  const settings = () => settingsRef.current;
  const floatTargets =
    renderer.extensions.has("EXT_color_buffer_float") ||
    renderer.extensions.has("EXT_color_buffer_half_float");

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const scene = new THREE.Scene();
  const pass = new THREE.Mesh(geometry);
  pass.frustumCulled = false;
  scene.add(pass);

  let cols = 1;
  let rows = 1;
  let halfCols = 0;
  let halfRows = 0;
  let depth = new Float32Array(1);
  let velocity = new Float32Array(1);
  let hold = new Float32Array(1);
  let stamp = new Uint32Array(1);
  const active = new Set<number>();

  const makePress = () => {
    const texture = new THREE.DataTexture(depth, cols, rows, THREE.RedFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  };
  let pressTexture = makePress();
  const cellTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  const bloomTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });

  const rippleSlots = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4());
  const cellUniforms = {
    uPress: { value: pressTexture as THREE.Texture },
    uHalf: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uPattern: { value: 0 },
    uFreq: { value: 1 },
    uDir: { value: new THREE.Vector2(1, 0) },
    uOrigin: { value: new THREE.Vector2() },
    uSpan: { value: 10 },
    uRows: { value: 20 },
    uBase: { value: 0 },
    uPeak: { value: 2 },
    uContrast: { value: 0.97 },
    uSharp: { value: 1.6 },
    uAmplitude: { value: 0.18 },
    uSize: { value: 0.37 },
    uIntro: { value: 100 },
    uReach: { value: 10 },
    uRingSpeed: { value: 12 },
    uRingWidth: { value: 1.25 },
    uRipples: { value: rippleSlots },
  };
  const matrixUniforms = {
    uCells: { value: cellTarget.texture as THREE.Texture },
    uBloom: { value: bloomTarget.texture as THREE.Texture },
    uGrid: { value: new THREE.Vector2(1, 1) },
    uHalf: { value: new THREE.Vector2() },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPitch: { value: 38 },
    uRound: { value: 0.35 },
    uGlow: { value: 0.7 },
    uHaloReach: { value: 0.13 },
    uBloomGain: { value: 0.22 },
    uPanel: { value: 0.028 },
    uDrift: { value: 0 },
    uInk: { value: 0 },
    uOpacity: { value: 1 },
    uLchA: { value: new THREE.Vector3() },
    uLchB: { value: new THREE.Vector3() },
    uHueDelta: { value: 0 },
    uOrigin: { value: new THREE.Vector2() },
    uReach: { value: 10 },
  };
  const bloomUniforms = {
    uCells: { value: cellTarget.texture as THREE.Texture },
    uGrid: { value: new THREE.Vector2(1, 1) },
    uKnee: { value: 1.1 },
  };
  const material = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: passVertex,
      fragmentShader,
      uniforms,
      blending: THREE.NoBlending,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });
  const cellMaterial = material(cellFragment, cellUniforms);
  const bloomMaterial = material(bloomFragment, bloomUniforms);
  const matrixMaterial = material(matrixFragment, matrixUniforms);

  const probe = doc.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map<string, Rgba | null>();

  const readColor = (value: string): Rgba | null => {
    const text = value.trim().toLowerCase();
    if (!text || text === "transparent" || text === "none" || text === "auto") return null;
    if (colorCache.has(text)) return colorCache.get(text) ?? null;
    if (!probeContext) return null;
    if (colorCache.size > 96) colorCache.clear();
    probeContext.fillStyle = "#010203";
    const sentinel = probeContext.fillStyle;
    probeContext.fillStyle = text;
    let result: Rgba | null = null;
    if (probeContext.fillStyle !== sentinel || text === "#010203") {
      probeContext.clearRect(0, 0, 1, 1);
      probeContext.fillRect(0, 0, 1, 1);
      const data = probeContext.getImageData(0, 0, 1, 1).data;
      result = data[3] < 13 ? null : [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
    }
    colorCache.set(text, result);
    return result;
  };

  const readPage = (): Triple => {
    let node: HTMLElement | null = root.parentElement;
    while (node) {
      const fill = readColor(view.getComputedStyle(node).backgroundColor);
      if (fill) return [fill[0], fill[1], fill[2]];
      node = node.parentElement;
    }
    const text = readColor(view.getComputedStyle(root).color);
    if (text) return text[0] + text[1] + text[2] > 1.5 ? [0.04, 0.04, 0.04] : [1, 1, 1];
    return view.matchMedia("(prefers-color-scheme: dark)").matches ? [0.04, 0.04, 0.04] : [1, 1, 1];
  };

  let width = 0;
  let height = 0;
  let ratio = 1;
  let sized = false;
  let pitch = 38;
  let colorKey = "";
  let ink = false;
  let backgroundAt = Number.NEGATIVE_INFINITY;
  let clock = 0;
  let elapsed = 0;
  let frameId = 1;
  let introActive = false;
  let introStart = -1;
  let raf = 0;
  let last = 0;
  let visible = false;
  let destroyed = false;
  let lost = false;
  let pointer: Point | null = null;
  let trailFrom: Point | null = null;
  let down = false;
  let tap: { id: number; x: number; y: number; time: number } | null = null;
  const ripples: Ripple[] = [];

  const shade = (rgb: Triple, light: boolean): Triple => {
    const [L, C, h] = toLch(rgb);
    if (!light) return [L, fitChroma(L, C, h), h];
    const deep = Math.min(L, 0.64) - 0.03;
    return [deep, fitChroma(deep, C * 1.2, h), h];
  };

  const syncColors = () => {
    const s = settings();
    const own = readColor(s.backgroundColor);
    const page: Triple = own ? [own[0], own[1], own[2]] : readPage();
    const key = [page.join(","), s.colors[0], s.colors[1]].join("|");
    if (key === colorKey) return;
    colorKey = key;
    ink = 0.2126 * page[0] + 0.7152 * page[1] + 0.0722 * page[2] > 0.55;
    const firstColor = readColor(s.colors[0]);
    const secondColor = readColor(s.colors[1]);
    const first = shade(firstColor ? [firstColor[0], firstColor[1], firstColor[2]] : [1, 0, 1], ink);
    const second = shade(secondColor ? [secondColor[0], secondColor[1], secondColor[2]] : [1, 0, 1], ink);
    if (first[1] < 0.03) first[2] = second[2];
    if (second[1] < 0.03) second[2] = first[2];
    const turn = second[2] - first[2];
    matrixUniforms.uLchA.value.set(first[0], first[1], first[2]);
    matrixUniforms.uLchB.value.set(second[0], second[1], second[2]);
    matrixUniforms.uHueDelta.value = Math.atan2(Math.sin(turn), Math.cos(turn));
    matrixUniforms.uInk.value = ink ? 1 : 0;
  };

  const layout = () => {
    const s = settings();
    const grid = clamp(finite(s.gridSize, 10), 1, 120);
    pitch = clamp(finite(s.cellSize, height / (2 * grid)), 4, 600);
    const nextHalfCols = Math.ceil(width / (2 * pitch)) + 3;
    const nextHalfRows = Math.ceil(height / (2 * pitch)) + 3;
    if (nextHalfCols === halfCols && nextHalfRows === halfRows) return;
    halfCols = nextHalfCols;
    halfRows = nextHalfRows;
    cols = halfCols * 2;
    rows = halfRows * 2;
    depth = new Float32Array(cols * rows);
    velocity = new Float32Array(cols * rows);
    hold = new Float32Array(cols * rows);
    stamp = new Uint32Array(cols * rows);
    active.clear();
    pressTexture.dispose();
    pressTexture = makePress();
    cellUniforms.uPress.value = pressTexture;
    cellTarget.setSize(cols, rows);
    bloomTarget.setSize(cols, rows);
  };

  const readSize = () => {
    const s = settings();
    const nextWidth = Math.round(root.clientWidth);
    const nextHeight = Math.round(root.clientHeight);
    if (nextWidth < 2 || nextHeight < 2) {
      sized = false;
      return false;
    }
    const nextRatio = Math.min(view.devicePixelRatio || 1, clamp(finite(s.dpr, 2), 0.5, 3));
    if (sized && nextWidth === width && nextHeight === height && nextRatio === ratio) return false;
    sized = true;
    width = nextWidth;
    height = nextHeight;
    ratio = nextRatio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    return true;
  };

  const origin = (): Point => {
    const s = settings();
    return {
      x: ((clamp(finite(s.originX, 0.5), -0.5, 1.5) - 0.5) * width) / pitch,
      y: ((0.5 - clamp(finite(s.originY, 0.5), -0.5, 1.5)) * height) / pitch,
    };
  };

  const render = () => {
    if (!sized) return;
    const s = settings();
    if (performance.now() - backgroundAt > 1000) {
      backgroundAt = performance.now();
      syncColors();
    }
    layout();
    const scaleX = canvas.width / width;
    const pattern = clamp(Math.round(finite(s.pattern, 0)), 0, 7);
    const direction = radians(DIRECTIONS[pattern] + finite(s.angle, 0));
    const dirX = Math.cos(direction);
    const dirY = Math.sin(direction);
    const center = origin();
    const spanX = width / (2 * pitch);
    const spanY = height / (2 * pitch);
    const reach = Math.max(
      Math.hypot(spanX - center.x, spanY - center.y),
      Math.hypot(spanX + center.x, spanY - center.y),
      Math.hypot(spanX - center.x, spanY + center.y),
      Math.hypot(spanX + center.x, spanY + center.y),
    );
    const rowsInFrame = height / pitch;
    const glow = clamp(finite(s.glow, 0.7), 0, 2);

    const c = cellUniforms;
    c.uHalf.value.set(halfCols, halfRows);
    c.uTime.value = clock;
    c.uPattern.value = pattern;
    c.uFreq.value = clamp(finite(s.frequency, 1), 0.05, 10);
    c.uDir.value.set(dirX, dirY);
    c.uOrigin.value.set(center.x, center.y);
    c.uSpan.value = Math.abs(dirX) * spanX + Math.abs(dirY) * spanY;
    c.uRows.value = rowsInFrame;
    c.uBase.value = clamp(finite(s.base, 0), 0, 5);
    c.uPeak.value = clamp(finite(s.peak, 2), 0, 5);
    c.uContrast.value = clamp(finite(s.contrast, 1), 0, 1);
    c.uSharp.value = pattern === 7 ? 1 : pattern === 6 ? 1.3 : 1.6;
    c.uAmplitude.value = clamp(finite(s.amplitude, 0.18), 0, 1);
    c.uSize.value = clamp(finite(s.size, 0.37), 0.02, 0.5);
    c.uIntro.value = introActive ? (introStart < 0 ? 0 : elapsed - introStart) : 100;
    c.uReach.value = Math.max(reach, 0.01);
    c.uRingSpeed.value = 0.6 * rowsInFrame;
    c.uRingWidth.value = Math.max(1.25, 0.045 * rowsInFrame);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const ripple = ripples[i];
      if (ripple) rippleSlots[i].set(ripple.x, ripple.y, elapsed - ripple.born, ripple.strength);
      else rippleSlots[i].set(0, 0, 0, 0);
    }

    const m = matrixUniforms;
    m.uGrid.value.set(cols, rows);
    m.uHalf.value.set(halfCols, halfRows);
    m.uRes.value.set(canvas.width, canvas.height);
    m.uPitch.value = pitch * scaleX;
    m.uRound.value = clamp(finite(s.roundness, 0.35), 0, 1);
    m.uGlow.value = glow;
    m.uHaloReach.value = 0.05 + 0.12 * glow;
    m.uBloomGain.value = ink ? 0 : glow * 0.1;
    m.uDrift.value = clamp(finite(s.drift, 0), -0.5, 0.5);
    m.uOpacity.value = clamp(finite(s.opacity, 1), 0, 1);
    m.uOrigin.value.set(center.x, center.y);
    m.uReach.value = Math.max(reach, 0.01);

    pass.material = cellMaterial;
    renderer.setRenderTarget(cellTarget);
    renderer.render(scene, camera);
    if (!ink && glow > 0.001) {
      bloomUniforms.uGrid.value.set(cols, rows);
      pass.material = bloomMaterial;
      renderer.setRenderTarget(bloomTarget);
      renderer.render(scene, camera);
    }
    pass.material = matrixMaterial;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  };

  const applyPointer = () => {
    const s = settings();
    const at = pointer;
    if (!at || !s.interactive || s.reduced) {
      trailFrom = null;
      return;
    }
    const from = trailFrom ?? at;
    trailFrom = { x: at.x, y: at.y };
    const strength = Math.min(1, (down ? 1 : 0.75) * clamp(finite(s.wake, 1), 0, 2));
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    const span = dx * dx + dy * dy;
    if (strength <= 0 || (!down && span < 0.000001)) return;
    const reachCells = 0.95;
    const ax = span > 3600 ? at.x : from.x;
    const ay = span > 3600 ? at.y : from.y;
    const bx = at.x - ax;
    const by = at.y - ay;
    const length = bx * bx + by * by;
    const minX = Math.max(-halfCols, Math.floor(Math.min(ax, at.x) - reachCells - 0.5));
    const maxX = Math.min(halfCols - 1, Math.ceil(Math.max(ax, at.x) + reachCells - 0.5));
    const minY = Math.max(-halfRows, Math.floor(Math.min(ay, at.y) - reachCells - 0.5));
    const maxY = Math.min(halfRows - 1, Math.ceil(Math.max(ay, at.y) + reachCells - 0.5));
    for (let j = minY; j <= maxY; j++) {
      for (let i = minX; i <= maxX; i++) {
        const cx = i + 0.5;
        const cy = j + 0.5;
        const k = length > 0 ? clamp(((cx - ax) * bx + (cy - ay) * by) / length, 0, 1) : 0;
        const distance = Math.hypot(cx - ax - bx * k, cy - ay - by * k);
        if (distance >= reachCells) continue;
        const index = (j + halfRows) * cols + (i + halfCols);
        const goal = (1 - smooth(0.3, reachCells, distance)) * strength;
        if (goal > hold[index]) hold[index] = goal;
        stamp[index] = frameId;
        active.add(index);
      }
    }
  };

  const stepSprings = (dt: number) => {
    if (!active.size) return false;
    const s = settings();
    const release = 4.7 / (0.38 + 0.3 * clamp(finite(s.wake, 1), 0, 2));
    const decay = Math.exp(-dt / 0.06);
    let moving = false;
    for (const index of active) {
      const goal = hold[index];
      const omega = goal > depth[index] ? 34 : release;
      const c1 = depth[index] - goal;
      const c2 = velocity[index] + omega * c1;
      const e = Math.exp(-omega * dt);
      const x = goal + (c1 + c2 * dt) * e;
      const v = (c2 - omega * (c1 + c2 * dt)) * e;
      const held = stamp[index] === frameId;
      hold[index] = held ? goal : goal * decay;
      if (!held && hold[index] < 0.001 && Math.abs(x) < 0.0005 && Math.abs(v) < 0.005) {
        depth[index] = 0;
        velocity[index] = 0;
        hold[index] = 0;
        active.delete(index);
        continue;
      }
      depth[index] = x;
      velocity[index] = v;
      if (!held || Math.abs(x - goal) > 0.0005 || Math.abs(v) > 0.005) moving = true;
    }
    pressTexture.needsUpdate = true;
    return moving;
  };

  const schedule = () => {
    if (destroyed || lost || !visible || raf) return;
    raf = requestAnimationFrame(frame);
  };

  const frame = (now: number) => {
    raf = 0;
    if (destroyed || lost) return;
    const s = settings();
    const dt =
      last && now - last < 100 ? Math.min(Math.max((now - last) / 1000, 0), 0.05) : 1 / 60;
    last = now;
    const moving = !s.reduced && !s.paused;
    if (moving) clock += dt * WAVE_RATE * clamp(finite(s.speed, 1), 0, 10);
    elapsed += dt;
    frameId += 1;
    if (introActive) {
      if (introStart < 0) introStart = elapsed;
      if (elapsed - introStart > INTRO_SPREAD + INTRO_RISE + 0.2) introActive = false;
    }
    applyPointer();
    const springing = stepSprings(dt);
    for (let i = ripples.length - 1; i >= 0; i--)
      if (elapsed - ripples[i].born > RIPPLE_LIFE) ripples.splice(i, 1);
    render();
    const animating = moving || springing || ripples.length > 0 || introActive;
    if (animating && visible && !doc.hidden) raf = requestAnimationFrame(frame);
    else last = 0;
  };

  const fire = (x: number, y: number, strength: number) => {
    const i = clamp(Math.floor(x), -halfCols, halfCols - 1);
    const j = clamp(Math.floor(y), -halfRows, halfRows - 1);
    if (strength > 0) {
      ripples.push({ x: i + 0.5, y: j + 0.5, born: elapsed, strength });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
    }
    const index = (j + halfRows) * cols + (i + halfCols);
    if (index >= 0 && index < hold.length) {
      hold[index] = Math.max(hold[index], 1);
      active.add(index);
    }
    schedule();
  };

  const toCell = (clientX: number, clientY: number): Point | null => {
    const box = root.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || width <= 0) return null;
    const unit = pitch * (box.width / width);
    return {
      x: (clientX - box.left - box.width / 2) / unit,
      y: (box.top + box.height / 2 - clientY) / unit,
    };
  };

  const isControl = (target: EventTarget | null) => {
    const element = target as Element | null;
    return (
      !!element &&
      typeof element.closest === "function" &&
      !!element.closest(
        "a,button,input,textarea,select,label,summary,[role=button],[contenteditable=true]",
      )
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    const s = settings();
    if (!s.interactive || s.reduced || !event.isPrimary || isControl(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = toCell(event.clientX, event.clientY);
    if (!at) return;
    down = true;
    pointer = at;
    tap = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    if (event.pointerType === "mouse")
      fire(at.x, at.y, clamp(finite(s.rippleStrength, 1), 0, 2));
    schedule();
  };

  const onPointerMove = (event: PointerEvent) => {
    const s = settings();
    if (!s.interactive || s.reduced) return;
    if (event.pointerType === "touch" && !down) return;
    const at = toCell(event.clientX, event.clientY);
    if (!at) return;
    pointer = at;
    schedule();
  };

  const onPointerUp = (event: PointerEvent) => {
    const current = tap;
    tap = null;
    down = false;
    if (event.pointerType !== "mouse") pointer = null;
    const s = settings();
    if (
      current &&
      current.id === event.pointerId &&
      event.pointerType !== "mouse" &&
      s.interactive &&
      !s.reduced &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) <= 10 &&
      performance.now() - current.time <= 600
    ) {
      const at = toCell(event.clientX, event.clientY);
      if (at) fire(at.x, at.y, clamp(finite(s.rippleStrength, 1), 0, 2));
    }
    schedule();
  };

  const onPointerLeave = () => {
    pointer = null;
    down = false;
    schedule();
  };

  const onPointerCancel = () => {
    tap = null;
    pointer = null;
    down = false;
    schedule();
  };

  const onVisibility = () => {
    last = 0;
    schedule();
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const onRestored = () => {
    lost = false;
    colorKey = "";
    pressTexture.needsUpdate = true;
    schedule();
  };

  const resizeObserver = new ResizeObserver(() => {
    if (readSize()) {
      render();
      schedule();
    }
  });

  const intersection = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      last = 0;
      schedule();
    },
    { rootMargin: "120px" },
  );

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointerleave", onPointerLeave);
  root.addEventListener("pointercancel", onPointerCancel);
  doc.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  resizeObserver.observe(root);
  intersection.observe(root);
  introActive = settings().intro && !settings().reduced;
  clock = settings().reduced ? REST_PHASE : 0;
  readSize();

  return {
    sync: () => {
      backgroundAt = Number.NEGATIVE_INFINITY;
      readSize();
      last = 0;
      if (settings().reduced) {
        introActive = false;
        clock = REST_PHASE;
      }
      if (!raf && visible) {
        render();
        schedule();
      }
    },
    ripple: (x, y, strength) => {
      const s = settings();
      if (s.reduced || !sized) return;
      const fx = clamp(finite(x, finite(s.originX, 0.5)), 0, 1);
      const fy = clamp(finite(y, finite(s.originY, 0.5)), 0, 1);
      fire(
        ((fx - 0.5) * width) / pitch,
        ((0.5 - fy) * height) / pitch,
        clamp(finite(strength, finite(s.rippleStrength, 1)), 0, 2),
      );
    },
    replay: () => {
      if (settings().reduced) return;
      introActive = true;
      introStart = -1;
      last = 0;
      schedule();
    },
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("pointercancel", onPointerCancel);
      doc.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      scene.remove(pass);
      geometry.dispose();
      cellMaterial.dispose();
      bloomMaterial.dispose();
      matrixMaterial.dispose();
      pressTexture.dispose();
      cellTarget.dispose();
      bloomTarget.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

export const SquareMatrix = forwardRef<SquareMatrixHandle, SquareMatrixProps>(
  function SquareMatrix(
    {
      colors,
      backgroundColor = "transparent",
      pattern,
      gridSize = 10,
      cellSize,
      gap = 0.26,
      roundness,
      glow,
      speed = 1,
      waveScale,
      amplitude = 0.18,
      contrast,
      angle = 0,
      originX = 0.5,
      originY = 0.5,
      wake,
      rippleStrength = 1,
      interactive,
      intro = true,
      paused = false,
      dpr = 2,
      opacity = 1,
      width = "100%",
      height = "100%",
      children,
      className,
      style,
      waveFrequency,
      waveAmplitude,
      cornerRadius,
      edgeSoftness,
      cellGap,
      peakBrightness,
      baseBrightness,
      centerDrift = 0,
      preset,
      color,
      cursorInteraction,
      cursorIntensity,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<Controller | null>(null);
    const reduced = useSyncExternalStore(subscribeToMotion, readMotion, () => false);

    const named = pattern === undefined ? undefined : PATTERNS[pattern];
    const settings: Settings = {
      colors: colors ?? (color ? [color, color] : DEFAULT_COLORS),
      backgroundColor,
      pattern: named ?? clamp(Math.floor(finite(preset, 0)), 0, 5),
      gridSize,
      cellSize,
      size:
        waveAmplitude !== undefined
          ? clamp(waveAmplitude * 1.9, 0.05, 0.5)
          : 0.5 * (1 - clamp(finite(gap, 0.26), 0, 0.95)) +
            clamp(finite(cellGap, 0), 0, 1) * 0.5 * clamp(finite(gap, 0.26), 0, 0.95),
      roundness: roundness ?? cornerRadius ?? 0.35,
      glow: glow ?? edgeSoftness ?? 0.7,
      speed,
      frequency:
        waveScale !== undefined ? 1 / Math.max(waveScale, 0.05) : (waveFrequency ?? 1),
      amplitude,
      contrast: contrast ?? 1,
      base: baseBrightness ?? 0,
      peak: peakBrightness ?? 2,
      angle,
      originX,
      originY,
      drift: centerDrift,
      wake: wake ?? cursorIntensity ?? 1,
      rippleStrength,
      interactive: interactive ?? cursorInteraction ?? true,
      intro,
      paused,
      dpr,
      opacity,
      reduced,
    };
    const settingsRef = useRef(settings);

    useEffect(() => {
      settingsRef.current = settings;
      controllerRef.current?.sync();
    });

    useEffect(() => {
      const root = rootRef.current;
      const stage = stageRef.current;
      if (!root || !stage) return;
      const controller = createMatrix(root, stage, settingsRef);
      controllerRef.current = controller;
      return () => {
        controller?.destroy();
        controllerRef.current = null;
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        ripple: (x?: number, y?: number, strength?: number) =>
          controllerRef.current?.ripple(x, y, strength),
        replay: () => controllerRef.current?.replay(),
      }),
      [],
    );

    const backgroundValue = backgroundColor.trim().toLowerCase();
    const transparent =
      backgroundValue === "" ||
      backgroundValue === "transparent" ||
      backgroundValue === "auto" ||
      backgroundValue === "none";

    return (
      <div
        ref={rootRef}
        className={cn("relative isolate overflow-hidden", className)}
        style={{
          width,
          height,
          backgroundColor: transparent ? undefined : backgroundColor,
          touchAction: "pan-y",
          ...style,
        }}
      >
        <div
          ref={stageRef}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
        {children ? <div className="relative z-10 h-full w-full">{children}</div> : null}
      </div>
    );
  },
);

SquareMatrix.displayName = "SquareMatrix";

export default SquareMatrix;
