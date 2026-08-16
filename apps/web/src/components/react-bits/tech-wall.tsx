"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface TechWallProps {
  /** Overall animation rate */
  speed?: number;
  /** How many panels fit across the shorter side */
  density?: number;
  /** Neighbour rings searched per pixel, 1 is faster and 2 is cleaner */
  range?: number;
  /** Resting rotation of the panels, in radians */
  twist?: number;
  /** How fast the panels rotate */
  spin?: number;
  /** How fast the whole wall glides across the frame */
  pan?: number;
  /** Direction the wall glides, in radians */
  panAngle?: number;
  /** Rate at which each panel seed drifts around its anchor */
  drift?: number;
  /** How far a panel seed sits from its lattice slot, 0 to 1 */
  wander?: number;
  /** Seam thickness in pixels */
  seam?: number;
  /** Brightness of the seam */
  edgeStrength?: number;
  /** Softness of the light bleeding off the seam */
  glow?: number;
  /** How far the seam light reaches */
  glowFalloff?: number;
  /** Brightness of an idle panel */
  ambient?: number;
  /** How much each panel breathes on its own, 0 keeps them steady */
  pulse?: number;
  /** How fast panels breathe */
  pulseRate?: number;
  /** Strength of the wave that lights panels in sequence */
  sweep?: number;
  /** Direction the sweep travels, in radians */
  sweepAngle?: number;
  /** How many panels the sweep spans */
  sweepScale?: number;
  /** How fast the sweep travels */
  sweepSpeed?: number;
  /** Colour of a resting panel */
  color?: string;
  /** Colour of a lit panel */
  accentColor?: string;
  /** Colour of the seams */
  edgeColor?: string;
  /** Overall exposure */
  gain?: number;
  /** Film grain strength, 0 to 1 */
  grain?: number;
  /** Grain refresh rate, in hertz */
  grainRate?: number;
  /** Darkening toward the corners, 0 to 1 */
  vignette?: number;
  /** Colour behind the wall, or transparent */
  backgroundColor?: string;
  /** Opacity of the whole layer */
  opacity?: number;
  /** Let the pointer light up nearby panels */
  cursorInteraction?: boolean;
  /** How brightly panels answer the pointer */
  cursorGlow?: number;
  /** Radius the pointer reaches, in screen heights */
  cursorRadius?: number;
  /** Freeze the animation */
  paused?: boolean;
  /** Scale resolution down when frames get expensive */
  adaptiveQuality?: boolean;
  /** Frame rate the quality scaler aims for */
  targetFps?: number;
  /** Upper device pixel ratio bound */
  dpr?: number;
  className?: string;
  children?: ReactNode;
}

const wallVertex = `
varying vec2 vPlane;

void main() {
  vPlane = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

const buildWallFragment = (range: number) => `
precision highp float;

varying vec2 vPlane;

uniform vec2 uCanvas;
uniform float uClock;
uniform float uDensity;
uniform float uTwist;
uniform float uSpin;
uniform float uPan;
uniform float uPanAngle;
uniform float uDrift;
uniform float uWander;
uniform float uSeam;
uniform float uEdgeGain;
uniform float uGlow;
uniform float uGlowFall;
uniform float uAmbient;
uniform float uPulse;
uniform float uPulseRate;
uniform float uSweep;
uniform float uSweepAngle;
uniform float uSweepScale;
uniform float uSweepSpeed;
uniform vec3 uPanel;
uniform vec3 uAccent;
uniform vec3 uEdge;
uniform float uGain;
uniform float uGrain;
uniform float uGrainRate;
uniform float uVignette;
uniform vec3 uBackdrop;
uniform float uBackdropAlpha;
uniform float uOpacity;
uniform vec2 uPointer;
uniform float uCursorGain;
uniform float uCursorRadius;

const float TAU = 6.2831853;

float scatter(vec2 seed) {
  vec3 drift = fract(vec3(seed.xyx) * vec3(0.1031, 0.1030, 0.0973));
  drift += dot(drift, drift.yzx + 33.33);
  return fract((drift.x + drift.y) * drift.z);
}

vec2 scatter2(vec2 seed) {
  vec3 drift = fract(vec3(seed.xyx) * vec3(0.1031, 0.1030, 0.0973));
  drift += dot(drift, drift.yzx + 33.33);
  return fract((drift.xx + drift.yz) * drift.zy);
}

float facet(vec2 offset, float turn) {
  float crest = -1e5;
  for (int i = 0; i < 3; i++) {
    float lean = turn + float(i) * TAU / 3.0;
    crest = max(crest, dot(offset, vec2(cos(lean), sin(lean))));
  }
  return crest;
}

vec2 siteOf(vec2 cell) {
  float pace = scatter(cell);
  float march = (uClock * uDrift + pace) * (pace * 0.5 + 0.5);
  float leg = floor(march);
  float k = fract(march);
  vec2 from = scatter2(cell + leg);
  vec2 to = scatter2(cell + leg + 1.0);
  vec2 spot = mix(from, to, k * k * (3.0 - 2.0 * k));
  return cell + 0.5 + (spot - 0.5) * uWander;
}

float softClip(float x) {
  float fall = exp(-2.0 * max(x, 0.0));
  return (1.0 - fall) / (1.0 + fall);
}

void main() {
  vec2 pixel = vPlane * uCanvas;
  vec2 field = (pixel - 0.5 * uCanvas) / max(uCanvas.y, 1.0);

  float t = uClock;
  float turn = uTwist + t * uSpin;

  vec2 slide = vec2(cos(uPanAngle), sin(uPanAngle)) * t * uPan;
  vec2 lattice = field * uDensity + slide;
  vec2 home = floor(lattice);

  float best = 1e5;
  vec2 winner = vec2(0.0);
  vec2 winSite = vec2(0.0);

  float runner = 1e5;

  for (int gx = -${range}; gx <= ${range}; gx++) {
    for (int gy = -${range}; gy <= ${range}; gy++) {
      vec2 cell = home + vec2(float(gx), float(gy));
      vec2 site = siteOf(cell);
      float reach = facet(lattice - site, turn);

      if (reach < best) {
        runner = best;
        best = reach;
        winner = cell;
        winSite = site;
      } else if (reach < runner) {
        runner = reach;
      }
    }
  }

  float gap = runner - best;
  float unit = uDensity / max(uCanvas.y, 1.0);
  float slope = max(length(vec2(dFdx(gap), dFdy(gap))), unit * 0.35);
  float span = gap / slope;

  float wide = max(uSeam, 0.1);
  float rim = 1.0 - smoothstep(wide - 1.1, wide + 1.1, span);
  float halo = uGlow * exp(-span / max(uGlowFall, 0.5));

  float tag = scatter(winner + 3.7);

  float breath = 0.5 + 0.5 * sin(t * uPulseRate + tag * TAU);

  vec2 lane = vec2(cos(uSweepAngle), sin(uSweepAngle));
  float travel = dot(winSite, lane) / max(uSweepScale, 0.001) - t * uSweepSpeed;
  float wave = 0.5 + 0.5 * sin(travel);
  wave = wave * wave * (3.0 - 2.0 * wave);
  wave = mix(tag * tag, wave, 0.55);

  vec2 away = ((winSite - slide) / max(uDensity, 0.001)) - uPointer;
  float near = exp(-dot(away, away) / max(uCursorRadius * uCursorRadius, 1e-4));

  float charge = clamp(
    breath * uPulse + wave * uSweep + near * uCursorGain,
    0.0,
    1.0
  );

  float body = max(uAmbient + charge, 0.0);
  float line = rim * uEdgeGain + halo;

  vec3 tone = mix(uPanel, uAccent, charge);
  vec3 tint = (tone * body + uEdge * line) / max(body + line, 1e-4);

  float mass = softClip((body + line) * uGain);

  float vig = smoothstep(1.5, 0.3, length(field));
  float shade = (1.0 - uVignette) + uVignette * vig;
  mass *= shade;

  vec3 rgb = tint * mass;
  float rest = uBackdropAlpha * (1.0 - mass);
  rgb += uBackdrop * rest;
  float alpha = mass + rest;

  float tick = floor(t * max(uGrainRate, 1.0));
  float speck = scatter(pixel + tick * 17.0) - 0.5;
  rgb += speck * uGrain * (0.25 + 0.75 * alpha);
  rgb = clamp(rgb, vec3(0.0), vec3(alpha));

  gl_FragColor = vec4(rgb, alpha) * uOpacity;
}
`;

const literal = (hex: string, fallback: string) => {
  const shade = new THREE.Color();
  try {
    shade.setStyle(hex, THREE.LinearSRGBColorSpace);
  } catch {
    shade.setStyle(fallback, THREE.LinearSRGBColorSpace);
  }
  return shade;
};

const repaint = (target: THREE.Color, hex: string) => {
  try {
    target.setStyle(hex, THREE.LinearSRGBColorSpace);
  } catch {
    return;
  }
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const subscribeToScreen = (notify: () => void) => {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(min-resolution: 2dppx)");
  media.addEventListener("change", notify);
  window.addEventListener("resize", notify);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener("resize", notify);
  };
};

const readScreenDpr = () =>
  typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

const isClear = (paint: string) =>
  paint === "transparent" || paint === "none" || paint === "";

interface PointerState {
  x: number;
  y: number;
  inside: boolean;
}

interface WallViewProps {
  speed: number;
  density: number;
  range: number;
  twist: number;
  spin: number;
  pan: number;
  panAngle: number;
  drift: number;
  wander: number;
  seam: number;
  edgeStrength: number;
  glow: number;
  glowFalloff: number;
  ambient: number;
  pulse: number;
  pulseRate: number;
  sweep: number;
  sweepAngle: number;
  sweepScale: number;
  sweepSpeed: number;
  color: string;
  accentColor: string;
  edgeColor: string;
  gain: number;
  grain: number;
  grainRate: number;
  vignette: number;
  backgroundColor: string;
  opacity: number;
  cursorInteraction: boolean;
  cursorGlow: number;
  cursorRadius: number;
  paused: boolean;
  adaptiveQuality: boolean;
  targetFps: number;
  ceiling: number;
  readPointer: () => PointerState;
}

const WallView = ({
  speed,
  density,
  range,
  twist,
  spin,
  pan,
  panAngle,
  drift,
  wander,
  seam,
  edgeStrength,
  glow,
  glowFalloff,
  ambient,
  pulse,
  pulseRate,
  sweep,
  sweepAngle,
  sweepScale,
  sweepSpeed,
  color,
  accentColor,
  edgeColor,
  gain,
  grain,
  grainRate,
  vignette,
  backgroundColor,
  opacity,
  cursorInteraction,
  cursorGlow,
  cursorRadius,
  paused,
  adaptiveQuality,
  targetFps,
  ceiling,
  readPointer,
}: WallViewProps) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const clock = useRef(0);
  const glide = useRef({ x: 0, y: 0, lit: 0 });
  const budget = useRef({ frames: 0, span: 0, wins: 0, cap: 4 });
  const { gl, size } = useThree();

  const rings = Math.round(clamp(range, 1, 2));

  const fragment = useMemo(() => buildWallFragment(rings), [rings]);

  const uniforms = useMemo(
    () => ({
      uCanvas: { value: new THREE.Vector2(1, 1) },
      uClock: { value: 0 },
      uDensity: { value: 5 },
      uTwist: { value: 0 },
      uSpin: { value: 0 },
      uPan: { value: 0 },
      uPanAngle: { value: 0.9 },
      uDrift: { value: 1 },
      uWander: { value: 1 },
      uSeam: { value: 1.3 },
      uEdgeGain: { value: 1.1 },
      uGlow: { value: 0.14 },
      uGlowFall: { value: 9 },
      uAmbient: { value: 0.16 },
      uPulse: { value: 0 },
      uPulseRate: { value: 1.1 },
      uSweep: { value: 0.75 },
      uSweepAngle: { value: 0.9 },
      uSweepScale: { value: 1.2 },
      uSweepSpeed: { value: 0.45 },
      uPanel: { value: literal("#2a1247", "#2a1247") },
      uAccent: { value: literal("#d946ef", "#d946ef") },
      uEdge: { value: literal("#f0abfc", "#f0abfc") },
      uGain: { value: 1 },
      uGrain: { value: 0.04 },
      uGrainRate: { value: 24 },
      uVignette: { value: 0.25 },
      uBackdrop: { value: literal("#0a0a0a", "#0a0a0a") },
      uBackdropAlpha: { value: 1 },
      uOpacity: { value: 1 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uCursorGain: { value: 0 },
      uCursorRadius: { value: 0.28 },
    }),
    [],
  );

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.fragmentShader = fragment;
    material.needsUpdate = true;
  }, [fragment]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    repaint(material.uniforms.uPanel.value, color);
    repaint(material.uniforms.uAccent.value, accentColor);
    repaint(material.uniforms.uEdge.value, edgeColor);
    const clear = isClear(backgroundColor);
    material.uniforms.uBackdropAlpha.value = clear ? 0 : 1;
    if (!clear) repaint(material.uniforms.uBackdrop.value, backgroundColor);
  }, [color, accentColor, edgeColor, backgroundColor]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    const beat = Math.min(delta, 0.05);
    if (!paused) clock.current += beat * speed;

    const ratio = gl.getPixelRatio();
    const set = material.uniforms;
    set.uCanvas.value.set(size.width * ratio, size.height * ratio);
    set.uClock.value = clock.current;
    set.uDensity.value = Math.max(density, 1);
    set.uTwist.value = twist;
    set.uSpin.value = spin;
    set.uPan.value = pan;
    set.uPanAngle.value = panAngle;
    set.uDrift.value = drift;
    set.uWander.value = wander;
    set.uSeam.value = seam;
    set.uEdgeGain.value = edgeStrength;
    set.uGlow.value = glow;
    set.uGlowFall.value = Math.max(glowFalloff, 0.1);
    set.uAmbient.value = ambient;
    set.uPulse.value = pulse;
    set.uPulseRate.value = pulseRate;
    set.uSweep.value = sweep;
    set.uSweepAngle.value = sweepAngle;
    set.uSweepScale.value = sweepScale;
    set.uSweepSpeed.value = sweepSpeed;
    set.uGain.value = gain;
    set.uGrain.value = grain;
    set.uGrainRate.value = grainRate;
    set.uVignette.value = vignette;
    set.uOpacity.value = opacity;
    set.uCursorRadius.value = Math.max(cursorRadius, 0.01);

    const pointer = readPointer();
    const smooth = 1 - Math.exp(-beat * 10);
    const aspect = size.width / Math.max(size.height, 1);
    const aimX = (pointer.x - 0.5) * aspect;
    const aimY = pointer.y - 0.5;
    const aimLit = cursorInteraction && pointer.inside ? cursorGlow : 0;
    glide.current.x += (aimX - glide.current.x) * smooth;
    glide.current.y += (aimY - glide.current.y) * smooth;
    glide.current.lit += (aimLit - glide.current.lit) * smooth;
    set.uPointer.value.set(glide.current.x, glide.current.y);
    set.uCursorGain.value = glide.current.lit;

    if (!adaptiveQuality) return;
    const meter = budget.current;
    meter.frames += 1;
    meter.span += delta;
    if (meter.span < 0.75) return;
    const fps = meter.frames / meter.span;
    meter.frames = 0;
    meter.span = 0;
    const roof = Math.min(ceiling, meter.cap);
    if (fps < targetFps * 0.85 && ratio > 0.6) {
      meter.wins = 0;
      meter.cap = Math.max(0.6, ratio * 0.9);
      gl.setPixelRatio(Math.max(0.6, ratio * 0.75));
    } else if (fps > targetFps * 0.98 && ratio < roof - 0.01) {
      meter.wins += 1;
      if (meter.wins >= 3) {
        meter.wins = 0;
        gl.setPixelRatio(Math.min(roof, ratio * 1.25));
      }
    } else {
      meter.wins = 0;
    }
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={wallVertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        premultipliedAlpha
      />
    </mesh>
  );
};

export const TechWall = ({
  speed = 1,
  density = 5,
  range = 2,
  twist = 0,
  spin = 0,
  pan = 0,
  panAngle = 0.9,
  drift = 1,
  wander = 1,
  seam = 1.3,
  edgeStrength = 1.1,
  glow = 0.14,
  glowFalloff = 9,
  ambient = 0.16,
  pulse = 0,
  pulseRate = 1.1,
  sweep = 0.75,
  sweepAngle = 0.9,
  sweepScale = 1.2,
  sweepSpeed = 0.45,
  color = "#2a1247",
  accentColor = "#d946ef",
  edgeColor = "#f0abfc",
  gain = 1,
  grain = 0.04,
  grainRate = 24,
  vignette = 0.25,
  backgroundColor = "#0a0a0a",
  opacity = 1,
  cursorInteraction = true,
  cursorGlow = 0.45,
  cursorRadius = 0.28,
  paused = false,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 1.75,
  className,
  children,
}: TechWallProps) => {
  const shell = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerState>({ x: 0.5, y: 0.5, inside: false });
  const [awake, setAwake] = useState(true);

  const screenDpr = useSyncExternalStore(
    subscribeToScreen,
    readScreenDpr,
    () => 1,
  );
  const ceiling = Math.min(screenDpr, Math.max(dpr, 0.5));

  const readPointer = useCallback(() => pointer.current, []);

  useEffect(() => {
    const node = shell.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(
      ([entry]) => setAwake(entry.isIntersecting),
      { threshold: 0 },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    const node = shell.current;
    if (!node || !cursorInteraction) return;

    const track = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return;
      pointer.current.x = clamp((event.clientX - box.left) / box.width, 0, 1);
      pointer.current.y = clamp(
        1 - (event.clientY - box.top) / box.height,
        0,
        1,
      );
      pointer.current.inside = true;
    };

    const reset = () => {
      pointer.current.inside = false;
    };

    node.addEventListener("pointermove", track);
    node.addEventListener("pointerleave", reset);
    return () => {
      node.removeEventListener("pointermove", track);
      node.removeEventListener("pointerleave", reset);
    };
  }, [cursorInteraction]);

  return (
    <div ref={shell} className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-0">
        <Canvas
          orthographic
          dpr={ceiling}
          frameloop={awake ? "always" : "demand"}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "high-performance",
          }}
        >
          <WallView
            speed={speed}
            density={density}
            range={range}
            twist={twist}
            spin={spin}
            pan={pan}
            panAngle={panAngle}
            drift={drift}
            wander={wander}
            seam={seam}
            edgeStrength={edgeStrength}
            glow={glow}
            glowFalloff={glowFalloff}
            ambient={ambient}
            pulse={pulse}
            pulseRate={pulseRate}
            sweep={sweep}
            sweepAngle={sweepAngle}
            sweepScale={sweepScale}
            sweepSpeed={sweepSpeed}
            color={color}
            accentColor={accentColor}
            edgeColor={edgeColor}
            gain={gain}
            grain={grain}
            grainRate={grainRate}
            vignette={vignette}
            backgroundColor={backgroundColor}
            opacity={opacity}
            cursorInteraction={cursorInteraction}
            cursorGlow={cursorGlow}
            cursorRadius={cursorRadius}
            paused={paused}
            adaptiveQuality={adaptiveQuality}
            targetFps={targetFps}
            ceiling={ceiling}
            readPointer={readPointer}
          />
        </Canvas>
      </div>
      {children ? (
        <div className="relative z-10 h-full w-full">{children}</div>
      ) : null}
    </div>
  );
};

export default TechWall;
