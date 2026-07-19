/**
 * Direction D — isometric celebration moments. The only tier allowed a second
 * hue (--illo-celebrate, aliased to --success).
 *
 * Deliberately capped at four. Scarcity is the entire mechanism: if isometric
 * shows up on a routine empty table it stops signalling an occasion. Add a
 * fifth only by trading one out.
 */

export function QuoteSigned() {
  return (
    <>
      <ellipse
        cx="100"
        cy="102"
        rx="46"
        ry="7"
        className="illo-mote"
        style={{ opacity: 0.13 }}
      />
      <path d="M100 26 L150 54 L100 82 L50 54 Z" className="illo-surface" />
      <path d="M100 26 L150 54 L100 82 L50 54 Z" className="illo-outline" />
      <path d="M50 54 L50 66 L100 94 L100 82 Z" className="illo-face-left" />
      <path d="M50 54 L50 66 L100 94 L100 82 Z" className="illo-outline" />
      <path d="M150 54 L150 66 L100 94 L100 82 Z" className="illo-face-right" />
      <path d="M150 54 L150 66 L100 94 L100 82 Z" className="illo-outline" />
      <line x1="80" y1="52" x2="104" y2="38" className="illo-bar" />
      <line x1="94" y1="60" x2="116" y2="47" className="illo-bar-quiet" />
      <circle cx="146" cy="26" r="15" className="illo-celebrate-soft" />
      <circle cx="146" cy="26" r="15" className="illo-celebrate-line" />
      <path
        d="M139 26 l5 5 l9 -11"
        className="illo-celebrate-line"
        style={{ strokeWidth: 2.6 }}
      />
    </>
  );
}

export function InvoicePaid() {
  return (
    <>
      <ellipse
        cx="100"
        cy="104"
        rx="44"
        ry="7"
        className="illo-mote"
        style={{ opacity: 0.13 }}
      />
      <path d="M62 78 L100 58 L138 78 L100 98 Z" className="illo-surface" />
      <path d="M62 78 L100 58 L138 78 L100 98 Z" className="illo-outline" />
      <path d="M62 78 L62 86 L100 106 L100 98 Z" className="illo-face-left" />
      <path d="M62 78 L62 86 L100 106 L100 98 Z" className="illo-outline" />
      <path
        d="M138 78 L138 86 L100 106 L100 98 Z"
        className="illo-face-right"
      />
      <path d="M138 78 L138 86 L100 106 L100 98 Z" className="illo-outline" />
      <path d="M70 58 L100 42 L130 58 L100 74 Z" className="illo-surface" />
      <path d="M70 58 L100 42 L130 58 L100 74 Z" className="illo-outline" />
      <path d="M70 58 L70 66 L100 82 L100 74 Z" className="illo-face-left" />
      <path d="M70 58 L70 66 L100 82 L100 74 Z" className="illo-outline" />
      <path d="M130 58 L130 66 L100 82 L100 74 Z" className="illo-face-right" />
      <path d="M130 58 L130 66 L100 82 L100 74 Z" className="illo-outline" />
      <path
        d="M78 40 L100 28 L122 40 L100 52 Z"
        className="illo-celebrate-soft"
      />
      <path
        d="M78 40 L100 28 L122 40 L100 52 Z"
        className="illo-celebrate-line"
      />
      <path
        d="M100 22 v-9 M88 26 l-6 -7 M112 26 l6 -7"
        className="illo-celebrate-line"
        style={{ strokeWidth: 2 }}
      />
    </>
  );
}

export function FirstClientAdded() {
  return (
    <>
      <ellipse
        cx="100"
        cy="104"
        rx="48"
        ry="7"
        className="illo-mote"
        style={{ opacity: 0.13 }}
      />
      <path d="M100 42 L146 68 L100 94 L54 68 Z" className="illo-surface" />
      <path d="M100 42 L146 68 L100 94 L54 68 Z" className="illo-outline" />
      <path d="M54 68 L54 78 L100 104 L100 94 Z" className="illo-face-left" />
      <path d="M54 68 L54 78 L100 104 L100 94 Z" className="illo-outline" />
      <path
        d="M146 68 L146 78 L100 104 L100 94 Z"
        className="illo-face-right"
      />
      <path d="M146 68 L146 78 L100 104 L100 94 Z" className="illo-outline" />
      <path
        d="M100 16 l6.4 13 l14.6 2 l-10.5 10.2 l2.5 14.4 l-13 -6.8 l-13 6.8 l2.5 -14.4 l-10.5 -10.2 l14.6 -2 Z"
        className="illo-celebrate-soft"
      />
      <path
        d="M100 16 l6.4 13 l14.6 2 l-10.5 10.2 l2.5 14.4 l-13 -6.8 l-13 6.8 l2.5 -14.4 l-10.5 -10.2 l14.6 -2 Z"
        className="illo-celebrate-line"
      />
    </>
  );
}

export function AllCaughtUp() {
  return (
    <>
      <ellipse
        cx="100"
        cy="102"
        rx="44"
        ry="7"
        className="illo-mote"
        style={{ opacity: 0.13 }}
      />
      <path d="M56 70 L100 46 L144 70 L100 94 Z" className="illo-surface" />
      <path d="M56 70 L100 46 L144 70 L100 94 Z" className="illo-outline" />
      <path d="M56 70 L56 80 L100 104 L100 94 Z" className="illo-face-left" />
      <path d="M56 70 L56 80 L100 104 L100 94 Z" className="illo-outline" />
      <path
        d="M144 70 L144 80 L100 104 L100 94 Z"
        className="illo-face-right"
      />
      <path d="M144 70 L144 80 L100 104 L100 94 Z" className="illo-outline" />
      <circle cx="100" cy="34" r="17" className="illo-celebrate-soft" />
      <circle cx="100" cy="34" r="17" className="illo-celebrate-line" />
      <path
        d="M92 34 l6 6 l11 -13"
        className="illo-celebrate-line"
        style={{ strokeWidth: 3 }}
      />
      <circle cx="56" cy="28" r="3" className="illo-mote" />
      <circle cx="150" cy="40" r="4" className="illo-mote" />
      <circle cx="140" cy="16" r="2.5" className="illo-mote" />
    </>
  );
}

export function AllCaughtUpHero() {
  return (
    <>
      <ellipse
        cx="160"
        cy="164"
        rx="72"
        ry="11"
        className="illo-mote"
        style={{ opacity: 0.13 }}
      />
      <path d="M90 112 L160 74 L230 112 L160 150 Z" className="illo-surface" />
      <path d="M90 112 L160 74 L230 112 L160 150 Z" className="illo-outline" />
      <path
        d="M90 112 L90 128 L160 166 L160 150 Z"
        className="illo-face-left"
      />
      <path d="M90 112 L90 128 L160 166 L160 150 Z" className="illo-outline" />
      <path
        d="M230 112 L230 128 L160 166 L160 150 Z"
        className="illo-face-right"
      />
      <path
        d="M230 112 L230 128 L160 166 L160 150 Z"
        className="illo-outline"
      />
      <line x1="132" y1="110" x2="168" y2="88" className="illo-bar" />
      <line x1="152" y1="122" x2="184" y2="103" className="illo-bar-quiet" />
      <circle cx="160" cy="48" r="27" className="illo-celebrate-soft" />
      <circle cx="160" cy="48" r="27" className="illo-celebrate-line" />
      <path
        d="M147 48 l10 10 l17 -20"
        className="illo-celebrate-line"
        style={{ strokeWidth: 4 }}
      />
      <circle cx="72" cy="42" r="4.5" className="illo-mote" />
      <circle cx="252" cy="62" r="6" className="illo-mote" />
      <circle cx="238" cy="26" r="3.5" className="illo-mote" />
      <circle cx="84" cy="150" r="4" className="illo-mote" />
    </>
  );
}

export function FirstClientAddedHero() {
  return (
    <>
      <ellipse
        cx="160"
        cy="168"
        rx="78"
        ry="11"
        className="illo-mote"
        style={{ opacity: 0.13 }}
      />
      <path d="M160 74 L234 116 L160 158 L86 116 Z" className="illo-surface" />
      <path d="M160 74 L234 116 L160 158 L86 116 Z" className="illo-outline" />
      <path
        d="M86 116 L86 132 L160 174 L160 158 Z"
        className="illo-face-left"
      />
      <path d="M86 116 L86 132 L160 174 L160 158 Z" className="illo-outline" />
      <path
        d="M234 116 L234 132 L160 174 L160 158 Z"
        className="illo-face-right"
      />
      <path
        d="M234 116 L234 132 L160 174 L160 158 Z"
        className="illo-outline"
      />
      <path
        d="M160 18 l10.2 20.8 l23 3.2 l-16.6 16.2 l3.9 22.9 l-20.5 -10.8 l-20.5 10.8 l3.9 -22.9 l-16.6 -16.2 l23 -3.2 Z"
        className="illo-celebrate-soft"
      />
      <path
        d="M160 18 l10.2 20.8 l23 3.2 l-16.6 16.2 l3.9 22.9 l-20.5 -10.8 l-20.5 10.8 l3.9 -22.9 l-16.6 -16.2 l23 -3.2 Z"
        className="illo-celebrate-line"
      />
      <circle cx="74" cy="52" r="4.5" className="illo-mote" />
      <circle cx="256" cy="70" r="6" className="illo-mote" />
      <circle cx="246" cy="34" r="3.5" className="illo-mote" />
    </>
  );
}
