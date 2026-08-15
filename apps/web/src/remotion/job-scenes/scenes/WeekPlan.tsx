import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CardHead, Note, Row, SceneFrame } from "../Chrome";
import {
  CARD,
  JobThemeProvider,
  paletteFor,
  useJobTheme,
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

      {/* Workload blocks: each grows off the baseline, Tuesday last and tallest. */}
      <div
        style={{
          padding: `44px ${CARD.pad}px 26px`,
          borderBottom: `1px solid ${T.rule}`,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 26,
          alignItems: "end",
        }}
      >
        {WEEK.map((d, i) => (
          <div
            key={d.day}
            style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12, height: 240 }}
          >
            {d.blocks.map((h, j) => (
              <div
                key={j}
                style={{
                  height: h,
                  borderRadius: 10,
                  backgroundColor: d.accent && j === 0 ? T.accent : j === 0 ? T.accentWash : T.block,
                  transformOrigin: "bottom center",
                  scale: `1 ${interpolate(
                    frame,
                    [22 + i * 7 + j * 5, 22 + i * 7 + j * 5 + 0.6 * fps],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  )}`,
                  boxShadow:
                    d.accent && j === 0
                      ? `0 0 ${interpolate(frame, [56, 74, 96], [0, 46, 24], { extrapolateRight: "clamp" })}px color-mix(in oklch, ${T.accent} 55%, transparent)`
                      : "none",
                }}
              />
            ))}
            <div
              style={{
                marginTop: 6,
                textAlign: "center",
                fontSize: 22,
                fontWeight: 500,
                color: d.accent ? T.ink : T.ink3,
                opacity: interpolate(frame, [30 + i * 6, 46 + i * 6], [0, 1], {
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {d.day}
            </div>
          </div>
        ))}
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
          crew's phone with the address and notes already on it.
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
