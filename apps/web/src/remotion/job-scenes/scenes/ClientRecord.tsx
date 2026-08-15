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
