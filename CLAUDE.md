@AGENTS.md

## Claude Code only

- **Subagents.** Pass `model: "opus"` on every Agent and Workflow spawn. Forks inherit the parent model, so use them only when the full context is the point.
- **Plan check inside Claude.** On an Opus session, call the advisor before the first edit of gated work. On a Fable session the advisor is the same model, so spawn one Opus reviewer and give it the plan file.
- **Reaching GPT Sol.** In T3 Code, call `orchestrator_capabilities`, then `delegate_task` to the Codex provider with the latest Sol and `reasoningEffort: "high"`. In the CLI, run `codex exec -m <latest sol> -s read-only -c model_reasoning_effort="high" -o <file> "<brief>"`.
