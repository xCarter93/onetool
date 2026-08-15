import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CardHead, Note, SceneFrame } from "../Chrome";
import { CARD, T } from "../theme";

const THREAD = [
  { who: "Dana Whitfield", when: "Mon 8:02 AM", line: "Furnace in 412 Ashfield is cutting out — can you take a look this week?" },
  { who: "You", when: "Mon 8:31 AM", line: "Quote attached for the replacement — sign at the link and we'll book Wednesday." },
  { who: "Dana Whitfield", when: "Mon 6:47 PM", line: "Signed. Wednesday morning works, key is with the tenant." },
];

const PROMPT = "“Book the Northgate filter change Tuesday and plan the day's route.”";
const RESULT = "Visit scheduled Tue 8:00 · route rebuilt, 5 stops, 41 min driving";

/**
 * Scene 03 — the thread arriving message by message, then the assistant: the
 * ask types itself out and the work it did resolves underneath.
 */
export const ThreadAssistant: React.FC<{ bare?: boolean }> = ({ bare }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
            borderColor: `color-mix(in oklch, oklch(0.685 0.169 237.323) ${interpolate(
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

/** Card-slot cut: the composition IS the card interior. */
const ThreadAssistantCard: React.FC = () => <ThreadAssistant bare />;
export default ThreadAssistantCard;
