---
name: pr-triage
description: Pull all review comments from a GitHub PR (CodeRabbit, Greptile, Codex, humans), validate each finding against the actual codebase, fix the confirmed ones, and dismiss the invalid ones with reasons. Use whenever the user gives a PR number/URL and asks to "pull the comments", "assess the review feedback", "check what coderabbit/greptile/codex found", "triage the PR comments", or asks whether review-bot findings are valid. Also use for pasted secondary-review output from another AI (e.g. "Codex found these issues - are they real?").
---

# PR Triage

Review bots are high-recall, low-precision: they surface real bugs alongside confidently-worded noise. The job is to be the judgment layer — verify every finding against the code before acting, so real issues get fixed and noise gets dismissed with a documented reason instead of silently applied or ignored.

## Workflow

### 1. Collect the findings

For a PR number/URL, pull **both** comment streams — bots post to each differently:

```bash
gh pr view <N> --comments                                  # issue-level comments
gh api repos/<owner>/<repo>/pulls/<N>/comments --paginate  # inline review comments (file + line)
gh api repos/<owner>/<repo>/pulls/<N>/reviews --paginate   # review bodies (CodeRabbit summaries live here)
```

For pasted output from a secondary AI review (Codex, etc.), parse the findings directly from the paste.

Deduplicate — bots often repeat the same finding as both a summary bullet and an inline comment. Note which findings are already marked resolved/outdated on the PR and skip those.

### 2. Validate each finding against the codebase

This is the step that matters. For every finding, open the cited file at the cited lines and check the claim against what the code actually does — trace callers, types, and framework behavior as needed. Ground in docs or online research when the finding hinges on library behavior. Classify:

- **Confirmed** — the issue is real as described (or real but mis-described; note the correction).
- **Invalid** — the bot misread the code, the concern doesn't apply here, or it contradicts a deliberate project convention. Record a one-line reason.
- **Uncertain / judgment call** — plausible but depends on product intent or tradeoffs. Don't guess; queue it for the user.

Never apply a suggested diff verbatim without validating it — bot patches frequently reference stale line numbers or break neighboring code.

### 3. Fix the confirmed findings

Check git state first: if the PR branch isn't checked out, say so and confirm before switching (never switch branches over uncommitted work without stating what's uncommitted). Apply fixes for confirmed findings, matching the surrounding code style. Run the build after fixing. Commit with a message referencing the review pass. **Do not push or open PRs** — the user handles that. Do not re-run the review bot to verify the fixes.

### 4. Report

End with a table:

| # | Finding | Source | Verdict | Action |
|---|---------|--------|---------|--------|
| 1 | Race in webhook handler (`webhooks.ts:88`) | CodeRabbit | Confirmed | Fixed — added idempotency key |
| 2 | "Unused import" | Greptile | Invalid | Used via type-only re-export |
| 3 | Suggests stricter rate limit | Codex | Judgment call | Needs your call — product tradeoff |

Follow with one line per judgment-call item explaining the tradeoff so the user can decide quickly.
