"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { LOGO_CHECK, LOGO_WRENCH } from "./logo-mark-data";

/* The OneTool mark as a spinnable 3D wireframe — the react-bits wireframe-ball
 * renderer (instanced glow strands + beads) with its platonic-solid lattice
 * replaced by an extrusion of the real logo paths. Departures from the vendored
 * component, all deliberate:
 *   - vanilla three, no @react-three/fiber — fiber v9's optional expo/react-native
 *     peers get satisfied from the workspace mobile app and leak RN's global JSX
 *     types into the web typecheck;
 *   - premultiplied over-blending instead of additive, so the strokes read as
 *     ink on the light paper theme and still bloom on dark;
 *   - per-strand brand color (aInk attribute) — like HalftoneMark, this is the
 *     one place the actual logo colors appear in artwork;
 *   - a bounded yaw sway instead of the full tumble, so the mark never reads
 *     mirrored; drag-to-spin stays, with a slow spring back to front.
 */

const MARK_RADIUS = 1.62;
const EXTRUDE_DEPTH = 0.34;
const RIB_EVERY = 7;
const OUTLINE_SAMPLES = 150;
/* Stroke rendering. The vendored ball's 1/x falloff + additive blending trade
 * peak alpha for accumulated glow; under premultiplied over-blending we need
 * ink-opaque strokes, so falloff is gaussian with the width (LINE_CORE, world
 * units — ≈1.5px at the hero's 560px slot) and peak alpha as independent knobs.
 * The quad half-width only needs to cover the gaussian's support. */
const LINE_CORE = 0.011;
const LINE_REACH = LINE_CORE * 3.5;
const STROKE_ALPHA = 0.92;
const BEAD_ALPHA = 0.85;
const BEAD_RADIUS = 0.028;
/* Far side recedes by fading, never by darkening — on paper a darker hue reads
 * as heavier ink, the opposite of depth. */
const RECEDE = 0.55;

const clamp = (value: number, low: number, high: number) =>
	Math.min(high, Math.max(low, value));

const strandVertex = `
attribute vec2 corner;
attribute vec3 aHead;
attribute vec3 aTail;
attribute vec3 aInk;

uniform mat3 uFrame;
uniform vec2 uProject;
uniform float uReach;

varying vec2 vPoint;
varying vec2 vHead;
varying vec2 vTail;
varying float vSlab;
varying vec3 vInk;

void main() {
  vec3 head = uFrame * aHead;
  vec3 tail = uFrame * aTail;

  vec2 a = head.xy;
  vec2 b = tail.xy;
  vec2 run = b - a;
  float span = length(run);
  vec2 along = span > 1e-6 ? run / span : vec2(1.0, 0.0);
  vec2 side = vec2(-along.y, along.x);

  float u = corner.x;
  float v = corner.y * 2.0 - 1.0;
  vec2 seat = a + along * (u * span + (u * 2.0 - 1.0) * uReach) + side * v * uReach;

  vPoint = seat;
  vHead = a;
  vTail = b;
  vSlab = (head.z + tail.z) * 0.5;
  vInk = aInk;

  gl_Position = vec4(seat * uProject, 0.0, 1.0);
}
`;

const strandFragment = `
precision highp float;

uniform float uPeak;
uniform float uCore;
uniform float uRecede;
uniform float uShell;

varying vec2 vPoint;
varying vec2 vHead;
varying vec2 vTail;
varying float vSlab;
varying vec3 vInk;

void main() {
  vec2 rel = vPoint - vHead;
  vec2 run = vTail - vHead;
  float t = clamp(dot(rel, run) / max(dot(run, run), 1e-8), 0.0, 1.0);
  float gap = length(rel - run * t);

  float lift = uPeak * exp(-(gap * gap) / (uCore * uCore));

  float depth = clamp(vSlab / uShell * 0.5 + 0.5, 0.0, 1.0);
  lift *= mix(1.0, depth, uRecede);

  float a = min(lift, 1.0);
  gl_FragColor = vec4(vInk * a, a);
}
`;

const nodeVertex = `
attribute vec2 corner;
attribute vec3 aSeat;
attribute vec3 aInk;

uniform mat3 uFrame;
uniform vec2 uProject;
uniform float uReach;

varying vec2 vOffset;
varying float vSlab;
varying vec3 vInk;

void main() {
  vec3 seat = uFrame * aSeat;
  vec2 pull = (corner * 2.0 - 1.0) * uReach;

  vOffset = pull;
  vSlab = seat.z;
  vInk = aInk;

  gl_Position = vec4((seat.xy + pull) * uProject, 0.0, 1.0);
}
`;

const nodeFragment = `
precision highp float;

uniform float uGrain;
uniform float uPeak;
uniform float uRecede;
uniform float uShell;

varying vec2 vOffset;
varying float vSlab;
varying vec3 vInk;

void main() {
  float bead = smoothstep(uGrain, 0.0, length(vOffset));
  if (bead <= 0.0) discard;

  float depth = clamp(vSlab / uShell * 0.5 + 0.5, 0.0, 1.0);
  float lift = bead * uPeak * mix(1.0, depth, uRecede);

  float a = min(lift, 1.0);
  gl_FragColor = vec4(vInk * a, a);
}
`;

/** Sample both logo paths, center/scale them into a MARK_RADIUS world, and
 * extrude: a front and back outline ring at ±EXTRUDE_DEPTH plus connecting ribs
 * (with a bead at each rib joint). */
const buildLogoLattice = () => {
	const loader = new SVGLoader();
	const paths = [LOGO_WRENCH, LOGO_CHECK].map((p) => ({
		ink: new THREE.Color(p.fill),
		shape: loader.parse(
			`<svg xmlns="http://www.w3.org/2000/svg"><path d="${p.d}"/></svg>`
		).paths[0],
	}));

	const rings = paths.flatMap(({ ink, shape }) =>
		shape.subPaths.map((sub) => ({
			ink,
			pts: sub.getSpacedPoints(OUTLINE_SAMPLES).slice(0, OUTLINE_SAMPLES),
		}))
	);

	// The paths are authored in a 296×296 box; center on it and flip SVG's y-down.
	const box = new THREE.Box2();
	rings.forEach((r) => r.pts.forEach((p) => box.expandByPoint(p)));
	const mid = box.getCenter(new THREE.Vector2());
	const half = box.getSize(new THREE.Vector2()).multiplyScalar(0.5);
	const gain = MARK_RADIUS / Math.hypot(half.x, half.y);

	const heads: number[] = [];
	const tails: number[] = [];
	const headInk: number[] = [];
	const seats: number[] = [];
	const seatInk: number[] = [];

	rings.forEach(({ ink, pts }) => {
		const front = pts.map((p) => [(p.x - mid.x) * gain, -(p.y - mid.y) * gain]);
		const n = front.length;
		const edge = (a: number[], az: number, b: number[], bz: number) => {
			heads.push(a[0], a[1], az);
			tails.push(b[0], b[1], bz);
			headInk.push(ink.r, ink.g, ink.b);
		};
		for (let i = 0; i < n; i++) {
			const a = front[i];
			const b = front[(i + 1) % n];
			edge(a, EXTRUDE_DEPTH, b, EXTRUDE_DEPTH);
			edge(a, -EXTRUDE_DEPTH, b, -EXTRUDE_DEPTH);
			if (i % RIB_EVERY === 0) {
				edge(a, EXTRUDE_DEPTH, a, -EXTRUDE_DEPTH);
				seats.push(a[0], a[1], EXTRUDE_DEPTH, a[0], a[1], -EXTRUDE_DEPTH);
				seatInk.push(ink.r, ink.g, ink.b, ink.r, ink.g, ink.b);
			}
		}
	});

	return {
		head: new Float32Array(heads),
		headInk: new Float32Array(headInk),
		tail: new Float32Array(tails),
		edgeCount: heads.length / 3,
		seats: new Float32Array(seats),
		seatInk: new Float32Array(seatInk),
		nodeCount: seats.length / 3,
	};
};

const quadCorners = () => {
	const geo = new THREE.InstancedBufferGeometry();
	geo.setAttribute(
		"corner",
		new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
	);
	geo.setIndex([0, 1, 2, 0, 2, 3]);
	geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
	return geo;
};

interface DriftState {
	yaw: number;
	pitch: number;
	yawRate: number;
	pitchRate: number;
	tiltX: number;
	tiltY: number;
	aimX: number;
	aimY: number;
	dragging: boolean;
}

const materialShared = {
	transparent: true,
	depthTest: false,
	depthWrite: false,
	blending: THREE.CustomBlending,
	blendSrc: THREE.OneFactor,
	blendDst: THREE.OneMinusSrcAlphaFactor,
	blendSrcAlpha: THREE.OneFactor,
	blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

export default function WireframeMarkCanvas({
	zoom = 1.5,
	speed = 1,
	className,
}: {
	zoom?: number;
	speed?: number;
	className?: string;
}) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const still = useRef(false);
	const grip = useRef({ active: false, x: 0, y: 0, id: -1 });
	const drift = useRef<DriftState>({
		yaw: 0,
		pitch: 0,
		yawRate: 0,
		pitchRate: 0,
		tiltX: 0,
		tiltY: 0,
		aimX: 0,
		aimY: 0,
		dragging: false,
	});

	useEffect(() => {
		const probe = window.matchMedia("(prefers-reduced-motion: reduce)");
		still.current = probe.matches;
		const sync = () => {
			still.current = probe.matches;
		};
		probe.addEventListener("change", sync);
		return () => probe.removeEventListener("change", sync);
	}, []);

	useEffect(() => {
		const node = rootRef.current;
		if (!node) return;

		let renderer: THREE.WebGLRenderer | null = null;
		let raf = 0;
		let last = 0;
		let clock = 0;

		const lattice = buildLogoLattice();

		const strandGeo = quadCorners();
		strandGeo.setAttribute("aHead", new THREE.InstancedBufferAttribute(lattice.head, 3));
		strandGeo.setAttribute("aTail", new THREE.InstancedBufferAttribute(lattice.tail, 3));
		strandGeo.setAttribute("aInk", new THREE.InstancedBufferAttribute(lattice.headInk, 3));
		strandGeo.instanceCount = lattice.edgeCount;

		const nodeGeo = quadCorners();
		nodeGeo.setAttribute("aSeat", new THREE.InstancedBufferAttribute(lattice.seats, 3));
		nodeGeo.setAttribute("aInk", new THREE.InstancedBufferAttribute(lattice.seatInk, 3));
		nodeGeo.instanceCount = lattice.nodeCount;

		const strandMat = new THREE.ShaderMaterial({
			vertexShader: strandVertex,
			fragmentShader: strandFragment,
			uniforms: {
				uFrame: { value: new THREE.Matrix3() },
				uProject: { value: new THREE.Vector2(1, 1) },
				uReach: { value: LINE_REACH },
				uPeak: { value: STROKE_ALPHA },
				uCore: { value: LINE_CORE },
				uRecede: { value: RECEDE },
				uShell: { value: MARK_RADIUS },
			},
			...materialShared,
		});
		const nodeMat = new THREE.ShaderMaterial({
			vertexShader: nodeVertex,
			fragmentShader: nodeFragment,
			uniforms: {
				uFrame: { value: new THREE.Matrix3() },
				uProject: { value: new THREE.Vector2(1, 1) },
				uReach: { value: BEAD_RADIUS },
				uGrain: { value: BEAD_RADIUS },
				uPeak: { value: BEAD_ALPHA },
				uRecede: { value: RECEDE },
				uShell: { value: MARK_RADIUS },
			},
			...materialShared,
		});

		const scene = new THREE.Scene();
		const strandMesh = new THREE.Mesh(strandGeo, strandMat);
		const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
		strandMesh.frustumCulled = false;
		nodeMesh.frustumCulled = false;
		nodeMesh.renderOrder = 1;
		scene.add(strandMesh, nodeMesh);
		// Shaders emit clip-space coordinates directly; the camera is a pass-through.
		const camera = new THREE.Camera();

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			if (!renderer) return;

			const step = Math.min((now - last) / 1000 || 0, 0.05);
			last = now;
			const frozen = still.current;
			if (!frozen) clock += step * speed;
			const t = clock;

			const d = drift.current;
			if (!d.dragging) {
				d.yaw += d.yawRate * step * 60;
				d.pitch += d.pitchRate * step * 60;
				const decay = Math.pow(0.94, step * 60);
				d.yawRate *= decay;
				d.pitchRate *= decay;
				// Spring back to the front-facing pose once momentum has died down.
				const home = 1 - Math.pow(0.45, step);
				if (Math.abs(d.yawRate) < 0.002) d.yaw -= d.yaw * home;
				if (Math.abs(d.pitchRate) < 0.002) d.pitch -= d.pitch * home;
			}
			const ease = 1 - Math.pow(0.001, step);
			d.tiltX += ((frozen ? 0 : d.aimX) - d.tiltX) * ease;
			d.tiltY += ((frozen ? 0 : d.aimY) - d.tiltY) * ease;

			// Bounded sway keeps the mark readable — it never turns its back.
			const yaw = Math.sin(t * 0.4) * 0.42 + d.yaw + d.tiltX;
			const pitch = Math.sin(t * 0.23) * 0.1 + d.pitch + d.tiltY;
			const sy = Math.sin(yaw);
			const cy = Math.cos(yaw);
			const sp = Math.sin(pitch);
			const cp = Math.cos(pitch);

			// Yaw-then-pitch rotation, column-major basis vectors.
			const frameMat = strandMat.uniforms.uFrame.value as THREE.Matrix3;
			frameMat.set(cy, 0, sy, sy * sp, cp, -cy * sp, -sy * cp, sp, cy * cp);
			(nodeMat.uniforms.uFrame.value as THREE.Matrix3).copy(frameMat);

			const box = node.getBoundingClientRect();
			const w = Math.max(box.width, 1);
			const h = Math.max(box.height, 1);
			const span = 6 / Math.max(zoom, 0.05);
			const floor = Math.min(w, h);
			(strandMat.uniforms.uProject.value as THREE.Vector2).set(
				(2 * floor) / (w * span),
				(2 * floor) / (h * span)
			);
			(nodeMat.uniforms.uProject.value as THREE.Vector2).copy(
				strandMat.uniforms.uProject.value as THREE.Vector2
			);

			renderer.render(scene, camera);
		};

		const start = () => {
			if (renderer) return;
			const canvas = document.createElement("canvas");
			canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
			node.appendChild(canvas);
			renderer = new THREE.WebGLRenderer({
				canvas,
				alpha: true,
				antialias: false,
				premultipliedAlpha: true,
				powerPreference: "high-performance",
			});
			renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1, 2));
			const size = () => {
				const box = node.getBoundingClientRect();
				renderer?.setSize(Math.max(box.width, 1), Math.max(box.height, 1), false);
			};
			size();
			resize.observe(node);
			last = performance.now();
			raf = requestAnimationFrame(frame);
		};

		const stop = () => {
			cancelAnimationFrame(raf);
			resize.disconnect();
			if (renderer) {
				const canvas = renderer.domElement;
				renderer.dispose();
				canvas.remove();
				renderer = null;
			}
		};

		const resize = new ResizeObserver(() => {
			const box = node.getBoundingClientRect();
			renderer?.setSize(Math.max(box.width, 1), Math.max(box.height, 1), false);
		});

		const watch = new IntersectionObserver(
			([entry]) => (entry.isIntersecting ? start() : stop()),
			{ rootMargin: "200px" }
		);
		watch.observe(node);

		return () => {
			watch.disconnect();
			stop();
			strandGeo.dispose();
			nodeGeo.dispose();
			strandMat.dispose();
			nodeMat.dispose();
		};
	}, [zoom, speed]);

	const aimAt = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const node = rootRef.current;
		if (!node) return;
		const box = node.getBoundingClientRect();
		const d = drift.current;

		if (grip.current.active) {
			const dx = event.clientX - grip.current.x;
			const dy = event.clientY - grip.current.y;
			grip.current.x = event.clientX;
			grip.current.y = event.clientY;
			const yawStep = (dx / Math.max(box.width, 1)) * Math.PI * 2;
			const pitchStep = (dy / Math.max(box.height, 1)) * Math.PI * 2;
			d.yaw += yawStep;
			d.pitch += pitchStep;
			d.yawRate = yawStep * 0.5;
			d.pitchRate = pitchStep * 0.5;
			return;
		}

		d.aimX = ((event.clientX - box.left) / Math.max(box.width, 1) - 0.5) * 0.3;
		d.aimY = ((event.clientY - box.top) / Math.max(box.height, 1) - 0.5) * 0.3;
	}, []);

	const release = useCallback(() => {
		drift.current.aimX = 0;
		drift.current.aimY = 0;
	}, []);

	const seize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		grip.current = {
			active: true,
			x: event.clientX,
			y: event.clientY,
			id: event.pointerId,
		};
		drift.current.dragging = true;
		drift.current.yawRate = 0;
		drift.current.pitchRate = 0;
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}, []);

	const loosen = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!grip.current.active) return;
		grip.current.active = false;
		drift.current.dragging = false;
		event.currentTarget.releasePointerCapture?.(grip.current.id);
	}, []);

	return (
		<div
			ref={rootRef}
			aria-hidden="true"
			className={className}
			style={{ position: "relative", touchAction: "pan-y" }}
			onPointerMove={aimAt}
			onPointerLeave={release}
			onPointerDown={seize}
			onPointerUp={loosen}
			onPointerCancel={loosen}
		/>
	);
}
