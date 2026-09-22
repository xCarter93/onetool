"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";
export interface ParticleMorphProps {
  images: string[];
  activeIndex?: number;
  defaultIndex?: number;
  autoplay?: boolean;
  interval?: number;
  transitionDuration?: number;
  particleDensity?: number;
  particleSize?: number;
  particleOpacity?: number;
  dispersion?: number;
  chaos?: number;
  idleDrift?: number;
  idleSpeed?: number;
  pointerStrength?: number;
  pointerRadius?: number;
  glow?: number;
  aberration?: number;
  color?: string;
  backgroundColor?: string;
  luminanceThreshold?: number;
  loop?: boolean;
  onIndexChange?: (index: number) => void;
  width?: string | number;
  height?: string | number;
  className?: string;
  children?: React.ReactNode;
  dpr?: number;
}
const GLSL_COMMON = `
#define PI 3.14159265
#define TAU 6.2831853

vec4 hash4(vec2 p) {
  vec4 q = vec4(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)),
    dot(p, vec2(419.2, 371.9)),
    dot(p, vec2(97.3, 233.1))
  );
  return fract(sin(q) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n00 = hash4(i).x;
  float n10 = hash4(i + vec2(1.0, 0.0)).x;
  float n01 = hash4(i + vec2(0.0, 1.0)).x;
  float n11 = hash4(i + vec2(1.0, 1.0)).x;
  return mix(mix(n00, n10, f.x), mix(n01, n11, f.x), f.y);
}



vec2 curl(vec2 p) {
  const float e = 0.08;
  float dy = vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e));
  float dx = vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0));
  return vec2(dy, -dx) / (2.0 * e);
}

vec2 fitToFrame(vec2 uv, float imageAspect, float frameAspect) {
  vec2 extent = imageAspect > frameAspect
    ? vec2(frameAspect, frameAspect / imageAspect)
    : vec2(imageAspect, 1.0);
  return vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0) * extent;
}
`;
const GLSL_MORPH = `
uniform sampler2D tFromPos;
uniform sampler2D tToPos;
uniform sampler2D tFromColor;
uniform sampler2D tToColor;
uniform float uFromAspect;
uniform float uToAspect;
uniform float uFromIsFrame;
uniform float uFrameAspect;
uniform float uProgress;
uniform float uTime;
uniform float uDispersion;
uniform float uChaos;
uniform float uMotion;
uniform float uIdle;
uniform float uIdleDrift;
uniform float uIdleSpeed;

struct MorphSample {
  vec2 pos;
  vec3 color;
  float t;
};

MorphSample morphAt(vec2 cell) {
  vec4 seed = hash4(cell * 1024.0 + 13.7);
  vec4 fromRaw = texture(tFromPos, cell);
  vec4 toRaw = texture(tToPos, cell);

  vec2 a = uFromIsFrame > 0.5
    ? fromRaw.xy
    : fitToFrame(fromRaw.xy, uFromAspect, uFrameAspect);
  vec2 b = fitToFrame(toRaw.xy, uToAspect, uFrameAspect);





  float family = floor(vnoise(a * 2.4 + 17.0) * 3.0);
  vec2 shift = vec2(family * 7.31 + uTime * 0.05, family * 3.17 - uTime * 0.035);



  float depth = uFromIsFrame > 0.5 ? toRaw.z : 0.5 * (fromRaw.z + toRaw.z);
  float peel = clamp(depth * 0.8 + (vnoise(a * 2.6 + shift) - 0.5) * 0.3 + seed.x * 0.04, 0.0, 1.0);
  float phase = mix(seed.x, peel, uChaos);
  float stagger = 0.35 * uMotion + 0.7 * uChaos;
  float t = smoothstep(0.0, 1.0, clamp(uProgress * (1.0 + stagger) - phase * stagger, 0.0, 1.0));
  float arc = sin(t * PI);

  vec2 pos = mix(a, b, t);

  if (uChaos > 0.0) {



    float hang = pow(max(arc, 0.0), 0.6);
    float handoff = smoothstep(0.3, 0.7, t);
    vec2 base = mix(a, b, handoff);
    float reach = 0.55 + 0.45 * vnoise(base * 3.1 + shift * 0.5) + 0.04 * seed.w;
    float travel = hang * uChaos * reach * 0.17;

    vec2 pa = a;
    vec2 pb = b;
    vec2 outFlow = vec2(0.0);
    vec2 inFlow = vec2(0.0);
    for (int i = 0; i < 5; i++) {
      vec2 va = curl((pa + shift) * 1.15) + curl((pa - shift * 0.7) * 2.8) * 0.22;
      float awayA = length(pa);
      va += (awayA > 1e-4 ? pa / awayA : vec2(0.0)) * 0.3;
      va = normalize(va + vec2(1e-5, 0.0)) * travel;
      pa += va;
      outFlow += va;

      vec2 vb = curl((pb + shift + 5.0) * 1.15) + curl((pb - shift * 0.7 - 5.0) * 2.8) * 0.22;
      float awayB = length(pb);
      vb += (awayB > 1e-4 ? pb / awayB : vec2(0.0)) * 0.3;
      vb = normalize(vb + vec2(1e-5, 0.0)) * travel;
      pb += vb;
      inFlow += vb;
    }
    pos = base + mix(outFlow, inFlow, handoff) * uMotion;
  }

  vec2 dir = b - a;
  float len = length(dir);
  vec2 perp = len > 1e-5 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  float bow = (seed.y * 2.0 - 1.0) * (0.08 + 0.3 * len) * uDispersion;

  float turn = seed.w > 0.5 ? 1.0 : -1.0;
  float spin = seed.z * TAU + turn * (t * TAU * (0.6 + seed.x * 0.8) + uTime * 0.6);
  vec2 orbit = vec2(cos(spin), sin(spin)) * (0.02 + 0.08 * seed.w) * uDispersion;


  pos += (perp * bow + orbit) * arc * uMotion * (1.0 - 0.85 * uChaos);



  float clockIdle = uTime * uIdleSpeed;
  float loopAngle = clockIdle * (0.5 + seed.y * 0.9) + seed.z * TAU;
  vec2 loop = vec2(cos(loopAngle), sin(loopAngle) * 0.7) * (0.004 + 0.006 * seed.w);
  vec2 sway = vec2(
    sin(clockIdle * 0.55 + pos.y * 1.6 + seed.x * 0.5),
    cos(clockIdle * 0.42 + pos.x * 1.3) * 0.6
  ) * 0.008;
  pos += (loop + sway) * uIdleDrift * (1.0 - arc) * uMotion * uIdle;

  vec3 color = mix(texture(tFromColor, cell).rgb, texture(tToColor, cell).rgb, t);
  return MorphSample(pos, color, t);
}
`;
const QUAD_VERT = `precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}`;
const FREEZE_FRAG = `precision highp float;

in vec2 vUv;

layout(location = 0) out vec4 outPos;
layout(location = 1) out vec4 outColor;

${GLSL_COMMON}
${GLSL_MORPH}

void main() {
  MorphSample m = morphAt(vUv);
  outPos = vec4(m.pos, 0.0, 1.0);
  outColor = vec4(m.color, 1.0);
}`;
const TURBULENCE_FRAG = `precision highp float;

uniform sampler2D tDisp;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uPointerRadius;
uniform float uPointerStrength;
uniform float uPointerSpeed;
uniform float uDt;

in vec2 vUv;

out vec4 outDisp;

${GLSL_COMMON}
${GLSL_MORPH}

void main() {
  vec4 state = texture(tDisp, vUv);
  vec2 d = state.xy;
  vec2 v = state.zw;

  MorphSample m = morphAt(vUv);
  vec4 seed = hash4(vUv * 1024.0 + 13.7);

  vec2 rel = m.pos + d - uPointer;
  float dist = length(rel);
  float falloff = 1.0 - smoothstep(0.0, uPointerRadius, dist);
  falloff *= falloff;
  vec2 away = dist > 1e-5 ? rel / dist : vec2(1.0, 0.0);

  v += away * falloff * uPointerStrength * uPointerActive
    * (0.6 + 0.8 * seed.x) * (0.35 + uPointerSpeed) * uDt * 6.0;
  v -= d * 14.0 * uDt;
  v *= exp(-5.0 * uDt);
  d += v * uDt;

  outDisp = vec4(d, v);
}`;
const POINT_VERT = `precision highp float;

in vec3 position;

uniform sampler2D tDisp;
uniform float uPointSize;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uUseColor;
uniform float uFade;

out vec3 vColor;
out float vAlpha;

${GLSL_COMMON}
${GLSL_MORPH}

void main() {
  MorphSample m = morphAt(position.xy);
  vec4 seed = hash4(position.xy * 1024.0 + 13.7);
  vec2 p = m.pos + texture(tDisp, position.xy).xy;
  float arc = sin(m.t * PI);

  gl_Position = vec4(p.x / uFrameAspect, p.y, 0.0, 1.0);
  gl_PointSize = uPointSize * (0.7 + 0.6 * seed.w) * (1.0 + 0.4 * arc * uMotion);

  vColor = mix(m.color, uColor, uUseColor);
  vAlpha = uOpacity * uFade * (1.0 - 0.25 * arc);
}`;
const POINT_FRAG = `precision highp float;

in vec3 vColor;
in float vAlpha;

out vec4 fragColor;

void main() {
  float mask = 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5));
  fragColor = vec4(vColor, vAlpha * mask);
}`;
const BLUR_FRAG = `precision highp float;

in vec2 vUv;

uniform sampler2D tInput;
uniform vec2 uStep;

out vec4 fragColor;

void main() {
  vec4 sum = texture(tInput, vUv) * 0.2270270270;
  sum += texture(tInput, vUv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(tInput, vUv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(tInput, vUv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(tInput, vUv - uStep * 3.2307692308) * 0.0702702703;
  fragColor = sum;
}`;
const COMPOSITE_FRAG = `precision highp float;

in vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tGlow;
uniform float uGlow;
uniform vec2 uAberration;

out vec4 fragColor;

void main() {
  vec2 dir = vUv - 0.5;
  vec2 shift = dir * uAberration;
  vec4 r = texture(tScene, vUv + shift);
  vec4 g = texture(tScene, vUv);
  vec4 b = texture(tScene, vUv - shift);
  vec4 scene = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));

  vec4 glow = texture(tGlow, vUv) * uGlow * (1.0 - scene.a);
  fragColor = vec4(scene.rgb + glow.rgb, min(scene.a + glow.a, 1.0));
}`;
interface ImageSample {
  aspect: number;
  count: number;
  coords: Float32Array;
  depth: Float32Array;
  colors: Uint8Array;
  width: number;
  height: number;
}
type SampleSlot =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      sample: ImageSample;
    }
  | {
      status: "failed";
    };
interface TargetSet {
  pos: THREE.Texture;
  color: THREE.Texture;
  aspect: number;
  isFrame: boolean;
}
interface MorphState {
  from: TargetSet | null;
  to: TargetSet | null;
  toIndex: number;
  start: number;
  progress: number;
  active: boolean;
}
interface PointerTracker {
  x: number;
  y: number;
  smoothX: number;
  smoothY: number;
  speed: number;
  active: number;
  engaged: boolean;
}
interface Passes {
  scene: THREE.Scene;
  camera: THREE.Camera;
  quad: THREE.Mesh;
  freezeMaterial: THREE.RawShaderMaterial;
  turbulenceMaterial: THREE.RawShaderMaterial;
  freezeTargets: THREE.WebGLRenderTarget[];
  freezeFront: number;
  dispTargets: THREE.WebGLRenderTarget[];
  dispFront: number;
  dispCleared: boolean;
  dispDirty: boolean;
  sceneTarget: THREE.WebGLRenderTarget;
  glowTargets: THREE.WebGLRenderTarget[];
  blurMaterial: THREE.RawShaderMaterial;
  compositeMaterial: THREE.RawShaderMaterial;
  release: () => void;
}
type MorphUniforms = Record<string, THREE.IUniform>;
const SAMPLE_MAX = 400;
const ALPHA_CUTOFF = 40;
const MAX_GRID = 512;
const OFFSCREEN = -1000;
function gridFor(count: number): number {
  return Math.min(
    MAX_GRID,
    Math.max(16, Math.ceil(Math.sqrt(Math.max(count, 1)))),
  );
}
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function freshMorph(): MorphState {
  return {
    from: null,
    to: null,
    toIndex: -1,
    start: 0,
    progress: 1,
    active: false,
  };
}
function sampleImage(
  image: HTMLImageElement,
  luminanceThreshold: number,
): ImageSample {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) {
    throw new Error("Image has no dimensions");
  }
  const scale = Math.min(1, SAMPLE_MAX / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D context unavailable");
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const cutoff = luminanceThreshold * 255;
  const visible = (i: number) =>
    data[i + 3] > ALPHA_CUTOFF &&
    data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 >= cutoff;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (visible(i)) count++;
  }
  if (count === 0) throw new Error("Image has no visible pixels");
  const FAR = 1e9;
  const dist = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      if (!visible(j * 4)) {
        dist[j] = 0;
        continue;
      }
      let d =
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : FAR;
      if (y > 0) {
        d = Math.min(d, dist[j - width] + 1);
        if (x > 0) d = Math.min(d, dist[j - width - 1] + 1.4142);
        if (x < width - 1) d = Math.min(d, dist[j - width + 1] + 1.4142);
      }
      if (x > 0) d = Math.min(d, dist[j - 1] + 1);
      dist[j] = d;
    }
  }
  let maxDist = 0;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const j = y * width + x;
      if (dist[j] === 0) continue;
      let d = dist[j];
      if (y < height - 1) {
        d = Math.min(d, dist[j + width] + 1);
        if (x > 0) d = Math.min(d, dist[j + width - 1] + 1.4142);
        if (x < width - 1) d = Math.min(d, dist[j + width + 1] + 1.4142);
      }
      if (x < width - 1) d = Math.min(d, dist[j + 1] + 1);
      dist[j] = d;
      if (d > maxDist) maxDist = d;
    }
  }
  const coords = new Float32Array(count * 2);
  const depth = new Float32Array(count);
  const colors = new Uint8Array(count * 3);
  let k = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      const i = j * 4;
      if (!visible(i)) continue;
      coords[k * 2] = (x + 0.5) / width;
      coords[k * 2 + 1] = (y + 0.5) / height;
      depth[k] = maxDist > 0 ? dist[j] / maxDist : 0;
      colors[k * 3] = data[i];
      colors[k * 3 + 1] = data[i + 1];
      colors[k * 3 + 2] = data[i + 2];
      k++;
    }
  }
  return {
    aspect: naturalWidth / naturalHeight,
    count,
    coords,
    depth,
    colors,
    width,
    height,
  };
}
function loadSample(
  url: string,
  luminanceThreshold: number,
): Promise<ImageSample> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        resolve(sampleImage(image, luminanceThreshold));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}
function useImageSamples(
  images: string[],
  luminanceThreshold: number,
): SampleSlot[] {
  const key = `${luminanceThreshold}\n${images.join("\n")}`;
  const [state, setState] = useState<{
    key: string;
    slots: SampleSlot[];
  }>(() => ({ key, slots: images.map(() => ({ status: "loading" })) }));
  useEffect(() => {
    let active = true;
    const urls = images.slice();
    const settle = (index: number, slot: SampleSlot) => {
      if (!active) return;
      setState((prev) => {
        const slots =
          prev.key === key
            ? prev.slots.slice()
            : urls.map((): SampleSlot => ({ status: "loading" }));
        slots[index] = slot;
        return { key, slots };
      });
    };
    urls.forEach((url, index) => {
      loadSample(url, luminanceThreshold)
        .then((sample) => settle(index, { status: "ready", sample }))
        .catch(() => settle(index, { status: "failed" }));
    });
    return () => {
      active = false;
    };
  }, [key]);
  const loading = useMemo<SampleSlot[]>(
    () => images.map(() => ({ status: "loading" })),
    [key],
  );
  return state.key === key ? state.slots : loading;
}
function buildTargets(
  sample: ImageSample,
  grid: number,
  seed: number,
): TargetSet {
  const total = grid * grid;
  const rng = createRng(seed);
  const rank = new Float32Array(sample.count);
  for (let i = 0; i < sample.count; i++)
    rank[i] = sample.depth[i] + rng() * 0.12;
  const order = Uint32Array.from({ length: sample.count }, (_, i) => i).sort(
    (x, y) => rank[x] - rank[y],
  );
  const jitterX = 0.5 / sample.width;
  const jitterY = 0.5 / sample.height;
  const pos = new Float32Array(total * 4);
  const col = new Uint8Array(total * 4);
  for (let i = 0; i < total; i++) {
    const k =
      order[
        Math.min(
          sample.count - 1,
          Math.floor(((i + 0.5) / total) * sample.count),
        )
      ];
    pos[i * 4] = sample.coords[k * 2] + (rng() * 2 - 1) * jitterX;
    pos[i * 4 + 1] = sample.coords[k * 2 + 1] + (rng() * 2 - 1) * jitterY;
    pos[i * 4 + 2] = sample.depth[k];
    pos[i * 4 + 3] = 1;
    col[i * 4] = sample.colors[k * 3];
    col[i * 4 + 1] = sample.colors[k * 3 + 1];
    col[i * 4 + 2] = sample.colors[k * 3 + 2];
    col[i * 4 + 3] = 255;
  }
  const posTexture = new THREE.DataTexture(
    pos,
    grid,
    grid,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  posTexture.minFilter = THREE.NearestFilter;
  posTexture.magFilter = THREE.NearestFilter;
  posTexture.generateMipmaps = false;
  posTexture.needsUpdate = true;
  const colorTexture = new THREE.DataTexture(
    col,
    grid,
    grid,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  colorTexture.minFilter = THREE.NearestFilter;
  colorTexture.magFilter = THREE.NearestFilter;
  colorTexture.generateMipmaps = false;
  colorTexture.needsUpdate = true;
  return {
    pos: posTexture,
    color: colorTexture,
    aspect: sample.aspect,
    isFrame: false,
  };
}
function disposeTargets(target: TargetSet) {
  target.pos.dispose();
  target.color.dispose();
}
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
function useInView(ref: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setSize((prev) =>
        prev.width === bounds.width && prev.height === bounds.height
          ? prev
          : { width: bounds.width, height: bounds.height },
      );
    };
    measure();
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, 200);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ref]);
  return size;
}
function createMorphUniforms(): MorphUniforms {
  return {
    tFromPos: { value: null },
    tToPos: { value: null },
    tFromColor: { value: null },
    tToColor: { value: null },
    uFromAspect: { value: 1 },
    uToAspect: { value: 1 },
    uFromIsFrame: { value: 0 },
    uFrameAspect: { value: 1 },
    uProgress: { value: 1 },
    uTime: { value: 0 },
    uDispersion: { value: 1 },
    uChaos: { value: 0 },
    uMotion: { value: 1 },
    uIdle: { value: 1 },
    uIdleDrift: { value: 1 },
    uIdleSpeed: { value: 1 },
  };
}
function applyMorph(
  uniforms: MorphUniforms,
  state: MorphState,
  frameAspect: number,
  time: number,
  dispersion: number,
  chaos: number,
  motion: number,
  idleDrift: number,
  idleSpeed: number,
) {
  if (!state.from || !state.to) return;
  uniforms.tFromPos.value = state.from.pos;
  uniforms.tToPos.value = state.to.pos;
  uniforms.tFromColor.value = state.from.color;
  uniforms.tToColor.value = state.to.color;
  uniforms.uFromAspect.value = state.from.aspect;
  uniforms.uToAspect.value = state.to.aspect;
  uniforms.uFromIsFrame.value = state.from.isFrame ? 1 : 0;
  uniforms.uFrameAspect.value = frameAspect;
  uniforms.uProgress.value = state.progress;
  uniforms.uTime.value = time;
  uniforms.uDispersion.value = dispersion;
  uniforms.uChaos.value = chaos;
  uniforms.uMotion.value = motion;
  uniforms.uIdleDrift.value = idleDrift;
  uniforms.uIdleSpeed.value = idleSpeed;
}
interface FieldProps {
  slots: SampleSlot[];
  grid: number;
  index: number;
  activeFailed: boolean;
  transitionDuration: number;
  particleSize: number;
  particleOpacity: number;
  dispersion: number;
  chaos: number;
  idleDrift: number;
  idleSpeed: number;
  pointerStrength: number;
  pointerRadius: number;
  glow: number;
  aberration: number;
  color?: string;
  reducedMotion: boolean;
  inView: boolean;
  root: React.RefObject<HTMLElement | null>;
}
type Activity = "full" | "idle" | "rest";
const IDLE_FPS = 30;
const TURBULENCE_SETTLE_MS = 2500;
const GLOW_SCALE = 0.25;
function MorphField({
  slots,
  grid,
  index,
  activeFailed,
  transitionDuration,
  particleSize,
  particleOpacity,
  dispersion,
  chaos,
  idleDrift,
  idleSpeed,
  pointerStrength,
  pointerRadius,
  glow,
  aberration,
  color,
  reducedMotion,
  inView,
  root,
}: FieldProps) {
  const { gl, invalidate } = useThree();
  const activity = useRef<Activity>("full");
  const turbulenceUntil = useRef(0);
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!inView) return;
      const mode = activity.current;
      if (mode === "rest") return;
      if (mode === "idle" && now - last < 1000 / IDLE_FPS - 1) return;
      last = now;
      invalidate();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, invalidate]);
  useEffect(() => {
    activity.current = "full";
    invalidate();
  });
  const cache = useRef<{
    grid: number;
    map: Map<ImageSample, TargetSet>;
  }>({
    grid: -1,
    map: new Map(),
  });
  useEffect(() => {
    const store = cache.current;
    return () => {
      store.map.forEach(disposeTargets);
      store.map.clear();
      store.grid = -1;
    };
  }, []);
  const morph = useRef<MorphState>(freshMorph());
  const desired = useRef(index);
  const fade = useRef(0);
  const clock = useRef(0);
  const pointer = useRef<PointerTracker>({
    x: OFFSCREEN,
    y: OFFSCREEN,
    smoothX: OFFSCREEN,
    smoothY: OFFSCREEN,
    speed: 0,
    active: 0,
    engaged: false,
  });
  useEffect(() => {
    desired.current = index;
  }, [index]);
  useEffect(() => {
    const element = root.current ?? gl.domElement;
    const tracker = pointer.current;
    const toFrame = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      const w = Math.max(bounds.width, 1);
      const h = Math.max(bounds.height, 1);
      const x = ((event.clientX - bounds.left) / w) * 2 - 1;
      const y = ((event.clientY - bounds.top) / h) * 2 - 1;
      return { x: x * (w / h), y: -y };
    };
    const move = (event: PointerEvent) => {
      const point = toFrame(event);
      if (!tracker.engaged) {
        tracker.smoothX = point.x;
        tracker.smoothY = point.y;
        tracker.engaged = true;
      }
      tracker.x = point.x;
      tracker.y = point.y;
    };
    const leave = () => {
      tracker.engaged = false;
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerdown", move);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointercancel", leave);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerdown", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointercancel", leave);
    };
  }, [root, gl]);
  const tint = useMemo(
    () =>
      new THREE.Color().setStyle(
        color ?? "#ffffff",
        THREE.LinearSRGBColorSpace,
      ),
    [color],
  );
  const geometry = useMemo(() => {
    const total = grid * grid;
    const lookup = new Float32Array(total * 3);
    for (let i = 0; i < total; i++) {
      lookup[i * 3] = ((i % grid) + 0.5) / grid;
      lookup[i * 3 + 1] = (Math.floor(i / grid) + 0.5) / grid;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(lookup, 3));
    return buffer;
  }, [grid]);
  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);
  const pointMaterial = useMemo(
    () =>
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: {
          ...createMorphUniforms(),
          tDisp: { value: null },
          uPointSize: { value: 4 },
          uOpacity: { value: 1 },
          uColor: { value: new THREE.Color("#ffffff") },
          uUseColor: { value: 0 },
          uFade: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [],
  );
  useEffect(() => {
    return () => pointMaterial.dispose();
  }, [pointMaterial]);
  const surface = useRef<THREE.RawShaderMaterial | null>(null);
  useEffect(() => {
    surface.current = pointMaterial;
    return () => {
      surface.current = null;
    };
  }, [pointMaterial]);
  const passes = useRef<Passes | null>(null);
  useEffect(() => {
    const context = gl.getContext();
    const floatCapable =
      context.getExtension("EXT_color_buffer_float") !== null;
    const dataType = floatCapable ? THREE.FloatType : THREE.HalfFloatType;
    const createTarget = (count: number) =>
      new THREE.WebGLRenderTarget(grid, grid, {
        count,
        type: dataType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    const freezeTargets = [createTarget(2), createTarget(2)];
    const dispTargets = [createTarget(1), createTarget(1)];
    const freezeMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: FREEZE_FRAG,
      uniforms: createMorphUniforms(),
      depthTest: false,
      depthWrite: false,
    });
    freezeMaterial.uniforms.uIdle.value = 0;
    const turbulenceMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: TURBULENCE_FRAG,
      uniforms: {
        ...createMorphUniforms(),
        tDisp: { value: null },
        uPointer: { value: new THREE.Vector2(OFFSCREEN, OFFSCREEN) },
        uPointerActive: { value: 0 },
        uPointerRadius: { value: 0.3 },
        uPointerStrength: { value: 1 },
        uPointerSpeed: { value: 0 },
        uDt: { value: 1 / 60 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const screenTarget = (width: number, height: number) =>
      new THREE.WebGLRenderTarget(width, height, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    const sceneTarget = screenTarget(1, 1);
    const glowTargets = [screenTarget(1, 1), screenTarget(1, 1)];
    const blurMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tInput: { value: null },
        uStep: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });
    const compositeMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tGlow: { value: null },
        uGlow: { value: 0 },
        uAberration: { value: new THREE.Vector2() },
      },
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    const plane = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(plane, freezeMaterial);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    morph.current = freshMorph();
    passes.current = {
      scene,
      camera: new THREE.Camera(),
      quad,
      freezeMaterial,
      turbulenceMaterial,
      freezeTargets,
      freezeFront: 0,
      dispTargets,
      dispFront: 0,
      dispCleared: false,
      dispDirty: false,
      sceneTarget,
      glowTargets,
      blurMaterial,
      compositeMaterial,
      release: () => {
        freezeTargets.forEach((target) => target.dispose());
        dispTargets.forEach((target) => target.dispose());
        sceneTarget.dispose();
        glowTargets.forEach((target) => target.dispose());
        freezeMaterial.dispose();
        turbulenceMaterial.dispose();
        blurMaterial.dispose();
        compositeMaterial.dispose();
        plane.dispose();
      },
    };
    return () => {
      passes.current?.release();
      passes.current = null;
    };
  }, [gl, grid]);
  const frameSize = useRef(new THREE.Vector2(1, 1));
  const bufferSize = useRef(new THREE.Vector2(1, 1));
  const clearColor = useRef(new THREE.Color());
  const energy = useRef(0);
  useFrame((state, delta) => {
    const pass = passes.current;
    const material = surface.current;
    if (!pass || !material) return;
    const renderer = state.gl;
    const size = renderer.getSize(frameSize.current);
    const frameAspect = Math.max(size.x, 1) / Math.max(size.y, 1);
    const dt = Math.min(delta, 1 / 30);
    const motion = reducedMotion ? 0 : 1;
    const now = performance.now();
    const duration = reducedMotion ? 0 : Math.max(transitionDuration, 1);
    clock.current += dt;
    const time = clock.current;
    const m = morph.current;
    const store = cache.current;
    if (store.grid !== grid) {
      store.map.forEach(disposeTargets);
      store.map.clear();
      store.grid = grid;
    }
    const liveSamples = new Set<ImageSample>();
    for (const slot of slots) {
      if (slot.status === "ready") liveSamples.add(slot.sample);
    }
    store.map.forEach((target, sample) => {
      if (!liveSamples.has(sample)) {
        disposeTargets(target);
        store.map.delete(sample);
      }
    });
    const liveTargets = new Set(store.map.values());
    const stale = (target: TargetSet | null) =>
      target !== null && !target.isFrame && !liveTargets.has(target);
    if (stale(m.from) || stale(m.to)) {
      Object.assign(m, freshMorph());
    }
    const want = desired.current;
    const wantSlot = slots[want];
    let wantTarget: TargetSet | null = null;
    if (wantSlot?.status === "ready") {
      wantTarget = store.map.get(wantSlot.sample) ?? null;
      if (!wantTarget) {
        wantTarget = buildTargets(wantSlot.sample, grid, want + 1);
        store.map.set(wantSlot.sample, wantTarget);
      }
    }
    if (wantTarget && want !== m.toIndex) {
      if (!m.to || duration === 0) {
        m.from = wantTarget;
        m.to = wantTarget;
        m.toIndex = want;
        m.progress = 1;
        m.active = false;
        fade.current = 0;
      } else {
        if (m.active) {
          const writeIndex = 1 - pass.freezeFront;
          const freezeTarget = pass.freezeTargets[writeIndex];
          applyMorph(
            pass.freezeMaterial.uniforms,
            m,
            frameAspect,
            time,
            dispersion,
            chaos,
            motion,
            idleDrift,
            idleSpeed,
          );
          pass.quad.material = pass.freezeMaterial;
          renderer.setRenderTarget(freezeTarget);
          renderer.render(pass.scene, pass.camera);
          renderer.setRenderTarget(null);
          pass.freezeFront = writeIndex;
          m.from = {
            pos: freezeTarget.textures[0],
            color: freezeTarget.textures[1],
            aspect: 1,
            isFrame: true,
          };
        } else {
          m.from = m.to;
        }
        m.to = wantTarget;
        m.toIndex = want;
        m.start = now;
        m.progress = 0;
        m.active = true;
      }
    }
    if (m.active) {
      m.progress = Math.min((now - m.start) / duration, 1);
      if (m.progress >= 1) m.active = false;
    }
    const visible = m.to !== null && !activeFailed;
    const fadeTarget = visible ? 1 : 0;
    fade.current += (fadeTarget - fade.current) * Math.min(1, dt * 6);
    if (Math.abs(fadeTarget - fade.current) < 0.002) fade.current = fadeTarget;
    const tracker = pointer.current;
    const wantActive =
      tracker.engaged && pointerStrength > 0 && !reducedMotion ? 1 : 0;
    tracker.active += (wantActive - tracker.active) * Math.min(1, dt * 8);
    if (tracker.engaged) {
      const px = tracker.smoothX;
      const py = tracker.smoothY;
      tracker.smoothX += (tracker.x - tracker.smoothX) * Math.min(1, dt * 14);
      tracker.smoothY += (tracker.y - tracker.smoothY) * Math.min(1, dt * 14);
      const moved =
        Math.hypot(tracker.smoothX - px, tracker.smoothY - py) /
        Math.max(dt, 1e-4);
      tracker.speed +=
        (Math.min(moved, 2) - tracker.speed) * Math.min(1, dt * 6);
    } else {
      tracker.speed *= Math.max(0, 1 - dt * 6);
    }
    if (tracker.active > 0.002) {
      turbulenceUntil.current = now + TURBULENCE_SETTLE_MS;
    }
    const turbulent = now < turbulenceUntil.current;
    if (!turbulent && pass.dispCleared && pass.dispDirty) {
      pass.dispCleared = false;
    }
    if (!pass.dispCleared) {
      renderer.getClearColor(clearColor.current);
      const previousAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      pass.dispTargets.forEach((target) => {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
      });
      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColor.current, previousAlpha);
      pass.dispCleared = true;
      pass.dispDirty = false;
    }
    if (m.to && turbulent) {
      pass.dispDirty = true;
      const read = pass.dispTargets[pass.dispFront];
      const write = pass.dispTargets[1 - pass.dispFront];
      const turb = pass.turbulenceMaterial.uniforms;
      applyMorph(
        turb,
        m,
        frameAspect,
        time,
        dispersion,
        chaos,
        motion,
        idleDrift,
        idleSpeed,
      );
      turb.tDisp.value = read.texture;
      turb.uPointer.value.set(tracker.smoothX, tracker.smoothY);
      turb.uPointerActive.value = tracker.active;
      turb.uPointerRadius.value = (pointerRadius * 2) / Math.max(size.y, 1);
      turb.uPointerStrength.value = pointerStrength;
      turb.uPointerSpeed.value = tracker.speed;
      turb.uDt.value = dt;
      pass.quad.material = pass.turbulenceMaterial;
      renderer.setRenderTarget(write);
      renderer.render(pass.scene, pass.camera);
      renderer.setRenderTarget(null);
      pass.dispFront = 1 - pass.dispFront;
    }
    const points = material.uniforms;
    applyMorph(
      points,
      m,
      frameAspect,
      time,
      dispersion,
      chaos,
      motion,
      idleDrift,
      idleSpeed,
    );
    points.tDisp.value = pass.dispTargets[pass.dispFront].texture;
    points.uPointSize.value = particleSize * renderer.getPixelRatio();
    points.uOpacity.value = particleOpacity;
    points.uColor.value.copy(tint);
    points.uUseColor.value = color ? 1 : 0;
    points.uFade.value = fade.current;
    material.visible = m.to !== null;
    const pending = wantTarget !== null && want !== m.toIndex;
    const energyTarget = Math.max(
      m.active ? Math.sin(m.progress * Math.PI) : 0,
      tracker.active,
    );
    energy.current += (energyTarget - energy.current) * Math.min(1, dt * 5);
    if (Math.abs(energyTarget - energy.current) < 0.002) {
      energy.current = energyTarget;
    }
    const post = glow > 0 || aberration > 0;
    if (post) {
      const buffer = renderer.getDrawingBufferSize(bufferSize.current);
      const width = Math.max(1, Math.round(buffer.x));
      const height = Math.max(1, Math.round(buffer.y));
      if (
        pass.sceneTarget.width !== width ||
        pass.sceneTarget.height !== height
      ) {
        pass.sceneTarget.setSize(width, height);
        const gw = Math.max(1, Math.round(width * GLOW_SCALE));
        const gh = Math.max(1, Math.round(height * GLOW_SCALE));
        pass.glowTargets.forEach((target) => target.setSize(gw, gh));
      }
      renderer.setRenderTarget(pass.sceneTarget);
      renderer.clear(true, false, false);
      renderer.render(state.scene, state.camera);
      const blur = pass.blurMaterial.uniforms;
      pass.quad.material = pass.blurMaterial;
      if (glow > 0) {
        const [glowA, glowB] = pass.glowTargets;
        blur.tInput.value = pass.sceneTarget.texture;
        blur.uStep.value.set(1 / glowA.width, 0);
        renderer.setRenderTarget(glowA);
        renderer.render(pass.scene, pass.camera);
        blur.tInput.value = glowA.texture;
        blur.uStep.value.set(0, 1 / glowA.height);
        renderer.setRenderTarget(glowB);
        renderer.render(pass.scene, pass.camera);
      }
      const comp = pass.compositeMaterial.uniforms;
      comp.tScene.value = pass.sceneTarget.texture;
      comp.tGlow.value = pass.glowTargets[1].texture;
      comp.uGlow.value = glow * fade.current;
      const pulse = aberration * (0.35 + 0.65 * energy.current * motion);
      comp.uAberration.value.set(
        (pulse * 2 * renderer.getPixelRatio()) / width,
        (pulse * 2 * renderer.getPixelRatio()) / height,
      );
      pass.quad.material = pass.compositeMaterial;
      renderer.setRenderTarget(null);
      renderer.render(pass.scene, pass.camera);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(state.scene, state.camera);
    }
    const settling =
      fade.current !== fadeTarget ||
      tracker.active > 0.002 ||
      energy.current !== energyTarget;
    if (m.active || pending || settling || turbulent) {
      activity.current = "full";
    } else if (idleDrift > 0 && !reducedMotion && m.to) {
      activity.current = "idle";
    } else {
      activity.current = "rest";
    }
  }, 1);
  return (
    <points
      geometry={geometry}
      material={pointMaterial}
      frustumCulled={false}
    />
  );
}
function useControlledIndex(
  activeIndex: number | undefined,
  defaultIndex: number,
  count: number,
  onIndexChange?: (index: number) => void,
): [number, (next: number) => void] {
  const [internal, setInternal] = useState(defaultIndex);
  const controlled = activeIndex !== undefined;
  const raw = controlled ? activeIndex : internal;
  const index =
    count > 0 ? Math.min(Math.max(Math.round(raw), 0), count - 1) : 0;
  const callbackRef = useRef(onIndexChange);
  useEffect(() => {
    callbackRef.current = onIndexChange;
  }, [onIndexChange]);
  const setIndex = useCallback(
    (next: number) => {
      if (!controlled) setInternal(next);
      callbackRef.current?.(next);
    },
    [controlled],
  );
  return [index, setIndex];
}
const ParticleMorph: React.FC<ParticleMorphProps> = ({
  images,
  activeIndex,
  defaultIndex = 0,
  autoplay = true,
  interval = 3000,
  transitionDuration = 1800,
  particleDensity = 80,
  particleSize = 2,
  particleOpacity = 0.9,
  dispersion = 1,
  chaos = 0,
  idleDrift = 1,
  idleSpeed = 1,
  pointerStrength = 1,
  pointerRadius = 120,
  glow = 0.6,
  aberration = 1.5,
  color,
  backgroundColor = "#0a0a0a",
  luminanceThreshold = 0,
  loop = true,
  onIndexChange,
  width = "100%",
  height = "100%",
  className,
  children,
  dpr = 2,
}) => {
  const root = useRef<HTMLDivElement | null>(null);
  const inView = useInView(root);
  const size = useElementSize(root);
  const reducedMotion = useReducedMotion();
  const slots = useImageSamples(images, luminanceThreshold);
  const [index, setIndex] = useControlledIndex(
    activeIndex,
    defaultIndex,
    images.length,
    onIndexChange,
  );
  const grid = useMemo(() => {
    const area = Math.max(size.width * size.height, 1);
    return gridFor((area / 1000) * particleDensity);
  }, [size.width, size.height, particleDensity]);
  useEffect(() => {
    if (!autoplay || images.length < 2 || !inView) return;
    const last = images.length - 1;
    if (index >= last && !loop) return;
    const timer = setTimeout(
      () => setIndex(index >= last ? 0 : index + 1),
      interval + (reducedMotion ? 0 : transitionDuration),
    );
    return () => clearTimeout(timer);
  }, [
    autoplay,
    images.length,
    index,
    interval,
    transitionDuration,
    loop,
    inView,
    reducedMotion,
    setIndex,
  ]);
  const activeFailed = slots[index]?.status === "failed";
  return (
    <div
      ref={root}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height, backgroundColor }}
    >
      <Canvas
        className="absolute inset-0"
        dpr={[1, Math.min(Math.max(dpr, 1), 2)]}
        frameloop="demand"
        gl={{
          antialias: false,
          alpha: true,
          depth: false,
          powerPreference: "high-performance",
        }}
      >
        {size.width > 0 && (
          <MorphField
            slots={slots}
            grid={grid}
            index={index}
            activeFailed={activeFailed}
            transitionDuration={transitionDuration}
            particleSize={particleSize}
            particleOpacity={particleOpacity}
            dispersion={dispersion}
            chaos={chaos}
            idleDrift={idleDrift}
            idleSpeed={idleSpeed}
            pointerStrength={pointerStrength}
            pointerRadius={pointerRadius}
            glow={glow}
            aberration={aberration}
            color={color}
            reducedMotion={reducedMotion}
            inView={inView}
            root={root}
          />
        )}
      </Canvas>

      {images.map((src, i) =>
        slots[i]?.status === "failed" ? (
          <img
            key={`${i}-${src}`}
            src={src}
            alt=""
            aria-hidden
            draggable={false}
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-500",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null,
      )}
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
};
export default ParticleMorph;
