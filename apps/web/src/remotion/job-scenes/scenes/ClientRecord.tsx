import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { progress } from "../../lib/anim";
import { CardHead, Note, Row, SceneFrame } from "../Chrome";
import {
  bob,
  Cast,
  flowAt,
  hairStyle,
  isoGrid,
  Leader,
  onAccentStyle,
  outlineStyle,
  Plate,
  plateDrop,
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

const STATS = [
  { label: "Properties", value: 4 },
  { label: "Contacts", value: 3 },
  { label: "Jobs to date", value: 27 },
];

const PROPERTIES = [
  { tag: "01", addr: "412 Ashfield Court", note: "Rooftop unit · 2 zones", next: "Wed 9:00" },
  { tag: "02", addr: "88 Kerr Road, Unit B", note: "Annual service due", next: "Nov 4" },
  { tag: "03", addr: "1 Northgate Plaza", note: "Filter change, quarterly", next: "Recurring" },
];


/* ------------------------------------------------------------------ stage ---
 * Three things the client owns float over the one record: the property, the
 * contact, the signed quote. Same construction as the landing's Old Way stack.
 */
export const STAGE_H = 200;

const PLATE = { unit: 10, hw: 2.2, ht: 8 };
const REC = isoGrid(490, 128, 12);
const PLINTH_HW = 4.2;
const PLINTH_HT = 8;
const REC_HW = 2.7;
const REC_HT = 14;

function HouseMark({ P }: { P: StagePaint }) {
  return (
    <>
      <path d="M-1 -0.3H1V1.1H-1Z" style={{ fill: P.knock }} />
      <path d="M-0.3 0.4H0.3V1.1H-0.3Z" style={{ fill: P.accent }} />
      <path
        d="M-1 -0.3H1V1.1H-1ZM-1.35 -0.3L0 -1.35L1.35 -0.3"
        style={outlineStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function ContactMark({ P }: { P: StagePaint }) {
  return (
    <>
      <path d="M-1.4 -0.9H1.4V0.9H-1.4Z" style={{ fill: P.knock }} />
      <circle cx={-0.75} cy={0} r={0.4} style={{ fill: P.surface }} />
      <path
        d="M-1.4 -0.9H1.4V0.9H-1.4Z"
        style={outlineStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={-0.75}
        cy={0}
        r={0.4}
        style={outlineStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M-0.05 -0.25H1M-0.05 0.25H0.6"
        style={hairStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function QuoteMark({ P }: { P: StagePaint }) {
  return (
    <>
      <path d="M-1 -1.25H1V1.25H-1Z" style={{ fill: P.knock }} />
      <path
        d="M-1 -1.25H1V1.25H-1Z"
        style={outlineStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M-0.6 -0.7H0.6M-0.6 -0.25H0.6M-0.6 0.2H0.1"
        style={hairStyle(P)}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={0.5} cy={0.75} r={0.34} style={{ fill: P.paid }} />
      <path
        d="M0.32 0.75L0.45 0.9L0.7 0.6"
        style={{ ...onAccentStyle(P), strokeWidth: 2.5 }}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

/* Back-to-front; landings run left-to-right along the record's back rim. */
const PROPS = [
  { id: "contact", x: 250, y: 38, la: -1.3, lb: -2.3, at: 10, phase: 0.15, Mark: ContactMark },
  { id: "house", x: 120, y: 66, la: -2.3, lb: -1.1, at: 18, phase: 0.55, Mark: HouseMark },
  { id: "quote", x: 340, y: 96, la: 0.7, lb: -2.3, at: 26, phase: 0.85, Mark: QuoteMark },
] as const;

const LEADERS = PROPS.map(({ id, x, y, la, lb }) => {
  const [lx, ly] = REC.pt(la, lb, REC_HT);
  const top = y + plateDrop(PLATE.hw, PLATE.unit, PLATE.ht) - 10;
  return { id, d: `M${x} ${top}L${lx} ${ly}` };
});

export const RecordStage: React.FC<{ frame: number; fps: number; P: StagePaint }> = ({
  frame,
  fps,
  P,
}) => {
  const leaders = progress(frame, 34, 14);
  return (
    <svg viewBox={`0 0 700 ${STAGE_H}`} width={700} height={STAGE_H} style={{ display: "block" }}>
      <Cast g={REC} a={-4.9} b={-4.9} w={9.8} d={9.8} h={-(PLINTH_HT + 5)} P={P} />
      <Slab
        g={REC}
        a={-PLINTH_HW}
        b={-PLINTH_HW}
        w={PLINTH_HW * 2}
        d={PLINTH_HW * 2}
        h={-PLINTH_HT}
        ht={PLINTH_HT}
        P={P}
      />
      <Ring g={REC} hw={3.5} P={P} opacity={progress(frame, 40, 16)} />
      <Slab g={REC} a={-REC_HW} b={-REC_HW} w={REC_HW * 2} d={REC_HW * 2} ht={REC_HT} P={P} tone="accent" />
      <g transform={REC.topMatrix(0, 0, REC_HT)}>
        <circle cx={-1.6} cy={-0.2} r={0.32} style={{ fill: P.knock }} />
        <path d="M-1 -0.2H1.3" style={onAccentStyle(P)} vectorEffect="non-scaling-stroke" />
        <path d="M-1.8 0.6H1.8" style={{ ...onAccentStyle(P), opacity: 0.4 }} vectorEffect="non-scaling-stroke" />
        <path d="M-1.6 1.2H1.1M-1.6 1.8H1.7" style={{ ...onAccentStyle(P), opacity: 0.75 }} vectorEffect="non-scaling-stroke" />
      </g>

      <g style={{ opacity: leaders }}>
        {LEADERS.map(({ id, d }) => (
          <Leader key={id} d={d} P={P} flow={flowAt(frame)} />
        ))}
        <g transform={REC.topMatrix(0, 0, REC_HT)}>
          {PROPS.map(({ id, la, lb }) => (
            <circle key={id} cx={la} cy={lb} r={0.22} style={{ fill: P.knock }} />
          ))}
        </g>
      </g>

      {PROPS.map(({ id, x, y, at, phase, Mark }) => {
        const enter = progress(frame, at, 16);
        return (
          <Plate
            key={id}
            x={x}
            y={y}
            unit={PLATE.unit}
            hw={PLATE.hw}
            ht={PLATE.ht}
            P={P}
            opacity={enter}
            lift={(1 - enter) * 18 + bob(frame, fps, phase)}
          >
            <Mark P={P} />
          </Plate>
        );
      })}
    </svg>
  );
};

/**
 * Scene 01 — the client record assembling itself: header, then the three counts
 * ticking up, then each property stamping onto the record.
 */
export const ClientRecord: React.FC<{ bare?: boolean }> = ({ bare }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = useJobTheme();

  return (
    <SceneFrame bare={bare} eyebrow="One record" title="Everything the job touches, in one record.">
      <div style={{ height: STAGE_H, borderBottom: `1px solid ${T.rule}` }}>
        <RecordStage frame={frame} fps={fps} P={stagePaint(T)} />
      </div>
      <CardHead>
        <div
          style={{
            opacity: interpolate(frame, [8, 24], [0, 1], { extrapolateRight: "clamp" }),
            translate: `0 ${interpolate(frame, [8, 26], [10, 0], { extrapolateRight: "clamp" })}px`,
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Whitfield Property Group
          </div>
          <div style={{ marginTop: 8, fontSize: 24, color: T.ink3 }}>
            Client · Active since Mar 2024
          </div>
        </div>
        <div
          style={{
            flex: "none",
            padding: "10px 20px",
            borderRadius: 999,
            backgroundColor: T.paidWash,
            color: T.paid,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: interpolate(frame, [18, 30], [0, 1], { extrapolateRight: "clamp" }),
            scale: `${interpolate(frame, [18, 30, 36], [0.8, 1.06, 1], { extrapolateRight: "clamp" })}`,
          }}
        >
          Active
        </div>
      </CardHead>

      {/* Counts — each number ticks from zero as its cell arrives. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          backgroundColor: T.rule,
          borderBottom: `1px solid ${T.rule}`,
        }}
      >
        {STATS.map((s, i) => (
          <div
            key={s.label}
            style={{
              backgroundColor: T.sheet,
              padding: `28px ${CARD.pad}px 30px`,
              opacity: interpolate(frame, [24 + i * 6, 40 + i * 6], [0, 1], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ fontSize: 22, color: T.ink3 }}>{s.label}</div>
            <div
              style={{
                marginTop: 10,
                fontSize: 60,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(
                interpolate(frame, [28 + i * 6, 28 + i * 6 + 0.9 * fps], [0, s.value], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              )}
            </div>
          </div>
        ))}
      </div>

      {PROPERTIES.map((p, i) => (
        <Row
          key={p.tag}
          style={{
            justifyContent: "space-between",
            opacity: interpolate(frame, [56 + i * 12, 74 + i * 12], [0, 1], {
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [56 + i * 12, 78 + i * 12], [16, 0], {
              extrapolateRight: "clamp",
            })}px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 22, minWidth: 0 }}>
            <div
              style={{
                flex: "none",
                width: 46,
                height: 46,
                borderRadius: 12,
                border: `1px solid ${T.rule2}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 19,
                color: T.ink3,
              }}
            >
              {p.tag}
            </div>
            <div>
              <div style={{ fontSize: 27, fontWeight: 500, letterSpacing: "-0.01em" }}>{p.addr}</div>
              <div style={{ marginTop: 4, fontSize: 22, color: T.ink3 }}>{p.note}</div>
            </div>
          </div>
          <div style={{ fontSize: 22, color: T.ink3, fontVariantNumeric: "tabular-nums" }}>
            {p.next}
          </div>
        </Row>
      ))}

      {/* In bare mode the page keeps this line as editable copy under the video. */}
      {bare ? null : (
        <Note style={{ opacity: interpolate(frame, [104, 124], [0, 1], { extrapolateRight: "clamp" }) }}>
          Every quote, visit, invoice and email for this client hangs off this one record. Nothing
          lives in a spreadsheet you have to remember to open.
        </Note>
      )}
    </SceneFrame>
  );
};

/** Card-slot cut: the composition IS the card interior, inked to the page's
 * scheme (the slot behind it paints --sheet). */
const ClientRecordCard: React.FC<JobSceneProps> = ({ theme = "light" }) => (
  <JobThemeProvider value={paletteFor(theme)}>
    <ClientRecord bare />
  </JobThemeProvider>
);
export default ClientRecordCard;
