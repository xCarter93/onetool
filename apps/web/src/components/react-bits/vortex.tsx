"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface VortexProps {
  /** Additional CSS classes */
  className?: string;
  /** Number of elliptical rings forming the tunnel */
  discCount?: number;
  /** Total number of orbital particles */
  particleCount?: number;
  /** Base color for particles (hex format) */
  particleColor?: string;
  /** Color of the ring strokes (hex or rgba) */
  discColor?: string;
  /** Stroke width of tunnel rings */
  discLineWidth?: number;
  /** Particle radius in pixels */
  particleSize?: number;
  /** Tunnel extension factor (0.5-2) */
  depth?: number;
  /** Horizontal scale of the tunnel opening */
  spread?: number;
  /** Animation velocity multiplier */
  speed?: number;
  /** Rotation direction: 1 for clockwise, -1 for counter-clockwise */
  rotationDirection?: number;
  /** Horizontal focal point (0-1) */
  centerX?: number;
  /** Vertical focal point (0-1) */
  centerY?: number;
  /** Scale threshold where rings begin appearing */
  fadeInThreshold?: number;
  /** Scale threshold where rings begin fading */
  fadeOutThreshold?: number;
  /** Master opacity multiplier */
  opacity?: number;
  /** Enable mouse-based depth interaction */
  enableCursorInteraction?: boolean;
  /** Mouse influence strength on tunnel depth */
  cursorInfluence?: number;
}

export const Vortex: React.FC<VortexProps> = ({
  className,
  discCount = 50,
  particleCount = 10000,
  particleColor = "#000000",
  discColor = "rgba(200, 200, 200, 0.15)",
  discLineWidth = 1,
  particleSize = 0.5,
  depth = 1.7,
  spread = 1,
  speed = 0.05,
  rotationDirection = 1,
  centerX = 0.5,
  centerY = 0,
  fadeInThreshold = 0.021,
  fadeOutThreshold = 0.4,
  opacity = 1,
  enableCursorInteraction = true,
  cursorInfluence = 0.1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId = 0;
    let active = true;
    let lastTimestamp = performance.now();

    let viewW = 0;
    let viewH = 0;
    let focalX = 0;
    let focalY = 0;

    let mouseX = 0;
    let mouseY = 0;
    let smoothX = 0;
    let smoothY = 0;
    let depthMod = 1;

    interface Ring {
      t: number;
      px: number;
      py: number;
      rx: number;
      ry: number;
      sx: number;
      sy: number;
      vis: number;
    }

    interface Dot {
      ringIdx: number;
      orbit: number;
      hue: string;
      alpha: number;
    }

    const rings: Ring[] = [];
    const dots: Dot[] = [];

    const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeOutExp = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const easeInExp = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
    const mix = (a: number, b: number, t: number, fn?: (v: number) => number) =>
      a + (b - a) * (fn ? fn(t) : t);

    const parseHex = (hex: string): [number, number, number] => {
      const raw = hex.replace("#", "");
      // Expand shorthand first — "fff" sliced as 6-digit yields rgb(255,15,0).
      const c =
        raw.length === 3
          ? raw
              .split("")
              .map((ch) => ch + ch)
              .join("")
          : raw;
      return [
        parseInt(c.slice(0, 2), 16) || 0,
        parseInt(c.slice(2, 4), 16) || 0,
        parseInt(c.slice(4, 6), 16) || 0,
      ];
    };

    const updateRing = (ring: Ring) => {
      const t = ring.t;
      const sx = mix(1, 0, t, easeOut3);
      const sy = mix(1, 0, t, easeOutExp);

      ring.sx = sx;
      ring.sy = sy;
      ring.rx = viewW * 0.5 * sx * spread;
      ring.ry = viewH * 0.5 * sy * spread;
      ring.px = focalX;
      ring.py = focalY + t * viewH * depth * depthMod;

      const scale = sx * sy;
      let v = 1;
      if (scale < fadeInThreshold) {
        v = Math.pow(scale / fadeInThreshold, 3);
      } else if (scale > fadeOutThreshold) {
        v = 1 - (scale - fadeOutThreshold) / (1 - fadeOutThreshold);
      }
      ring.vis = Math.max(0, Math.min(1, v));
    };

    const initRings = () => {
      rings.length = 0;
      for (let i = 0; i < discCount; i++) {
        const ring: Ring = {
          t: i / discCount,
          px: 0,
          py: 0,
          rx: 0,
          ry: 0,
          sx: 0,
          sy: 0,
          vis: 0,
        };
        updateRing(ring);
        rings.push(ring);
      }
    };

    const initDots = () => {
      dots.length = 0;
      const [br, bg, bb] = parseHex(particleColor);

      for (let i = 0; i < particleCount; i++) {
        const r = Math.max(0, Math.min(255, br + (Math.random() - 0.5) * 50));
        const g = Math.max(0, Math.min(255, bg + (Math.random() - 0.5) * 50));
        const b = Math.max(0, Math.min(255, bb + (Math.random() - 0.5) * 50));

        dots.push({
          ringIdx: Math.floor(Math.random() * discCount),
          orbit: Math.random(),
          hue: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`,
          alpha: Math.random(),
        });
      }
    };

    const configureCanvas = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio);

      viewW = rect.width;
      viewH = rect.height;
      focalX = viewW * centerX;
      focalY = viewH * centerY;

      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const setup = () => {
      configureCanvas();
      initRings();
      initDots();
    };

    const processMouse = () => {
      if (!enableCursorInteraction) {
        depthMod = 1;
        return;
      }

      smoothX += (mouseX - smoothX) * 0.08;
      smoothY += (mouseY - smoothY) * 0.08;

      const dx = smoothX - viewW * centerX;
      const dy = smoothY - viewH * centerY;
      const maxD = Math.hypot(viewW * 0.5, viewH * 0.5);
      const d = Math.min(Math.hypot(dx, dy) / maxD, 1);

      depthMod = 1 + (1 - d) * cursorInfluence * 2 - cursorInfluence;
    };

    const stepRings = (dt: number) => {
      const delta = 0.0003 * speed * rotationDirection * dt * 60;
      for (const ring of rings) {
        ring.t = (ring.t + delta) % 1;
        if (ring.t < 0) ring.t += 1;
        updateRing(ring);
      }
    };

    const stepDots = (dt: number) => {
      const baseV = 0.001 * speed * rotationDirection * dt * 60;
      for (const dot of dots) {
        const ring = rings[dot.ringIdx];
        if (!ring) continue;
        const scale = ring.sx * ring.sy;
        const vel = mix(0, baseV, 1 - scale, easeInExp);
        dot.orbit = (dot.orbit + vel) % 1;
      }
    };

    const drawRings = () => {
      ctx.strokeStyle = discColor;
      ctx.lineWidth = discLineWidth;

      for (const ring of rings) {
        if (ring.vis <= 0) continue;
        ctx.globalAlpha = ring.vis * opacity;
        ctx.beginPath();
        ctx.ellipse(
          ring.px,
          ring.py + ring.ry,
          ring.rx,
          ring.ry,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    };

    const drawDots = () => {
      ctx.shadowBlur = 0;

      for (const dot of dots) {
        const ring = rings[dot.ringIdx];
        if (!ring || ring.vis <= 0) continue;

        const angle = Math.PI * 2 * dot.orbit;
        const x = ring.px + Math.cos(angle) * ring.rx;
        const y = ring.py + Math.sin(angle) * ring.ry + ring.ry;
        const scale = ring.sx * ring.sy;
        const radius = particleSize + scale * 0.5;

        ctx.fillStyle = dot.hue;
        ctx.globalAlpha = ring.vis * dot.alpha * opacity;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      if (!active) return;

      const dt = (now - lastTimestamp) / (1000 / 60);
      lastTimestamp = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      processMouse();
      stepRings(dt);
      stepDots(dt);
      drawRings();
      drawDots();

      frameId = requestAnimationFrame(tick);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!enableCursorInteraction) return;
      const rect = wrapper.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const onMouseLeave = () => {
      if (!enableCursorInteraction) return;
      mouseX = viewW * centerX;
      mouseY = viewH * centerY;
    };

    const resizeObs = new ResizeObserver(() => setup());
    resizeObs.observe(wrapper);

    if (enableCursorInteraction) {
      wrapper.addEventListener("mousemove", onMouseMove);
      wrapper.addEventListener("mouseleave", onMouseLeave);
    }

    setup();
    frameId = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      resizeObs.disconnect();
      wrapper.removeEventListener("mousemove", onMouseMove);
      wrapper.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [
    discCount,
    particleCount,
    particleColor,
    discColor,
    discLineWidth,
    particleSize,
    depth,
    spread,
    speed,
    rotationDirection,
    centerX,
    centerY,
    fadeInThreshold,
    fadeOutThreshold,
    opacity,
    enableCursorInteraction,
    cursorInfluence,
  ]);

  return (
    <div ref={wrapperRef} className={cn("absolute inset-0", className)}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};

export default Vortex;
