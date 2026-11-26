---
name: frontend-skill
description: Use when creating or modifying UI components in OneTool's web or mobile apps and you need the component-location and styling conventions — where components live, which primitives to import, and how mobile mirrors web.
---

# Frontend Conventions

## Web (Next.js)

Authoritative guidance moved to the design system charter:
**read `.agents/design-sources/ONETOOL-DESIGN.md`** — component acquisition ladder
(`ui/` → `reui/` → `domain/` → `shared/`), token rules, motion constants, quality floor.
For workflows, use the `design-new` / `design-improve` / `design-review` skills.

Key facts (charter has the rest):

- There is **no `ui/styled/` layer and no `Styled*` components on web** — that system was
  deleted in the ReUI rebuild and its imports are ESLint-blocked. Import base primitives
  (`@/components/ui/button`, `@/components/ui/badge`, …) or `@/components/domain/` wrappers
  (StatusBadge, EmptyState, SegmentedControl) directly.
- `cn()` from `@/lib/utils` for class merging. `lib/styling.ts` no longer exists.
- Promote a component to `domain/` or `shared/` when used 3+ times across features.

## Mobile (React Native / Expo)

- Theme tokens: `apps/mobile/lib/theme.ts` (`colors`, `spacing`, `radius`, `fontFamily`,
  `useTokens()`). Use theme tokens for all styling; `StyleSheet.create()`, not classNames.
- `apps/mobile/components/styled/` still exists on mobile (e.g. `StyledButton` with web-style
  intent variants and `onPress`); mobile-specific components live in `apps/mobile/components/`.
- Mirror web APIs where components exist on both platforms (`onPress` vs `onClick`, same
  `intent`/`size` prop vocabulary).
- RN shadow recipe: `shadowColor "#000"`, offset `{0,1}`, opacity `0.05`, radius `2`,
  `elevation: 1` for Android.
- Gotchas (memory-verified): never name a prop `ref`; RN won't hit-test outside parent
  bounds; set-state-in-effect lints as ERROR — derive state at render; task/project dates are
  UTC-midnight — bucket and render in UTC.

## Both platforms

- Intent-based variants (`primary/secondary/success/destructive/warning/outline/plain`), never
  arbitrary colors.
- Money via `apps/web/src/lib/money.ts` `formatCurrency` / `apps/mobile/lib/format.ts` — local
  currency formatters are lint-blocked.
