# UX laws

Nineteen behavioral laws translated into OneTool rules, one web flavor and one mobile flavor each. Each law ends in a **review check** written so `design-review` can turn it into a `file:line` finding, and an **anchor** in the current product so the rule is grounded in what already ships rather than in textbook examples.

**How to use it.** In a `design-new` brief, name the two or three laws the layout leans on. In a `design-improve` or `design-review` finding, tag the law so the fix has a reason. Start from the index below, read the entry, apply the flavor for the surface you declared. Severities named in the review checks are the usual class for that defect; `review-checklist.md` §8 (its ladder and the "would a user contact support?" tie-break) decides the final label. The charter still wins: several laws in their textbook form collide with the token locks and House exemptions, and §"Under the charter" says how each collision resolves.

**Provenance, once.** Hick's, Fitts's, Miller's, Doherty, Peak-End, Zeigarnik, Serial Position, Von Restorff, and the four Gestalt laws come from experiments. Jakob's and Tesler's are practitioner laws from HCI. Pareto, Occam, Parkinson, and Postel are borrowed analogies (economics, philosophy, satire, network engineering) and should be argued for, not cited as authority. "Minimize target distance" is not a law at all but a corollary of Fitts's (see its entry). Sources are at the end.

## Situation → law

| You are deciding… | Read |
|---|---|
| How many options to show at a decision point (menu, toolbar, modal footer, plan picker) | Hick's, Pareto |
| Where a button/row/target goes and how big it is; thumb reach on mobile | Fitts's, Minimize target distance |
| Whether a pattern should match what users already know (tables, nav, gestures) | Jakob's, Similarity |
| How to group things: spacing vs border vs tinted ground | Proximity, Uniform Connectedness, Prägnanz |
| What the user has to *remember* across steps or screens | Miller's, Serial Position, Zeigarnik |
| What one thing should stand out on a screen | Von Restorff |
| Loading, skeleton, optimistic update, response time | Doherty |
| How a flow should end; where the celebration or the worst moment is | Peak-End |
| Progress indicators, drafts, resumable setup | Zeigarnik, Parkinson's |
| A form that rejects input a human reads as valid | Postel's |
| Where an unavoidable complexity should live (user, UI, or code) | Tesler's, Occam's |
| What to build first, what to bury, what to leave off mobile | Pareto, Occam's |

## Under the charter

- **Miller's is ≤4, not 7±2.** The checklist's "≤4 items per group, ≤4 visible choices" is the house number. Seven is the famous misreading; Miller's paper was about absolute judgment, and later work puts working memory nearer four chunks.
- **Doherty's 400ms is the response ceiling; our 300ms is the indicator threshold.** Anything the app can't answer in ~300ms shows a skeleton or an inline spinner. The two numbers are different constructs and both stand.
- **Von Restorff runs on weight, position, and isolation, not on a new color.** The one-accent lock and the StatusBadge status→color map are fixed; "make it pop" through a fresh hue is a token violation. On mobile, status uses the same StatusBadge tints as web, so isolation comes from position and weight.
- **Jakob's and Similarity are the reason workspace repetition is a feature.** A list page that looks like every other list page is the law working. Landing is the only surface where deviation is rewarded.
- **The Gestalt laws are why the workspace is losing cards and mobile rows are borderless.** Grouping comes from spacing and alignment first; enclosure is the strongest cue and is spent deliberately.
- **Pre-existing tension, not a defect to fix in passing:** the web sidebar holds 13 destinations in three labeled groups (Workspace / Resources / Manage). The grouping is the Miller's/Hick's answer; don't "fix" the count as a side effect of unrelated work.

---

## Choice and cognitive load

### Hick's Law
Decision time grows with the number and complexity of choices, roughly log₂(n+1). It applies to genuine decision points, not to scanning a sorted list, where search time is linear and the law does not hold. It measures decision time, not comprehension.

- **Web.** Cap a decision point (modal footer, toolbar, bulk-action bar, plan picker) at ≤4 visible choices; the rest goes in an overflow menu. Mark a recommended option so the user can stop comparing after one read. Long lists (clients, SKUs, countries) get search, not fewer rows. Never hide a control an expert uses daily to "simplify"; that trades decision time for navigation time.
- **Mobile.** Bottom navigation holds 3–5 destinations. A sheet footer carries one primary action. Segmented control for 2–4 options; a picker or sheet beyond that. Split long forms into steps that each fit one screen rather than hiding fields.
- **Review check.** Count the visible choices at each decision point; >4 without grouping or a marked default is a finding. A control removed from view must reappear one level deeper, not vanish.
- **Anchor.** ⌘K (`layout/command-palette.tsx`) is the house answer to a long list: search beats choosing, and its frequency puts it above the motion gate. The mobile speed-dial FAB offers four create targets (Client, Quote, Project, Task) and no more.

### Miller's Law
Working memory holds a handful of chunks (the house number is 4; the popular 7±2 is a misreading of a paper about absolute judgment). The lever is chunking, and the scope is what the user must *hold*, not what is on screen.

- **Web.** Chunk on display and on input: phone numbers 3-3-4, card numbers in 4s, IDs with separators. Echo a value the user needs later (the client name in a step header) instead of making them carry it. Keep comparison tables to columns that fit without horizontal scroll; scrolled-away columns become memory load.
- **Mobile.** Per-digit OTP boxes with SMS autofill. Every multi-step flow shows a running summary on its confirm screen. Persist entered data across backgrounding; an interruption wipes working memory completely.
- **Review check.** Any step that requires a value from a previous screen without showing it is a finding. Any string of >4 digits displayed unchunked is a P3.
- **Anchor.** `lib/phone.ts` normalizes and formats phone numbers on web; the sidebar's three labeled groups chunk 13 destinations.

### Tesler's Law
Every system has complexity that cannot be removed, only relocated between the user, the interface, and the code. The design question is *who absorbs it*, and the cheapest place is usually engineering.

- **Web.** Absorb in code first: parse pasted values, infer formats, default timezone/currency/tax from the org, pre-fill from the record you came from. What can't be absorbed is exposed in place with inline help, never in a separate doc. Keep an escape hatch for power users (bulk edit, CSV import, raw filter) so simplification never becomes a ceiling.
- **Mobile.** Move complexity to the server or the device: camera and contacts autofill, address autocomplete, biometric auth. If a flow cannot carry its complexity on a 375pt screen, hand off to desktop with a plain sentence rather than shipping a cramped version.
- **Review check.** When a diff removes an option or a field, find where its complexity landed. If it landed on the user (a manual step, a value to remember, a support-article lookup), that is a finding; if it landed in code, it is a win.
- **Anchor.** The clients CSV import (`clients/import`) absorbs spreadsheet mess in the mapper; `AddressAutocomplete.native.tsx` absorbs address entry on mobile.

### Occam's Razor
Among solutions that solve the problem equally well, prefer the one with the fewest parts. The clause that gets dropped is "equally well". Simpler only wins among options that actually work. Done means nothing further can be removed without breaking function.

- **Web.** Remove one element at a time and ask what breaks. One control that covers a case beats two that split it (a date-range picker over two date fields plus a preset menu). A setting is usually a decision handed to the user; make the decision. The boring primitive from `ui/` beats a custom one.
- **Mobile.** Screen width forces the razor. If a control doesn't survive at 375pt, question whether it belongs on desktop either. One job per screen, one primary action. Platform components over custom ones.
- **Review check.** A new preference, toggle, or mode with no stated case that requires it is a finding. Two controls that do one job are a finding.
- **Anchor.** `ui/date-picker` and `shared/date-picker-range.tsx`, both over `ui/calendar`, are the sanctioned date controls.

### Pareto Principle
A minority of actions carry most of the usage. It is an observation about skewed distributions, not a constant, and it tells you to measure, not to assume. The tail still contains work a small group cannot live without (billing, compliance, admin).

- **Web.** Rank by measured frequency (PostHog), not by stakeholder opinion. The top actions get the fastest path: default view, keyboard shortcut, top-level nav, the primary button. The rest sits behind progressive disclosure, no more than two levels deep.
- **Mobile.** The tab bar *is* the 20%; choose its modes from usage. The single most frequent action lives in thumb reach. Shipping only the high-frequency subset on mobile and linking to desktop for the rest is a legitimate design.
- **Review check.** A top-level slot (nav item, primary button, FAB target, tab) given to something without a frequency argument is a finding. A tail feature deleted on frequency alone, without checking who depends on it, is a P1.
- **Anchor.** The mobile glass dock carries four modes (Today, Work, Money, Routes) plus the assistant orb; Clients, Projects, Profile, and Activity are hidden routes reached from inside those modes.

## Motor and target

### Fitts's Law
Time to hit a target grows with distance and shrinks with size, as log₂(2D/W). Size buys more than proximity. On a mouse, screen edges and corners are infinite targets; on touch they are not, and edge targets take *longer*. Invisible padding around a small painted target does not fix it: people aim at what they see.

- **Web.** The whole row or card is the hit area, not the 16px icon inside it. Global chrome sits against an edge (sidebar, header). The submit sits adjacent to the last field, not across a wide footer. Destructive actions get enough space from their neighbor that an overshoot lands on nothing.
- **Mobile.** Painted targets ≥44×44pt (Apple HIG; Material says 48dp; WCAG 2.2 AA floor is 24px with spacing). `touch.min = 44` in `apps/mobile/lib/theme.ts`; pair `hitSlop` with anything painted smaller, and never rely on hitSlop alone for a control that looks tiny. Primary action in the bottom thumb zone; the top corners are for back and rare actions. Don't edge-pin on touch.
- **Review check.** Any interactive element under 44×44 on mobile or with a hit area smaller than its visible affordance on web is a finding (countable check §7 row 21). A primary action above the fold's top third on a mobile screen is a P2.
- **Anchor.** `styles.primaryButton` on mobile carries `minHeight: 44`; the speed-dial FAB and the glass dock sit in the thumb zone.

### Minimize target distance
Not a separate law: the D term of Fitts's, applied across a whole task instead of one acquisition (Tognazzini's "First Principles" phrasing: reduce distance, increase size, *and cut the number of targets*). Because the relation is logarithmic, deleting a target from the sequence beats moving one closer.

- **Web.** Contextual actions live on the object: row menus in the row, record actions in the detail header, not in a page-level toolbar. Order controls in the sequence users touch them so travel is monotonic. Popovers anchor to their trigger, never center-screen (Base UI gives `--transform-origin`; use it).
- **Mobile.** Sheets and menus anchor near the trigger where space allows; a bottom sheet for a context menu opened at the top of the screen is a distance regression. Never shrink spacing to shorten travel; target size and separation come first.
- **Review check.** Count the pointer trips a frequent task takes; a task that bounces between a table and a distant toolbar more than once is a finding. A popover that opens centered on screen from an edge trigger is a finding.
- **Anchor.** `shared/detail-drawer.tsx` and `shared/sticky-detail-header.tsx` keep record actions next to the record; `data-grid` row actions live in the row.

## Convention and grouping

### Jakob's Law
Users spend most of their time in other products and expect yours to work the same way. The cost of novelty is paid by every user on every visit; the benefit is paid to the designer once. This is about interaction patterns, not brand.

- **Web.** Logo top-left goes home; account menu top-right; search where the category expects it. Table conventions hold: sortable headers, checkbox column far left, row actions far right. Standard object names ("Invoice", "Client"), never coined vocabulary. A large redesign ships behind an opt-in with a sunset date.
- **Mobile.** Platform navigation: bottom tabs on iOS, the system back gesture on Android left alone. Pull to refresh, swipe-to-reveal on rows, drag-to-dismiss on sheets. Platform pickers and share sheets over custom ones.
- **Review check.** A control that does what a familiar control does but looks or behaves differently (a custom select, a non-standard sort affordance, a renamed entity) is a finding on workspace, portal, and mobile. On landing it is graded on whether the novelty earns its place.
- **Anchor.** Every list page is a `reui/data-grid` with the same header, sort, and row-action grammar; that sameness is the law working.

### Law of Similarity
Elements that look alike are read as one group with shared meaning, even at a distance. Similarity is a functional promise: two things styled alike are expected to behave alike. Movement is the strongest similarity channel and the most accessibility-sensitive.

- **Web.** Every member of an interactive family looks identical, and no non-interactive element borrows that look (a disabled button that reads as secondary is a defect). One status→color map product-wide. Links differ from body text by more than color.
- **Mobile.** Tappable rows share one affordance (chevron or press state) so users learn "tappable" in one glance. One icon family; filled and outlined styles mixed in a view imply a distinction that isn't there.
- **Review check.** Two elements styled alike with different behavior, or the same behavior styled two ways in one view, is a finding. A local status→color map is a P1 (checklist §7 row 19).
- **Anchor.** `domain/StatusBadge` is the canonical similarity contract for status; `review-checklist.md` §7 row 9 enforces one icon family per view.

### Law of Proximity
Things near each other are read as related. Proximity beats similarity of color or shape when the two conflict, and it groups more cheaply than a border. What matters is the *ratio* of inside-group space to between-group space, not an absolute pixel value.

- **Web.** The between-group gap is at least twice the within-group gap (e.g. 8px inside, 24px between). A label sits tight to its field with clearly more space before the next label. Reach for spacing before a border; a box added to fix grouping usually means the spacing is wrong. No unrelated action inside a row of related ones.
- **Mobile.** Proximity fights Fitts's on touch. Grouped controls still clear 44pt and the WCAG 24px spacing allowance. Group with section headers and vertical rhythm rather than nested cards, which eat width. A destructive action leaves the cluster it logically belongs to.
- **Review check.** Read computed gaps: if a label's distance to the field below equals its distance to the field above, it's a finding. Related items separated by more space than unrelated ones is a finding.
- **Anchor.** Mobile's bordered panels follow the web rhythm set by `shared/panel-primitives.tsx`.

### Law of Uniform Connectedness
Elements visually connected by a shared container, line, or background read as more related than anything proximity or similarity can achieve. It is the strongest grouping cue, so spend it sparingly. Every box is a promise about relatedness.

- **Web.** One level of containment; a card inside a card defeats the cue (checklist §7 row 10). Connectors in flow and pipeline views, because a graph needs explicit edges. A table gets hairline rules *or* alternating row grounds, not both. A wizard's steps join with a line so they read as a sequence, not tabs.
- **Mobile.** Full-width grouped sections with headers beat floating cards. A shared background binds a label to its control in a settings list. Vertical steppers with connectors; horizontal ones truncate.
- **Review check.** A border or tinted ground around items that do not share a purpose is a finding. Two nested containers with no elevation meaning is a finding.
- **Anchor.** The automations editor draws connectors between nodes; the workspace's card reduction is this law applied in reverse.

### Law of Prägnanz
People read an ambiguous layout as the simplest shape they can. It is the parent of the three grouping laws above and cuts both ways: if a layout admits a simpler *wrong* reading, users take it. Closure means users complete implied shapes, so a bounding box is often unnecessary.

- **Web.** Alignment and consistent spacing imply structure; the borders that structure made redundant come out. Icons stay geometric at 16–24px. A page has a small number of clearly weighted regions, not many equal panels.
- **Mobile.** Single column; multi-column at 375pt produces ambiguous groups. Whitespace and full-bleed section breaks over cards-in-cards. Tab icons with distinct silhouettes, since users identify them by outline.
- **Review check.** The squint test (checklist §1) is this law's check: if the blur groups blocks the designer didn't intend, that is a finding on spacing, not on copy.
- **Anchor.** Mobile's graphite rail frames one canvas card per screen; the flat grey canvas recedes so content forms the shape.

## Memory and emotion

### Von Restorff Effect
In a uniform field, the one item that differs is remembered. The effect needs the uniform field; five distinct items among similar ones return the field to uniform. Color alone is an unsafe channel (color-vision deficiency, sunlight); motion is a strong isolator and an accessibility problem.

- **Web.** One filled primary button per view; everything else outlined, ghost, or text. Exception rows in a table (overdue, failed) get the highlight and nothing else does. A recommended plan gets a border and a label, not a different size, face, and gradient. Distinctiveness comes from weight, position, and isolation, never a new accent (one-accent lock).
- **Mobile.** One FAB or none. One badged tab at a time where possible. Status is text, so isolation is typographic: weight and placement, not a tint. Emphasis must survive minimum brightness and direct sun.
- **Review check.** Two competing primaries in a view is a finding (checklist §1). Anything emphasized through a color outside the token roles is a P1. Emphasis carried by color alone with no shape or text pair is a finding.
- **Anchor.** `StatusBadge` reserves tint for status so it stays meaningful; `shared/prominent-status-badge.tsx` is the one sanctioned "louder" variant.

### Serial Position Effect
People recall the first and last items of a series best; the middle fades. Primacy comes from rehearsal, recency from working memory, and recency is wiped by whatever comes next. It governs recall, not scanning: on a visible list users see all of it.

- **Web.** The two most important destinations sit at the ends of a horizontal nav. A settings page brackets rarely changed options with frequently changed ones. A critical warning is never mid-body in a long modal. Onboarding leads with the strongest value and closes with the action.
- **Mobile.** In a bottom tab bar the first and last slots are both the most recalled and the most reachable for a right thumb; give them the top two modes. Sheet action lists stay short (≤6); the middle of a longer one vanishes. The final screen of a step flow restates the key fact rather than trusting recall.
- **Review check.** A nav, tab bar, menu, or action list whose first or last slot holds a low-value item while the primary sits in the middle is a finding. A destructive item first or last, adjacent to the primary, is a P2.
- **Anchor.** The glass dock puts Today first and Routes last; Money was promoted onto the dock so it isn't buried.

### Peak-End Rule
An experience is judged by its most intense moment and its ending, not by the sum of its parts (duration neglect). Negative peaks are recalled more vividly than positive ones, so the first job is finding the worst moment, not adding a celebration.

- **Web.** Map the flow and name the intended peak; spend polish there instead of evenly. Design the ending: a post-submit state that names what happened and what's next, never a redirect to a dashboard with no acknowledgement. Hunt the negative peak first (a hostile validation error, a payment failure) and make its recovery the shortest path on the screen.
- **Mobile.** Completion is confirmed by a visible state change plus haptic, not a toast that is gone by the time the user looks up. A celebration stays under ~1s, skips on repeat runs, and honors reduced motion. A failed payment is the moment the user remembers; its retry is the biggest target on the screen.
- **Review check.** A multi-step flow whose last screen is a spinner, a bare list, or a form with a fresh error is a finding (checklist §1 "End-of-flow moment"). A celebration on a 100+/day action is a motion-gate finding.
- **Anchor.** `celebrations/celebration-toast.tsx` fires on quote approved and invoice paid, the two real peaks; the org setup completion (`(onboarding)/complete-setup.tsx` on mobile) is an ending to design deliberately.

### Zeigarnik Effect
Unfinished tasks stay in memory; finished ones fade. Showing incompleteness (progress, a partly filled checklist, a peeked next row) pulls people back. The same mechanism makes a permanent "unfinished" badge feel like nagging, and fake progress destroys trust the moment it stalls.

- **Web.** Setup checklists show real counts ("3 of 6") and can be dismissed for good. Drafts save automatically and surface where the user returns (the list page, the home needs-attention rows), so the interrupted task is resumable. Counting an honestly completed step (account created) as step 1 is fine; inventing one is not.
- **Mobile.** A step counter in the header of every multi-step flow, because interruptions are constant. Scroll position and partial input restore after backgrounding. Badge an incomplete state once; repeated pushes about the same unfinished task read as harassment. Peek the next card at the fold.
- **Review check.** A multi-step flow with no position indicator is a finding. A draft saved silently, with nowhere to resume it, is a finding. A progress bar whose steps don't map to real work is a P1.
- **Anchor.** `nav-getting-started.tsx` on web and `SetupPrompt.tsx` on mobile are the resumable-setup surfaces; the home page's needs-attention rows are where unfinished work resurfaces.

## Timing

### Doherty Threshold
Productivity climbs when the system answers in under 400ms, so neither side waits. That figure is a productivity ceiling from a 1982 IBM study, not a perceptual limit; Nielsen's separate limits are 0.1s (feels instant), 1s (flow of thought holds), 10s (attention ends). Skeletons and optimistic UI are practitioner tactics that stand in for real speed.

- **Web.** Acknowledge every click within 100ms with a state change. Filter, sort, and search-as-you-type answer under 400ms. Past ~300ms show a skeleton shaped like the final layout (house threshold, checklist §4); past 1s a determinate indicator; past 10s percent-done and a cancel. Optimistic updates where rollback is safe, never for money movement.
- **Mobile.** Assume a poor network. Render the cached last-known list before the fetch resolves. Every tap gets immediate visual feedback, since touch has no hover. Inline spinners inside the tapped control over full-screen overlays. Queue writes offline and reconcile.
- **Review check.** A mutation with no immediate state change on the trigger is a finding. A generic spinner where a layout-shaped skeleton belongs is a P2. Optimistic UI on a payment or a send is a P1.
- **Anchor.** `chart-skeleton.tsx` and `stat-card-skeleton.tsx` are the shaped-skeleton pattern; Convex reactivity is what makes "fast by feel" (charter principle 3) cheap.

### Parkinson's Law
Work expands to fill the time available. In UX it is an expectation analogy, not a finding: if the user expects ten minutes and it takes three, the surplus reads as a win. So set the expectation, then beat it. A countdown is only legitimate where the deadline is real.

- **Web.** Autofill everything already known: org defaults on new records, address lookup, the client's last-used terms. State a time estimate before a long form and beat it. Optional fields leave the required path. No fake urgency.
- **Mobile.** Platform autofill for address, card, and one-time codes is the single biggest time cut on a phone. Shortest viable path first (Apple Pay / Google Pay before a card form). Step counts bound the remaining work. No artificial delays; on a phone they read as a broken app.
- **Review check.** A form that asks for a value the org record already holds is a finding. A countdown or "limited time" without a real deadline is a P1 dark pattern.
- **Anchor.** `AddressAutocomplete.native.tsx` removes the typing; the mobile `EditableField` pattern edits one value in place instead of reopening a whole form.

## Robustness

### Postel's Law
Be liberal in what you accept, conservative in what you send. The asymmetry is the point. Tolerance on input, strictness on output. Tolerance means normalizing to spec and *showing* the user what you stored, never guessing silently. (The IETF critique that tolerance decays protocols is about machine boundaries; humans can't be told to reread the spec.)

- **Web.** Accept phone numbers, money, dates, and addresses in any reasonable human form; strip and normalize, then reformat the field to show the stored value. Trim whitespace on email and code fields. Validate on blur and submit, not per keystroke, and never block typing a character you could normalize. Emit strict: ISO dates in exports, stable IDs, canonical money.
- **Mobile.** Correct `inputMode` / `keyboardType` and autocomplete hints so the right keyboard appears and malformed input never happens. Accept pasted values with their formatting. Typed input survives a validation failure and a rotation. Any reasonable gesture for an action, not one exact motion.
- **Review check.** A field that rejects a value the user can plainly read as valid is a finding (checklist §4 "Input tolerance"). A normalizer that stores a transformed value without reflecting it in the field is a P2. A tolerant *export* is a P1.
- **Anchor.** `lib/phone.ts` normalizes on the way in; `formatCurrency` / `formatMoney` are the strict output side.

---

## Tensions

- **Von Restorff vs Similarity and Jakob's.** Isolation needs a uniform field; consistency creates it. One deliberate deviation per view, everything else consistent. On OneTool the deviation is never a new color.
- **Proximity vs Fitts's on touch.** Grouping wants controls tight; fingers want 44pt and separation. Group with headers and shared ground, separate with padding. Never buy grouping with spacing you owe to the thumb.
- **Hick's vs Tesler's and progressive disclosure.** Cutting on-screen options shortens the decision; hiding the one the user needs turns a decision into a hunt. Disclose by measured frequency, at most two levels deep.
- **Occam's vs Tesler's.** The razor removes; Tesler says the complexity relocates. A removal only counts as a win when code absorbed the work.
- **Postel's vs strict validation.** Liberal at the human boundary with visible normalization; strict at every machine boundary (exports, APIs, money).
- **Fitts's edges vs touch.** Edge-pin on desktop; center-weight and bottom-anchor on mobile. Thumb-arc heatmaps overstate the periphery problem (Hoober's tap data shows people re-grip for corners), so treat them as a rough guide.
- **Doherty and Parkinson vs honesty.** Both can be gamed into manipulation (fake delay to imply thoroughness, fake urgency to compress time). Be actually fast, set expectations honestly, and reserve deliberate delay for when the user needs time to read what happened.
- **Miller's vs what it gets cited for.** It is about what users hold in memory. Use it for cross-step recall; use Hick's or Pareto for what is visible on screen.

## Sources

Read for this module: lawsofux.com entries for the 18 canonical laws (Prägnanz resolves only at the umlaut URL); nngroup.com on Fitts's law, response-time limits, the Peak-End rule, Gestalt proximity, and progressive disclosure; Tognazzini's "First Principles of Interaction Design" (asktog.com) for target distance; WCAG 2.2 SC 2.5.8 for the 24px floor; Hoober's touch studies on uxmatters.com; the IETF draft "The Harmful Consequences of the Robustness Principle" for the Postel's critique. The 44×44pt and 48×48dp figures are Apple HIG and Material guidance respectively, attributed from indexed summaries rather than fetched pages; Cowan's ~4-chunk working-memory figure is cited via Laws of UX, not read directly.
