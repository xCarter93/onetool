import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { progress } from "../../lib/anim";
import { fontFamily } from "../../lib/font";
import { CardHead, Note, Row, SceneFrame } from "../Chrome";
import {
  bob,
  Cast,
  isoGrid,
  Ring,
  Slab,
  stagePaint,
  type StagePaint,
} from "../iso-stage";
import {
  JobThemeProvider,
  paletteFor,
  useJobTheme,
  type JobPalette,
  type JobSceneProps,
} from "../theme";

/** Blocks per day, in the page's own proportions (Tuesday is the heavy day). */
const WEEK = [
  { day: "Mon", blocks: [80, 40], accent: false },
  { day: "Tue", blocks: [105, 34], accent: true },
  { day: "Wed", blocks: [59, 53], accent: false },
  { day: "Thu", blocks: [47], accent: false },
  { day: "Fri", blocks: [78, 28], accent: false },
];

const TASKS = [
  { name: "Northgate Plaza — quarterly filters", meta: "Recurring · Crew A", mark: "↻", tone: "ink3" },
  { name: "Whitfield — furnace install", meta: "Wed 9:00 · Crew B", mark: "", tone: "accent" },
  { name: "Call R. Alvarez back re: quote", meta: "Overdue 1 day", mark: "!", tone: "danger" },
];

/* ------------------------------------------------------------------ stage ---
 * The week as five stacks on one plinth: the first block of each day lands on
 * the deck, the second floats above it, and the heavy day gets a ring.
 */
export const STAGE_H = 340;

const G = isoGrid(350, 178, 10);
/** Cell centres along the plinth's a-axis, in WEEK order. */
/* 5.2 units apart: wider than a block's (w+d) screen span, so no day occludes the last. */
const DAY_A = [-10.4, -5.2, 0, 5.2, 10.4];
const BLOCK_HW = 1.1;
/** Page proportions → screen px of block height. */
const BLOCK_PX = 0.42;
const FLOAT_GAP = 10;

const ACCENT_I = WEEK.findIndex((d) => d.accent);
const [RING_X, RING_Y] = G.pt(DAY_A[ACCENT_I], 0, 0);
const RING_G = isoGrid(RING_X, RING_Y, 10);

export const WeekStage: React.FC<{
  frame: number;
  fps: number;
  P: StagePaint;
  T: JobPalette;
}> = ({ frame, fps, P, T }) => (
  <svg viewBox={`0 0 700 ${STAGE_H}`} width={700} height={STAGE_H} style={{ display: "block" }}>
    <Cast g={G} a={-14} b={-3} w={28} d={6} h={-14} P={P} />
    <Slab g={G} a={-13} b={-2.2} w={26} d={4.4} h={-8} ht={8} P={P} />
    <Ring
      g={RING_G}
      hw={1.7}
      P={P}
      color={P.accent}
      width={5}
      opacity={interpolate(frame, [56, 74, 96], [0, 1, 0.6], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })}
    />

    {WEEK.map((d, i) => {
      const ac = DAY_A[i];
      const landed = d.blocks[0] * BLOCK_PX;
      return (
        <g key={d.day}>
          {d.blocks.map((b, j) => {
            const ht = b * BLOCK_PX * progress(frame, 22 + i * 7 + j * 5, 0.6 * fps);
            if (ht <= 0.5) return null;
            // Floaters hover off the full landed height, so they don't ride the entrance.
            const h = j === 0 ? 0 : landed + FLOAT_GAP + bob(frame, fps, i * 0.2);
            return (
              <Slab
                key={j}
                g={G}
                a={ac - BLOCK_HW}
                b={-BLOCK_HW}
                w={BLOCK_HW * 2}
                d={BLOCK_HW * 2}
                h={h}
                ht={ht}
                P={P}
                tone={d.accent && j === 0 ? "accent" : "face"}
              />
            );
          })}
        </g>
      );
    })}

    {WEEK.map((d, i) => {
      const [x, y] = G.pt(DAY_A[i], 2.2, -8);
      return (
        <text
          key={d.day}
          x={x}
          y={y + 30}
          textAnchor="middle"
          style={{
            fontFamily,
            fontSize: 22,
            fontWeight: 500,
            fill: d.accent ? T.ink : T.ink3,
            opacity: interpolate(frame, [30 + i * 6, 46 + i * 6], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {d.day}
        </text>
      );
    })}
  </svg>
);

/**
 * Scene 02 — the week filling in: workload blocks grow off the baseline, the
 * heavy day lights up, then the day's tasks land underneath it.
 */
export const WeekPlan: React.FC<{ bare?: boolean }> = ({ bare }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = useJobTheme();

  return (
    <SceneFrame bare={bare} eyebrow="The week" title="The day plans itself.">
      <CardHead>
        <div
          style={{
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            opacity: interpolate(frame, [8, 24], [0, 1], { extrapolateRight: "clamp" }),
            translate: `0 ${interpolate(frame, [8, 26], [10, 0], { extrapolateRight: "clamp" })}px`,
          }}
        >
          This week
        </div>
        <div
          style={{
            fontSize: 24,
            color: T.ink3,
            fontVariantNumeric: "tabular-nums",
            opacity: interpolate(frame, [14, 30], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          2 crews ·{" "}
          {Math.round(
            interpolate(frame, [20, 20 + 1.1 * fps], [0, 11], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          )}{" "}
          visits
        </div>
      </CardHead>

      <div style={{ height: STAGE_H, borderBottom: `1px solid ${T.rule}` }}>
        <WeekStage frame={frame} fps={fps} P={stagePaint(T)} T={T} />
      </div>

      {TASKS.map((t, i) => {
        const tone = t.tone === "accent" ? T.accent : t.tone === "danger" ? T.danger : T.ink3;
        return (
          <Row
            key={t.name}
            style={{
              opacity: interpolate(frame, [76 + i * 13, 94 + i * 13], [0, 1], {
                extrapolateRight: "clamp",
              }),
              translate: `${interpolate(frame, [76 + i * 13, 98 + i * 13], [-18, 0], {
                extrapolateRight: "clamp",
              })}px 0`,
            }}
          >
            <div
              style={{
                flex: "none",
                width: 30,
                height: 30,
                borderRadius: 9,
                border: `2px solid ${tone}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                color: tone,
                rotate: t.mark === "↻" ? `${interpolate(frame, [96, 96 + 1.2 * fps], [0, 360], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}deg` : "0deg",
                scale:
                  t.tone === "danger"
                    ? `${interpolate(frame, [116, 128, 140], [1, 1.18, 1], { extrapolateRight: "clamp" })}`
                    : "1",
              }}
            >
              {t.mark}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 27, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
            <div style={{ fontSize: 22, color: T.ink3, whiteSpace: "nowrap" }}>{t.meta}</div>
          </Row>
        );
      })}

      {bare ? null : (
        <Note style={{ opacity: interpolate(frame, [126, 146], [0, 1], { extrapolateRight: "clamp" }) }}>
          Recurring work repeats itself — weekly mows, quarterly filter changes — and lands on the
          crew&apos;s phone with the address and notes already on it.
        </Note>
      )}
    </SceneFrame>
  );
};

/** Card-slot cut: the composition IS the card interior, inked to the page's
 * scheme (the slot behind it paints --sheet). */
const WeekPlanCard: React.FC<JobSceneProps> = ({ theme = "light" }) => (
  <JobThemeProvider value={paletteFor(theme)}>
    <WeekPlan bare />
  </JobThemeProvider>
);
export default WeekPlanCard;
