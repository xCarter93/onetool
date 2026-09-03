import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { progress } from "../../lib/anim";
import { CardHead, Note, SceneFrame } from "../Chrome";
import {
  Cast,
  flowAt,
  isoGrid,
  Leader,
  onAccentStyle,
  outlineStyle,
  Ring,
  Slab,
  stagePaint,
  type StagePaint,
} from "../iso-stage";
import {
  CARD,
  JobThemeProvider,
  paletteFor,
  useJobTheme,
  type JobSceneProps,
} from "../theme";

const THREAD = [
  { who: "Dana Whitfield", when: "Mon 8:02 AM", line: "Furnace in 412 Ashfield is cutting out — can you take a look this week?" },
  { who: "You", when: "Mon 8:31 AM", line: "Quote attached for the replacement — sign at the link and we'll book Wednesday." },
  { who: "Dana Whitfield", when: "Mon 6:47 PM", line: "Signed. Wednesday morning works, key is with the tenant." },
];

const PROMPT = "“Book the Northgate filter change Tuesday and plan the day's route.”";
const RESULT = "Visit scheduled Tue 8:00 · route rebuilt, 5 stops, 41 min driving";

/* ------------------------------------------------------------------ stage ---
 * Left, the inbox tray takes an envelope per message on the thread's own beat.
 * Right, the assistant rises as the ask types and rings when the work lands.
 */
export const STAGE_H = 200;

const TRAY = isoGrid(210, 130, 12);
const ASSIST = isoGrid(500, 130, 12);
const ASSIST_HT = 14;

const LEADER_D = (() => {
  const r = (n: number) => Math.round(n * 100) / 100;
  const [x1, y1] = TRAY.pt(3.4, -1.7, 0);
  const [x2, y2] = ASSIST.pt(-2.6, -1.7, ASSIST_HT);
  return `M${r(x1)} ${r(y1)} L${r(x2)} ${r(y2)}`;
})();

function EnvelopeMark({ P }: { P: StagePaint }) {
  return (
    <>
      <path d="M-1.4 -0.95H1.4V0.95H-1.4Z" style={{ fill: P.knock }} />
      <path
        d="M-1.4 -0.95H1.4V0.95H-1.4Z"
        style={outlineStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M-1.4 -0.95L0 0.2L1.4 -0.95"
        style={{ ...outlineStyle(P), stroke: P.accent }}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

export const ThreadStage: React.FC<{ frame: number; fps: number; P: StagePaint }> = ({
  frame,
  P,
}) => {
  const slabHt = ASSIST_HT * progress(frame, 116, 20);
  return (
    <svg viewBox={`0 0 700 ${STAGE_H}`} width={700} height={STAGE_H} style={{ display: "block" }}>
      <Cast g={TRAY} a={-4.4} b={-4.4} w={8.8} d={8.8} h={-14} P={P} />
      <Slab g={TRAY} a={-3.4} b={-3.4} w={6.8} d={6.8} h={-8} ht={8} P={P} />

      {THREAD.map((m, i) => {
        const e = progress(frame, 26 + i * 22, 18);
        return (
          <g key={m.when} style={{ opacity: e, translate: `0 ${(1 - e) * -30}px` }}>
            <Slab
              g={TRAY}
              a={-2.1 + i * 0.25}
              b={-2.1 + i * 0.25}
              w={4.2}
              d={4.2}
              h={i * 10}
              ht={7}
              P={P}
            />
            <g transform={TRAY.topMatrix(i * 0.25, i * 0.25, i * 10 + 7)}>
              <EnvelopeMark P={P} />
            </g>
          </g>
        );
      })}

      <g style={{ opacity: progress(frame, 116, 14) }}>
        <Leader d={LEADER_D} P={P} flow={flowAt(frame)} />
      </g>

      <Cast g={ASSIST} a={-4.6} b={-4.6} w={9.2} d={9.2} h={-14} P={P} />
      <Slab g={ASSIST} a={-3.6} b={-3.6} w={7.2} d={7.2} h={-8} ht={8} P={P} />
      <Ring g={ASSIST} hw={3.1} P={P} opacity={progress(frame, 196, 16)} />
      {/* Below half a pixel the slab reads as a stray line on the plinth. */}
      {slabHt > 0.5 ? (
        <Slab g={ASSIST} a={-2.6} b={-2.6} w={5.2} d={5.2} h={0} ht={slabHt} P={P} tone="accent" />
      ) : null}
      <g
        transform={ASSIST.topMatrix(0, 0, ASSIST_HT)}
        style={{ opacity: progress(frame, 196, 14) }}
      >
        <path d="M-1.6 -0.3H1.4" style={onAccentStyle(P)} vectorEffect="non-scaling-stroke" />
        <path d="M-1.6 0.5H0.6" style={onAccentStyle(P)} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
};

/**
 * Scene 03 — the thread arriving message by message, then the assistant: the
 * ask types itself out and the work it did resolves underneath.
 */
export const ThreadAssistant: React.FC<{ bare?: boolean }> = ({ bare }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = useJobTheme();

  // Typewriter: characters are a function of the frame, never of elapsed time.
  const promptChars = Math.floor(
    interpolate(frame, [116, 116 + 2.4 * fps], [0, PROMPT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typing = promptChars > 0 && promptChars < PROMPT.length;

  return (
    <SceneFrame bare={bare} eyebrow="Inbox & assistant" title="The thread stays on the record. The assistant does the typing.">
      <div style={{ height: STAGE_H, borderBottom: `1px solid ${T.rule}` }}>
        <ThreadStage frame={frame} fps={fps} P={stagePaint(T)} />
      </div>
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
          The thread, on the record
        </div>
        <div
          style={{
            fontSize: 24,
            color: T.ink3,
            opacity: interpolate(frame, [14, 30], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          Inbox · Whitfield
        </div>
      </CardHead>

      {THREAD.map((m, i) => (
        <div
          key={m.when}
          style={{
            padding: `24px ${CARD.pad}px`,
            borderBottom: `1px solid ${T.rule}`,
            opacity: interpolate(frame, [26 + i * 22, 44 + i * 22], [0, 1], {
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [26 + i * 22, 48 + i * 22], [14, 0], {
              extrapolateRight: "clamp",
            })}px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24 }}>
            <div style={{ fontSize: 27, fontWeight: 500, letterSpacing: "-0.01em" }}>{m.who}</div>
            <div style={{ fontSize: 21, color: T.ink3, fontVariantNumeric: "tabular-nums" }}>
              {m.when}
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 24, color: T.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.line}</div>
        </div>
      ))}

      {/* The assistant block: label, the ask typing itself, then the result. */}
      <div
        style={{
          padding: `30px ${CARD.pad}px 34px`,
          borderBottom: `1px solid ${T.rule}`,
          opacity: interpolate(frame, [104, 120], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: T.ink3,
          }}
        >
          Ask in plain English
        </div>

        <div
          style={{
            marginTop: 18,
            minHeight: 92,
            padding: "22px 26px",
            borderRadius: 16,
            border: `1px solid ${T.rule2}`,
            backgroundColor: T.paper,
            fontSize: 27,
            lineHeight: 1.4,
            borderColor: `color-mix(in oklch, ${T.accent} ${interpolate(
              frame,
              [116, 140, 200],
              [0, 60, 22],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )}%, ${T.rule2})`,
          }}
        >
          {PROMPT.slice(0, promptChars)}
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 30,
              marginLeft: 3,
              translate: "0 5px",
              backgroundColor: T.accent,
              opacity: typing ? (Math.floor(frame / 8) % 2 === 0 ? 1 : 0.15) : 0,
            }}
          />
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: T.ink2,
            opacity: interpolate(frame, [196, 214], [0, 1], { extrapolateRight: "clamp" }),
            translate: `${interpolate(frame, [196, 218], [-14, 0], { extrapolateRight: "clamp" })}px 0`,
          }}
        >
          <span style={{ color: T.accentInk, fontWeight: 700 }}>→</span>
          {RESULT}
        </div>
      </div>

      {bare ? null : (
        <Note style={{ opacity: interpolate(frame, [222, 242], [0, 1], { extrapolateRight: "clamp" }) }}>
          Email to and from a client stays beside their jobs, and the assistant turns a sentence into
          the task, the route or the report — showing its work as it goes.
        </Note>
      )}
    </SceneFrame>
  );
};

/** Card-slot cut: the composition IS the card interior, inked to the page's
 * scheme (the slot behind it paints --sheet). */
const ThreadAssistantCard: React.FC<JobSceneProps> = ({ theme = "light" }) => (
  <JobThemeProvider value={paletteFor(theme)}>
    <ThreadAssistant bare />
  </JobThemeProvider>
);
export default ThreadAssistantCard;
