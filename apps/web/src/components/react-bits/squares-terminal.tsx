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

export interface SquaresTerminalProps {
  /** Container width */
  width?: string | number;
  /** Container height */
  height?: string | number;
  /** Additional CSS classes */
  className?: string;
  /** Content rendered above the field */
  children?: React.ReactNode;
  /** Cells across the horizontal axis */
  columns?: number;
  /** Cells across the vertical axis */
  rows?: number;
  /** Phosphor color in hex */
  color?: string;
  /** Screen fill color in hex */
  backgroundColor?: string;
  /** Cells a row travels each second */
  speed?: number;
  /** Push that biases rows toward one direction */
  rowBias?: number;
  /** Cutoff above which a cell lights up, from 0 to 1 */
  fillThreshold?: number;
  /** Width of the lit edge of a cell, from 0 to 1 */
  dashHead?: number;
  /** Point at which a cell has faded out, from 0 to 1 */
  dashTail?: number;
  /** Dimmest a row is allowed to be */
  rowFloor?: number;
  /** Blank every other row */
  alternateRows?: boolean;
  /** Amount of tube bend across the screen */
  curvature?: number;
  /** Bloom on the hottest cells */
  glow?: number;
  /** Darkening toward the screen corners */
  vignette?: number;
  /** Master alpha from 0 to 1 */
  opacity?: number;
  /** Let the cursor disturb nearby rows */
  cursorInteraction?: boolean;
  /** Cursor influence radius in screen units */
  cursorRadius?: number;
  /** How far the cursor lifts nearby cells toward full brightness */
  cursorIntensity?: number;
  /** Freeze all motion */
  paused?: boolean;
  /** Maximum device pixel ratio */
  dpr?: number;
}

const terminalVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const terminalFragment = `
precision highp float;

varying vec2 vUv;

uniform float uClock;
uniform vec2 uGrid;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uRowBias;
uniform float uThreshold;
uniform float uHead;
uniform float uTail;
uniform float uRowFloor;
uniform float uAlternate;
uniform vec2 uCurve;
uniform float uGlow;
uniform float uVignette;
uniform float uOpacity;
uniform vec2 uPointer;
uniform float uCursorRadius;
uniform float uCursorIntensity;
uniform float uPointerActive;

float grain(vec2 seed) {
  return fract(sin(seed.x * 21.281 + seed.y * 93.182) * 5821.92);
}

void main() {
  vec2 signed = vUv * 2.0 - 1.0;
  vec2 warp = abs(signed.yx) * uCurve;
  vec2 bent = (signed + signed * warp * warp) * 0.5 + 0.5;

  vec2 scaled = bent * uGrid;
  vec2 local = fract(scaled);
  vec2 cell = floor(scaled);

  float rowSeed = grain(vec2(0.0, cell.y));
  float heading = (rowSeed * 2.0 - 1.0) + uRowBias;

  float reach = length((bent - uPointer) * vec2(uGrid.x / max(uGrid.y, 1.0), 1.0));
  float field = (1.0 - smoothstep(0.0, max(uCursorRadius, 0.001), reach)) * uPointerActive;

  cell.x += floor(uClock * heading * uSpeed);

  float lit = step(uThreshold, grain(cell));
  float parity = 1.0 - step(1.0, mod(abs(cell.y), 2.0));
  float band = mix(1.0, parity, uAlternate);

  float feather = fwidth(scaled.x);
  float rise = smoothstep(0.0, max(uHead, feather), local.x);
  float fall = smoothstep(0.0, max(uTail, feather * 2.0), local.x);
  float dash = clamp(rise - fall, 0.0, 1.0);

  float rowLevel = fract(sin(cell.y)) + uRowFloor;
  float warmth = field * field * uCursorIntensity;
  float mask = clamp(dash * lit * band * (rowLevel + warmth), 0.0, 1.0);

  vec3 tint = uColor * mask;
  tint += vec3(1.0) * pow(mask, 3.0) * uGlow * 0.35;

  float falloff = 1.0 - smoothstep(0.35, 1.4, length(signed));
  float shade = mix(1.0, falloff, clamp(uVignette, 0.0, 1.0));

  gl_FragColor = vec4(tint * shade, mask * shade) * uOpacity;
}
`;

interface PointerState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: number;
  decay: number;
}

const readHex = (value: string, fallback: string) => {
  const raw = value.trim().replace(/^#/, "");
  const safe = /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)
    ? raw
    : fallback.replace(/^#/, "");
  const full =
    safe.length === 3
      ? safe
          .split("")
          .map((part) => part + part)
          .join("")
      : safe;
  return `#${full}`;
};

type FieldProps = Required<
  Omit<
    SquaresTerminalProps,
    "width" | "height" | "className" | "children" | "dpr" | "backgroundColor"
  >
> & {
  awake: boolean;
  readPointer: () => PointerState;
};

const TerminalField = ({
  awake,
  readPointer,
  columns,
  rows,
  color,
  speed,
  rowBias,
  fillThreshold,
  dashHead,
  dashTail,
  rowFloor,
  alternateRows,
  curvature,
  glow,
  vignette,
  opacity,
  cursorInteraction,
  cursorRadius,
  cursorIntensity,
  paused,
}: FieldProps) => {
  const { invalidate } = useThree();
  const elapsed = useRef(0);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCalm(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const uniforms = useMemo(
    () => ({
      uClock: { value: 0 },
      uGrid: { value: new THREE.Vector2(128, 128) },
      uColor: { value: new THREE.Color("#ff7cf9") },
      uSpeed: { value: 15 },
      uRowBias: { value: 0 },
      uThreshold: { value: 0.3 },
      uHead: { value: 0.1 },
      uTail: { value: 1 },
      uRowFloor: { value: 0.3 },
      uAlternate: { value: 1 },
      uCurve: { value: new THREE.Vector2(1 / 30, 1 / 5.2) },
      uGlow: { value: 0.25 },
      uVignette: { value: 0.5 },
      uOpacity: { value: 1 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uCursorRadius: { value: 0.5 },
      uCursorIntensity: { value: 1 },
      uPointerActive: { value: 0 },
    }),
    [],
  );

  const phosphor = useMemo(
    () => new THREE.Color(readHex(color, "#39FE8E")),
    [color],
  );

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material || !awake) return;

    const cursor = readPointer();
    if (!paused && !calm) elapsed.current += Math.min(delta, 0.05);
    cursor.x += (cursor.targetX - cursor.x) * 0.14;
    cursor.y += (cursor.targetY - cursor.y) * 0.14;
    cursor.decay = Math.max(0, cursor.decay - delta * 1.6);

    const u = material.uniforms;
    u.uClock.value = elapsed.current;
    u.uGrid.value.set(
      Math.max(2, Math.round(columns)),
      Math.max(2, Math.round(rows)),
    );
    u.uColor.value.copy(phosphor);
    u.uSpeed.value = speed;
    u.uRowBias.value = rowBias;
    u.uThreshold.value = Math.min(Math.max(fillThreshold, 0), 0.999);
    u.uHead.value = Math.min(Math.max(dashHead, 0.002), 1);
    u.uTail.value = Math.min(Math.max(dashTail, 0.01), 2);
    u.uRowFloor.value = Math.max(rowFloor, 0);
    u.uAlternate.value = alternateRows ? 1 : 0;
    u.uCurve.value.set((curvature * 1) / 30, (curvature * 1) / 5.2);
    u.uGlow.value = Math.max(glow, 0);
    u.uVignette.value = Math.min(Math.max(vignette, 0), 1);
    u.uOpacity.value = Math.min(Math.max(opacity, 0), 1);
    u.uCursorRadius.value = Math.max(cursorRadius, 0.001);
    u.uCursorIntensity.value = cursorInteraction
      ? Math.max(cursorIntensity, 0)
      : 0;
    u.uPointerActive.value = cursorInteraction
      ? Math.max(cursor.active, cursor.decay)
      : 0;
    u.uPointer.value.set(cursor.x, cursor.y);

    invalidate();
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={terminalVertex}
        fragmentShader={terminalFragment}
        transparent
        premultipliedAlpha
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

const SquaresTerminal = ({
  width = "100%",
  height = "100%",
  className,
  children,
  columns = 128,
  rows = 128,
  color = "#ff7cf9",
  backgroundColor = "#0a0a0a",
  speed = 15,
  rowBias = 0,
  fillThreshold = 0.3,
  dashHead = 0.1,
  dashTail = 1,
  rowFloor = 0.3,
  alternateRows = true,
  curvature = 1,
  glow = 0.25,
  vignette = 0.5,
  opacity = 1,
  cursorInteraction = true,
  cursorRadius = 0.5,
  cursorIntensity = 1,
  paused = false,
  dpr = 1.5,
}: SquaresTerminalProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [awake, setAwake] = useState(true);
  const pointer = useRef<PointerState>({
    x: 0.5,
    y: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    active: 0,
    decay: 0,
  });
  const readPointer = useCallback(() => pointer.current, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setAwake(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const aimAt = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    pointer.current.targetX =
      (event.clientX - rect.left) / Math.max(rect.width, 1);
    pointer.current.targetY =
      1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.current.active = 1;
  }, []);

  const release = useCallback(() => {
    pointer.current.active = 0;
  }, []);

  const strike = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      aimAt(event);
      pointer.current.decay = 1;
    },
    [aimAt],
  );

  const range = useMemo<[number, number]>(
    () => [1, Math.min(Math.max(dpr, 1), 2)],
    [dpr],
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height, backgroundColor }}
      onPointerMove={cursorInteraction ? aimAt : undefined}
      onPointerEnter={cursorInteraction ? aimAt : undefined}
      onPointerLeave={cursorInteraction ? release : undefined}
      onPointerDown={cursorInteraction ? strike : undefined}
    >
      <Canvas
        className="absolute inset-0"
        dpr={range}
        frameloop={awake ? "always" : "demand"}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        orthographic
      >
        <TerminalField
          awake={awake}
          readPointer={readPointer}
          columns={columns}
          rows={rows}
          color={color}
          speed={speed}
          rowBias={rowBias}
          fillThreshold={fillThreshold}
          dashHead={dashHead}
          dashTail={dashTail}
          rowFloor={rowFloor}
          alternateRows={alternateRows}
          curvature={curvature}
          glow={glow}
          vignette={vignette}
          opacity={opacity}
          cursorInteraction={cursorInteraction}
          cursorRadius={cursorRadius}
          cursorIntensity={cursorIntensity}
          paused={paused}
        />
      </Canvas>
      {children ? (
        <div className="relative z-10 h-full w-full">{children}</div>
      ) : null}
    </div>
  );
};

export default SquaresTerminal;
