# Motion

Every motion decision in OneTool — whether to animate, with what values, in what technology, and the bar a review holds it to. Subordinate to `ONETOOL-DESIGN.md`; where the charter and this file disagree, the charter wins.

## 1. Decision framework — should it animate at all?

Run every candidate through all four questions **in order**. A failure at any step kills it. Record the answers; they belong in the design brief and in any review finding.

### Q1. Frequency — how often does a user see this?

| Frequency | Decision |
|---|---|
| 100+ ×/day (keyboard shortcuts, ⌘K command palette, core nav) | **No animation. Ever.** Not a judgment call. |
| Tens ×/day (hover states, list navigation, frequent toggles) | Remove, or near-imperceptible only (fast + subtle) |
| Occasional (modals, drawers, toasts, settings) | Eligible — standard animation |
| Rare / first-time (onboarding, empty states, success, celebration) | Eligible — this is where the delight budget lives |

Keyboard-initiated actions are a disqualifier, not a trade-off. Raycast has no open/close animation; that is the correct answer for something opened hundreds of times a day. Our ⌘K global search is the same class.

### Q2. Purpose — name it in one of these words

**Feedback** · **Spatial consistency** · **State indication** · **Preventing a jarring change** · **Explanation** (landing/onboarding only) · **Delight** (Rare tier only).

"It looks cool" is not on the list. If the purpose can't be named, delete the animation.

### Q3. Speed — does it fit the budget?

If the moment only works as a slow, showy animation, it fails. Budgets in §2.

### Q4. Function — does motion help or hinder?

Data the user is trying to *read* or *act on* must not move for style. A decorative mouse-tracking effect is fine on the landing page; on a workspace invoice table or a revenue chart, no animation is better. The workspace motion dial is 2/10 (charter); landing is 5–6/10.

**Per-surface consequence:** workspace and portal earn fewer, shorter animations than the landing page. Email/PDF gets none.

## 2. Constants — never approximate these

### Curves (three canonical + two sanctioned simple cases)

```css
--ease-out:     cubic-bezier(0.23, 1, 0.32, 1);     /* entrances, exits, default */
--ease-in-out:  cubic-bezier(0.77, 0, 0.175, 1);    /* on-screen movement / morphing */
--ease-drawer:  cubic-bezier(0.32, 0.72, 0, 1);     /* drawers, sheets (iOS feel) */
```

Selection order: entering/exiting → `ease-out`. Moving or morphing on screen → `ease-in-out`. Hover / color change → `ease`. Constant motion (marquee, progress) → `linear`. Unsure → `ease-out`.

**Never `ease-in` on UI** — it starts slow, delaying the exact moment the user is watching. `ease-out` at 200ms *feels* faster than `ease-in` at 200ms. Built-in CSS easings are too weak for deliberate motion; use the custom curves above. No bounce/elastic easing on workspace UI (charter).

### Durations

| Element | Duration |
|---|---|
| Button press feedback | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects, menus | 150–250ms |
| Modals, drawers, sheets | 200–500ms |
| Landing / explanatory (Remotion, hero) | May be longer |

**Hard rule: routine UI animation stays under 300ms.** A 180ms dropdown feels more responsive than a 400ms one. Anything over 300ms on a workspace element needs a written reason or it is a finding.

**Exits ≈ 75% of the entrance.** The user has already decided to dismiss; don't make them wait. (Enter 200ms → exit 150ms. Enter 240ms → exit 180ms.)

### Springs

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }        // Apple-style, preferred
{ type: "spring", mass: 1, stiffness: 100, damping: 10 } // traditional, more control
```

- Default UI spring is **critically damped** — `bounce: 0`, duration `0.3–0.4`. Graceful, non-distracting.
- `bounce` **0.1–0.3 only**, and only when the gesture itself carried momentum (a flick, a throw, a drag release). Overshoot on a menu that just faded in is wrong; overshoot on a card you flicked is right.
- Springs have no fixed duration — settle time emerges from the parameters. "Duration" in the Apple-style API is *response*, not a clock.

### Other fixed values

- Press feedback: `transform: scale(0.97)` on `:active`, `transition: transform 160ms ease-out`. Subtle range 0.95–0.98. Applies to any pressable element.
- Entrances start from `scale(0.9–0.97)` + `opacity: 0`. **Never `scale(0)`** — nothing in the real world appears from nothing.
- Stagger between group items: **30–80ms**. Longer feels slow. Stagger is decorative and must never block interaction.
- Transition-time `filter: blur()` stays under 20px (expensive, worst in Safari). ~2px is enough to mask a double-exposed crossfade.
- Drag dismissal by velocity, not distance: dismiss when `Math.abs(distance) / elapsedMs > ~0.11`. A flick should be enough.
- Momentum projection: `current + (v/1000) · d / (1 − d)`, `d ≈ 0.998` (0.99 for snappier). The textbook `v²/(2·decel)` is not what ships.
- Prefer `translate` percentages (`translateY(100%)` = the element's own height) over hardcoded px offsets.

## 3. CSS vs. spring — the split

| Motion is… | Use | Why |
|---|---|---|
| Predetermined, fires once, not grabbable (modal open, toast enter, accordion, page section reveal) | **CSS transition** with a fixed duration + one of the three curves | Runs off the main thread, survives a busy page, cheapest to maintain |
| Gesture-driven, interruptible, reversible mid-flight (drag, swipe-to-dismiss, sheet, drag-to-reorder) | **Spring** (motion/react) with velocity handoff | Springs animate from the *current* value and carry velocity through a retarget |

**The interruption rule that decides most cases:** CSS **transitions** can be interrupted and retargeted mid-animation; **`@keyframes` restart from zero**. So anything triggered rapidly — toasts stacking, toggles, expand/collapse spam, a list re-rendering — must use transitions or springs, never keyframes.

For gesture work: animate from the *presentation* (live on-screen) value, never the target value, or you get a visible jump on interrupt. When a gesture reverses, blend velocity rather than hard-cutting it — a hard cut reads as a brick wall. Decompose 2D motion into independent X and Y springs; one spring over a 2D distance desyncs when the axes have different velocities. Hand the pointer's release velocity to the spring so there is no seam between dragging and animating.

Never lock out input during a transition. Feedback fires on pointer-**down**, not on release, and is continuous *during* a drag — not only when it completes.

## 4. Implementation notes for this stack

**Tailwind v4.** The three canonical curves are `@theme` tokens in `apps/web/src/app/globals.css`: `ease-out-quint` (enter/exit), `ease-in-out` (moves; this overrides Tailwind's default of the same name), `ease-drawer`. Use the utilities or `var(--ease-*)`; a hand-typed `cubic-bezier(` anywhere is a consolidation finding (checklist row 33). Remember the v4 CSS-var utility syntax is `duration-(--var)` / `ease-(--var)` — the v3 `[--var]` form silently generates nothing.

**motion / framer-motion (both `^12` in `apps/web`).** Prefer the `motion/react` import path for new code; don't add a third motion library.

```jsx
<motion.div animate={{ x: 100 }} />                          // main thread, drops frames under load
<motion.div animate={{ transform: "translateX(100px)" }} />  // hardware accelerated
```

The `x` / `y` / `scale` shorthands are **not** hardware-accelerated — they run through rAF on the main thread. Use the full transform string for anything that animates while the page is busy (which, in a Convex-subscribed workspace, is most of the time).

**Base UI popovers** (all our `ui/` primitives sit on Base UI) expose `--transform-origin`. Trigger-anchored surfaces — popover, dropdown, select, menu, tooltip — must use `transform-origin: var(--transform-origin)` so they scale out of their trigger. **Centered modals are exempt**: `transform-origin: center` is correct there and must not be reported as a finding.

**`@starting-style`** is the preferred entry mechanism when no JS is needed:

```css
.toast {
  opacity: 1; transform: translateY(0);
  transition: opacity 240ms var(--ease-out), transform 240ms var(--ease-out);
  @starting-style { opacity: 0; transform: translateY(100%); }
}
```

**Never drive a continuous value through React state.** No `setState` in a `pointermove`, `scroll`, or rAF loop. Use `useMotionValue`, `useScroll`, `useSpring`, or an `IntersectionObserver`; for plain DOM, set `element.style.transform` directly. Related: setting a CSS variable on a *parent* to drive child transforms triggers a style recalc for every child — set `transform` on the element itself. Also note both `apps/web` and `apps/mobile` lint **set-state-in-effect as an error**, so effect-driven animation state won't even compile; derive at render or use a motion value.

**WAAPI** (`element.animate([...], { duration, easing, fill: 'forwards' })`) is the escape hatch when you need JS control with CSS performance and no library.

**Remotion** (`apps/web/src/remotion`) is landing-surface video, not UI — the sub-300ms budget does not apply to scene timing there. It still owes reduced-motion handling at the embed site.

**Mobile** (`apps/mobile`) follows the same gate and the same frequency table; Reanimated worklets replace CSS transitions. The picture frame is low-motion by design: the rail never moves, only the canvas slides on a push.

## 5. Review bar

### Flag on sight

- `transition: all`
- `scale(0)`, or a pure-fade entrance with no initial transform
- `ease-in` on any UI interaction; a weak built-in easing on a deliberate animation
- Any animation on a keyboard shortcut, ⌘K palette, or 100+/day action
- UI duration > 300ms with no stated reason; symmetric enter/exit where the exit should be ~75%
- `transform-origin: center` (or unset) on a trigger-anchored popover/dropdown/tooltip
- `@keyframes` on toasts, toggles, or anything triggered rapidly
- Animating layout properties — `width` / `height` / `margin` / `padding` / `top` / `left`
- Framer Motion `x` / `y` / `scale` props on motion that runs while the page is busy
- A CSS variable set on a parent to drive child transforms (style-recalc storm)
- Missing `prefers-reduced-motion` handling on movement; ungated `:hover` motion
- Symmetric timing on a press-and-release or hold interaction
- An everything-at-once group entrance where a 30–80ms stagger belongs
- A hand-typed cubic-bezier that near-duplicates one of the three canonical curves

**Accordion exception:** height is a layout property, but `grid-template-rows: 0fr → 1fr` is the sanctioned accordion technique (charter) — don't report it as a layout-animation finding.

### Remedial preference hierarchy

When proposing a fix, prefer the earliest move that works:

1. **Delete it** (high-frequency, no nameable purpose, keyboard-triggered).
2. **Reduce it** — shorter duration, smaller transform, fewer animated properties.
3. **Fix the easing** — `ease-in` → `ease-out`; built-in → canonical cubic-bezier.
4. **Fix origin / physicality** — correct `transform-origin`; `scale(0)` → `scale(0.95)` + opacity.
5. **Make it interruptible** — keyframes → transitions; gesture → spring.
6. **Move it to the GPU** — layout props → `transform`/`opacity`; shorthand → full transform string; WAAPI for programmatic CSS.
7. **Asymmetric timing** — slow the deliberate phase, snap the response.
8. **Polish** — blur to mask a crossfade, stagger a group, `@starting-style` for entry, spring for "alive" elements.
9. **Accessibility & cohesion** — reduced-motion + hover gating; tune to the surface's personality.

### Asymmetric timing

Slow where the user is deciding; snappy where the system responds. A press, a hold, a destructive confirm animates slower than its release. Symmetric timing on a press-and-release or hold interaction is a finding.

```css
.overlay              { transition: clip-path 200ms var(--ease-out); } /* release: fast */
.button:active .overlay { transition: clip-path 2s linear; }          /* press: slow, deliberate */
```

### Cohesion

Motion matches the surface's personality. The workspace and portal stay crisp and fast; the landing page may be more expressive. One bouncy component in a crisp app is a finding. When unsure whether motion feels right, the strongest move is usually to delete it.

### Verdict format

Part 1 — a single findings table, one row per issue, most severe first:

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| HIGH | `Toast.tsx:41` | `@keyframes slideIn` on stacking toasts | Transition + `@starting-style`; keyframes restart from zero on rapid triggers |

Severity: **HIGH** = feel-breaking (wrong easing on UI, animation on a keyboard/high-frequency action, dropped frames, `scale(0)`). **MEDIUM** = noticeably off (wrong origin, non-interruptible dynamic UI, missing reduced-motion). **LOW** = polish (stagger, blur-masked crossfade, token consolidation). When folding into a full design review, map HIGH→P1, MEDIUM→P2, LOW→P3 (`review-checklist.md` §8 owns the unified ladder).

Part 2 — an explicit one-line decision:

- **Block** — any feel-breaking regression, animation on a keyboard/high-frequency action, `scale(0)` or `ease-in` on UI, a non-GPU animation with an easy GPU fix, or missing reduced-motion on movement.
- **Approve** — no feel-breaking regressions, nothing obvious that should be deleted, durations and easing in bounds, interruptibility handled, reduced-motion respected.

Cite `file:line` and pull exact values from §2 rather than approximating. When feel genuinely can't be judged from code, say so and prescribe a feel-check (slow motion 2–5×, DevTools Animations panel frame-by-frame, a real device for gestures, fresh eyes the next day) instead of guessing.

## 6. Reduced motion is a release gate

Nothing ships without it. It is not a polish item and not optional.

```css
@media (prefers-reduced-motion: reduce) {
  .element { transition: opacity 200ms ease; transform: none !important; }
}
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.02); } /* touch fires false hovers on tap */
}
```

```jsx
const reduce = useReducedMotion();
const closedX = reduce ? 0 : "-100%";
```

- Reduced motion means **fewer and gentler**, not zero. Keep opacity/color transitions that aid comprehension; drop movement, parallax, and overshoot. An implementation that nukes all feedback is itself a finding.
- Hover motion is gated behind `@media (hover: hover) and (pointer: fine)` — touch devices fire a false hover on tap.
- Also honor `prefers-reduced-transparency: reduce` (raise background opacity, drop `backdrop-filter` — this hits our frosted/glass chrome) and `prefers-contrast: more` (near-solid backgrounds with a defined border).
- Avoid full-viewport moving backgrounds, slow looping oscillations near 0.2 Hz (one cycle / 5s), and abrupt brightness jumps — ease the dark↔light theme change.
