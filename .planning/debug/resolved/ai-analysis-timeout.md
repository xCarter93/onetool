---
status: resolved
trigger: "AI Column Analysis Stuck in Loading State - CSV import wizard AI analysis fires but never completes"
created: 2026-03-14T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: The Mastra agent receives pre-parsed headers+sampleRows in the prompt text, but its parseCsv tool expects raw CSV content as input. The agent calls parseCsv with the CSV sample string from the prompt, but the core issue is the agent architecture forces a multi-tool LLM loop (parseCsv -> mapSchema -> validateData) with maxSteps=10, causing slow completion. Additionally, the parseCsv tool is redundant since the frontend already parsed the CSV - the agent re-parses what was already parsed.
test: Trace the flow from frontend to API to agent to identify where time is spent
expecting: Agent spends most time in LLM reasoning loops between tool calls
next_action: Document root cause findings and multiple contributing issues

## Symptoms

expected: AI analysis completes within a few seconds after CSV upload
actual: Loading state persists for minutes, analysis never completes or takes extremely long
errors: No specific error messages reported - silent hang
reproduction: Upload any CSV file on /clients/import wizard
started: Unclear - may have always been slow

## Eliminated

- hypothesis: Frontend error handling swallows errors silently
  evidence: Frontend has proper try/catch in handleFileSelect (line 131), sets isAnalyzing=false on error, and shows toast error. Error handling is adequate.
  timestamp: 2026-03-14

- hypothesis: Request payload is too large (sending full CSV content)
  evidence: Frontend correctly sends only headers + 5 sample rows (line 103-111 of use-import-wizard.ts), not the full file content
  timestamp: 2026-03-14

## Evidence

- timestamp: 2026-03-14
  checked: API route (analyze-csv/route.ts)
  found: Route calls agent.generate(prompt, { maxSteps: 10 }) which triggers a multi-step agentic loop. The agent must call 3 tools sequentially (parseCsv, mapSchema, validateData), each requiring an LLM round-trip to decide the next tool call.
  implication: With gpt-4o and 3 tool calls + final synthesis, this is minimum 4 LLM round-trips. Each round-trip is 2-5+ seconds, totaling 10-20+ seconds minimum. Under load or with API latency, this easily exceeds 60 seconds.

- timestamp: 2026-03-14
  checked: parseCsv tool (parse-csv-tool.ts)
  found: The parseCsv tool expects raw csvContent string input and re-parses it with PapaParse. But the frontend ALREADY parsed the CSV with parseCsvData() (transform-csv.ts) to extract headers and sampleRows. The API route then reconstructs a CSV string from headers+sampleRows on lines 56-69, just so the agent can ask the parseCsv tool to parse it again.
  implication: The parseCsv tool is completely redundant. The frontend already has the parsed data. This adds an unnecessary LLM round-trip + tool execution.

- timestamp: 2026-03-14
  checked: Agent tool flow architecture
  found: The agent is configured with 3 tools and instructions to call them sequentially (parse -> map -> validate). Each tool call requires: (1) LLM decides to call tool, (2) tool executes, (3) LLM processes result, (4) LLM decides next tool. This is 4 LLM inference calls minimum for a task that could be done deterministically.
  implication: The mapSchema and validateData tools contain purely deterministic logic (string matching, schema lookup). They don't need AI at all. The AI is only useful for the initial column-to-field mapping intelligence, but even that is handled deterministically in mapSchemaTool.

- timestamp: 2026-03-14
  checked: Frontend timeout/abort handling
  found: The fetch call in handleFileSelect (line 104) has NO AbortController, NO timeout, and NO client-side deadline. The maxDuration=60 on the API route is the only timeout, and if the Vercel function times out, the frontend gets a network error but could wait indefinitely for the response.
  implication: No client-side timeout means the loading spinner can persist indefinitely if the server hangs or the connection stalls.

- timestamp: 2026-03-14
  checked: Mastra version and agent.generate behavior
  found: Using @mastra/core@1.0.0-beta.21 (beta). The agent.generate() with maxSteps=10 allows up to 10 tool-call round-trips. With gpt-4o, each step involves sending the full conversation (growing context) to OpenAI. If the agent gets confused or retries tools, this compounds.
  implication: Beta library + unbounded retries + growing context = unpredictable latency. The agent might call parseCsv multiple times or get stuck in reasoning loops.

- timestamp: 2026-03-14
  checked: Tool result extraction in API route (lines 80-118)
  found: The route looks for toolResults with specific payload.toolName values ("parseCsv", "mapSchema", "validateData"). If the agent doesn't call a tool or calls it with a different internal name, the result is silently undefined and the response returns empty/default data. No error is thrown.
  implication: If the Mastra beta changes tool result format, or if the agent skips a tool, the API returns a "successful" but empty result that looks broken to the user.

## Resolution

root_cause: Multiple compounding issues cause the AI analysis to hang or take excessively long:

**PRIMARY**: The architecture uses an LLM agentic loop (Mastra agent.generate with maxSteps=10) for what is fundamentally a deterministic task. The agent must make 4+ LLM round-trips to GPT-4o (decide to call parseCsv -> process result -> decide to call mapSchema -> process result -> decide to call validateData -> process result -> synthesize final answer). Each round-trip is 2-5+ seconds, with growing context on each step. Total: 15-40+ seconds under good conditions, easily timing out under load.

**SECONDARY**: The parseCsv tool is entirely redundant - the frontend already parses the CSV and sends structured headers + sampleRows. The API route reconstructs CSV text just so the agent can re-parse it.

**TERTIARY**: No client-side timeout or AbortController on the fetch call, so the loading spinner persists indefinitely.

**QUATERNARY**: Tool result extraction uses fragile name matching that may silently fail with Mastra beta version changes.

fix:
verification:
files_changed: []
