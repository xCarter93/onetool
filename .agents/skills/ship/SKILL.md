---
name: ship
description: Close out a completed piece of work in one step - run the project build, conditionally run a CodeRabbit review, flag whether a Convex deploy is needed, update the active PRD's progress notes, and commit. Use whenever the user says /ship, "wrap this up", "close this out", "build and commit", "run the build then commit", or finishes a feature/fix and wants the standard finalize sequence. Never opens PRs or pushes.
---

# Ship

The standard close-out sequence for a completed change. Replaces the manual chain of "run the build" → "run coderabbit" → "commit these changes" with one command. The steps run in a fixed order because each one gates the next: no point reviewing code that doesn't build, and nothing gets committed until review findings are resolved.

## Sequence

### 1. Take stock of the diff

Run `git status` and `git diff --stat` first. Everything downstream (review decision, deploy flag, commit message) is based on what actually changed, not on what the conversation says changed. If the working tree is clean, say so and stop. If there are changes unrelated to the work just finished, list them and ask before bundling them into the commit.

### 2. Build

Run the project's build from the repo root (`pnpm build` in pnpm/turborepo monorepos — check `package.json` scripts if unsure). A passing typecheck or test run is NOT a substitute; the build catches things they don't (env validation, Next.js compile, turbo task deps).

If the build fails: fix the errors, rebuild, and only then continue. If the failure is unrelated to the current change, report it and ask whether to proceed.

### 3. CodeRabbit review — conditional

Decide from the diff, and say which way you decided and why:

- **Skip** when the change is trivial or contained: docs-only, single-file cosmetic/styling tweaks, a clean removal, config-only, or a few lines with no logic change.
- **Run** (`coderabbit` CLI on the changed files, excluding markdown files) for anything with real logic: new features, bug fixes touching behavior, backend/schema changes, multi-file refactors.

If the user already said "no need for coderabbit" or "skip the review" in this conversation, honor that. Apply fixes for valid findings, dismiss invalid ones with a one-line reason each. Do **not** re-run CodeRabbit after applying fixes to verify — one pass only.

### 4. Convex deploy flag

If the diff touches `packages/backend/` (or any `convex/` directory), flag it explicitly in the final summary: **"Backend changed — Convex deploy needed (`cd packages/backend && pnpm deploy`)"**. TestFlight/production builds hit production Convex, so a missed deploy means shipped frontend code calling functions that don't exist yet. Don't run the deploy yourself unless asked.

### 5. PRD / planning-doc update

If this session's work is tracked in a PRD or phase plan (a `PRD-*.md`, `.planning/` doc, or similar referenced earlier in the conversation), update its progress notes: mark the completed slice/task, note anything deferred, and record decisions a fresh session would need to resume. Skip silently if no tracked doc exists. Do not commit `.planning/` files if they're gitignored.

### 6. Commit

Stage the relevant files and commit with a conventional message (`feat(scope): ...`, `fix(scope): ...`) describing the change. Then stop.

- **Never push, never create a branch, never open a PR.** The user handles all of that.
- If on the default branch and the repo convention is to work on `staging`/feature branches, mention it rather than branching yourself.

## Final report

End with a short summary: build result, review ran-or-skipped (and why), findings fixed/dismissed, Convex deploy needed yes/no, PRD updated yes/no, and the commit hash + message.
