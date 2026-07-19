/**
 * Direction A — line art spots. The default treatment: concept and object
 * states. Outline plus exactly one accent element, never two.
 */

export function ClientPropertiesNone() {
  return (
    <>
      <line x1="34" y1="102" x2="166" y2="102" className="illo-ground" />
      <path d="M62 58 L100 30 L138 58 V96 H62 Z" className="illo-surface" />
      <path d="M62 58 L100 30 L138 58 V96 H62 Z" className="illo-outline" />
      <rect
        x="88"
        y="72"
        width="24"
        height="24"
        rx="3"
        className="illo-knock"
      />
      <rect
        x="88"
        y="72"
        width="24"
        height="24"
        rx="3"
        className="illo-outline"
      />
      <rect x="72" y="66" width="12" height="10" rx="2" className="illo-hair" />
      <rect
        x="116"
        y="66"
        width="12"
        height="10"
        rx="2"
        className="illo-hair"
      />
      <path d="M100 30 L100 18" className="illo-hair" />
      <circle cx="100" cy="14" r="7" className="illo-accent" />
      <circle cx="100" cy="14" r="2.4" className="illo-knock" />
    </>
  );
}

export function QuoteApprovalNone() {
  return (
    <>
      <line x1="38" y1="106" x2="162" y2="106" className="illo-ground" />
      <path d="M62 16 H124 L142 34 V98 H62 Z" className="illo-surface" />
      <path d="M62 16 H124 L142 34 V98 H62 Z" className="illo-outline" />
      <path d="M124 16 V34 H142" className="illo-outline" />
      <line x1="76" y1="48" x2="128" y2="48" className="illo-bar" />
      <line x1="76" y1="60" x2="112" y2="60" className="illo-bar-quiet" />
      <line x1="76" y1="72" x2="120" y2="72" className="illo-bar-quiet" />
      <line x1="76" y1="86" x2="98" y2="86" className="illo-hair" />
      <circle cx="132" cy="86" r="13" className="illo-accent-soft" />
      <path
        d="M126 86 l4.4 4.4 l8 -9"
        className="illo-accent-line"
        style={{ strokeWidth: 2.2 }}
      />
    </>
  );
}

export function PaymentsNone() {
  return (
    <>
      <rect
        x="44"
        y="34"
        width="104"
        height="62"
        rx="9"
        className="illo-surface"
        transform="rotate(-7 96 65)"
      />
      <rect
        x="44"
        y="34"
        width="104"
        height="62"
        rx="9"
        className="illo-outline"
        transform="rotate(-7 96 65)"
      />
      <rect
        x="56"
        y="30"
        width="104"
        height="62"
        rx="9"
        className="illo-knock"
      />
      <rect
        x="56"
        y="30"
        width="104"
        height="62"
        rx="9"
        className="illo-outline"
      />
      <line x1="56" y1="46" x2="160" y2="46" className="illo-outline" />
      <rect
        x="68"
        y="58"
        width="18"
        height="13"
        rx="3"
        className="illo-accent-soft"
      />
      <rect
        x="68"
        y="58"
        width="18"
        height="13"
        rx="3"
        className="illo-accent-line"
      />
      <line x1="68" y1="82" x2="94" y2="82" className="illo-bar-quiet" />
      <line x1="102" y1="82" x2="122" y2="82" className="illo-bar-quiet" />
      <line x1="130" y1="82" x2="148" y2="82" className="illo-bar-quiet" />
    </>
  );
}

export function AutomationsNone() {
  return (
    <>
      <path d="M60 60 H92" className="illo-dash" />
      <path
        d="M124 60 H150 M124 60 C136 60 136 34 148 34 M124 60 C136 60 136 86 148 86"
        className="illo-dash"
      />
      <rect
        x="30"
        y="46"
        width="30"
        height="28"
        rx="6"
        className="illo-surface"
      />
      <rect
        x="30"
        y="46"
        width="30"
        height="28"
        rx="6"
        className="illo-outline"
      />
      <line x1="38" y1="56" x2="52" y2="56" className="illo-bar-quiet" />
      <line x1="38" y1="64" x2="47" y2="64" className="illo-bar-quiet" />
      <rect
        x="92"
        y="42"
        width="32"
        height="36"
        rx="8"
        className="illo-accent-soft"
      />
      <rect
        x="92"
        y="42"
        width="32"
        height="36"
        rx="8"
        className="illo-accent-line"
      />
      <circle cx="108" cy="60" r="5" className="illo-accent" />
      <circle cx="158" cy="34" r="7" className="illo-outline" />
      <circle cx="158" cy="86" r="7" className="illo-outline" />
    </>
  );
}

export function MessagesNone() {
  return (
    <>
      <rect
        x="34"
        y="30"
        width="80"
        height="50"
        rx="10"
        className="illo-surface"
      />
      <rect
        x="34"
        y="30"
        width="80"
        height="50"
        rx="10"
        className="illo-outline"
      />
      <path d="M52 80 L52 92 L68 80 Z" className="illo-surface" />
      <path d="M52 80 L52 92 L68 80 Z" className="illo-outline" />
      <line x1="48" y1="48" x2="98" y2="48" className="illo-bar-quiet" />
      <line x1="48" y1="60" x2="82" y2="60" className="illo-bar-quiet" />
      <rect
        x="102"
        y="20"
        width="66"
        height="44"
        rx="10"
        className="illo-accent-soft"
      />
      <rect
        x="102"
        y="20"
        width="66"
        height="44"
        rx="10"
        className="illo-accent-line"
      />
      <path
        d="M150 64 L150 76 L134 64 Z"
        className="illo-accent-line illo-fill-knock"
      />
      <line
        x1="114"
        y1="34"
        x2="152"
        y2="34"
        className="illo-bar-accent"
        opacity={0.45}
      />
      <line
        x1="114"
        y1="46"
        x2="140"
        y2="46"
        className="illo-bar-accent"
        opacity={0.3}
      />
    </>
  );
}

export function DocumentsNone() {
  return (
    <>
      <line x1="38" y1="106" x2="162" y2="106" className="illo-ground" />
      <rect
        x="52"
        y="26"
        width="66"
        height="72"
        rx="7"
        className="illo-surface"
        transform="rotate(-8 85 62)"
      />
      <rect
        x="52"
        y="26"
        width="66"
        height="72"
        rx="7"
        className="illo-outline"
        transform="rotate(-8 85 62)"
      />
      <rect
        x="78"
        y="20"
        width="70"
        height="78"
        rx="7"
        className="illo-knock"
      />
      <rect
        x="78"
        y="20"
        width="70"
        height="78"
        rx="7"
        className="illo-outline"
      />
      <line x1="92" y1="40" x2="134" y2="40" className="illo-bar" />
      <line x1="92" y1="52" x2="122" y2="52" className="illo-bar-quiet" />
      <line x1="92" y1="64" x2="130" y2="64" className="illo-bar-quiet" />
      <path
        d="M92 84 c6 -8 10 6 16 0 c6 -6 10 4 16 -2"
        className="illo-accent-line"
        style={{ strokeWidth: 2 }}
      />
    </>
  );
}

export function SelectConversation() {
  return (
    <>
      <rect
        x="30"
        y="20"
        width="52"
        height="80"
        rx="7"
        className="illo-surface"
      />
      <rect
        x="30"
        y="20"
        width="52"
        height="80"
        rx="7"
        className="illo-outline"
      />
      <line x1="40" y1="34" x2="70" y2="34" className="illo-bar-quiet" />
      <rect
        x="36"
        y="44"
        width="40"
        height="14"
        rx="4"
        className="illo-accent-soft"
      />
      <line
        x1="42"
        y1="51"
        x2="66"
        y2="51"
        className="illo-bar-accent"
        opacity={0.5}
      />
      <line x1="40" y1="70" x2="70" y2="70" className="illo-bar-quiet" />
      <line x1="40" y1="84" x2="62" y2="84" className="illo-bar-quiet" />
      <rect x="94" y="20" width="76" height="80" rx="7" className="illo-dash" />
      <path
        d="M118 60 h28 m-9 -9 l9 9 l-9 9"
        className="illo-accent-line"
        style={{ strokeWidth: 2 }}
      />
    </>
  );
}

/**
 * Error is the one place a non-accent hue is allowed outside the celebration
 * tier — a torn sheet reads as neutral without it.
 */
export function AppError() {
  return (
    <>
      <line x1="38" y1="106" x2="162" y2="106" className="illo-ground" />
      <path d="M56 26 H108 L132 50 V64 H56 Z" className="illo-surface" />
      <path d="M56 26 H108 L132 50 V64 H56 Z" className="illo-outline" />
      <path d="M60 74 H136 V96 H60 Z" className="illo-knock" />
      <path d="M60 74 H136 V96 H60 Z" className="illo-outline" />
      <line x1="72" y1="44" x2="98" y2="44" className="illo-bar-quiet" />
      <line x1="74" y1="85" x2="106" y2="85" className="illo-bar-quiet" />
      <circle
        cx="150"
        cy="34"
        r="12"
        fill="var(--destructive)"
        opacity={0.14}
      />
      <path
        d="M150 28 v7 M150 40.5 v.2"
        stroke="var(--destructive)"
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

export function AppErrorHero() {
  return (
    <>
      <line x1="52" y1="172" x2="268" y2="172" className="illo-ground" />
      <path d="M84 40 H172 L212 80 V102 H84 Z" className="illo-surface" />
      <path d="M84 40 H172 L212 80 V102 H84 Z" className="illo-outline" />
      <path d="M172 40 V80 H212" className="illo-outline" />
      <path d="M90 118 H218 V156 H90 Z" className="illo-knock" />
      <path d="M90 118 H218 V156 H90 Z" className="illo-outline" />
      <line x1="106" y1="66" x2="152" y2="66" className="illo-bar-quiet" />
      <line x1="106" y1="84" x2="132" y2="84" className="illo-bar-quiet" />
      <line x1="110" y1="136" x2="166" y2="136" className="illo-bar-quiet" />
      <circle
        cx="238"
        cy="52"
        r="20"
        fill="var(--destructive)"
        opacity={0.14}
      />
      <path
        d="M238 42 v12 M238 61 v.2"
        stroke="var(--destructive)"
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="66" cy="30" r="4" className="illo-mote" />
      <circle cx="276" cy="120" r="5.5" className="illo-mote" />
      <circle cx="252" cy="168" r="3.5" className="illo-mote" />
    </>
  );
}

/**
 * Restricted, not broken. Distinct from AppError on purpose: a permission gate
 * is a normal authorized state, so it gets the neutral accent and a closed
 * padlock rather than the destructive hue AppError reserves for real failures.
 */
export function AccessRestricted() {
  return (
    <>
      <line x1="38" y1="106" x2="162" y2="106" className="illo-ground" />
      <rect
        x="56"
        y="22"
        width="88"
        height="72"
        rx="8"
        className="illo-surface"
      />
      <rect
        x="56"
        y="22"
        width="88"
        height="72"
        rx="8"
        className="illo-outline"
      />
      <line x1="56" y1="40" x2="144" y2="40" className="illo-outline" />
      <circle cx="66" cy="31" r="2.2" className="illo-hair" />
      <circle cx="74" cy="31" r="2.2" className="illo-hair" />
      <path
        d="M88 62 V54 a12 12 0 0 1 24 0 V62"
        className="illo-accent-line"
        style={{ strokeWidth: 2 }}
      />
      <rect
        x="82"
        y="62"
        width="36"
        height="26"
        rx="5"
        className="illo-accent-soft"
      />
      <rect
        x="82"
        y="62"
        width="36"
        height="26"
        rx="5"
        className="illo-accent-line"
      />
      <circle cx="100" cy="72" r="3" className="illo-accent" />
      <line x1="100" y1="74" x2="100" y2="80" className="illo-bar-accent" />
    </>
  );
}
