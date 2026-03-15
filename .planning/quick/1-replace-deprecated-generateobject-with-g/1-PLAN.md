---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/mastra/tools/map-schema-tool.ts
  - apps/web/src/mastra/tools/map-schema-tool.test.ts
  - apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx
autonomous: true
requirements: [QUICK-01]

must_haves:
  truths:
    - "mapSchemaTool uses generateText with Output.object instead of deprecated generateObject"
    - "All 9 existing map-schema-tool tests pass with updated mocks"
    - "Preview table scrolls horizontally within its container and does not overflow the viewport"
  artifacts:
    - path: "apps/web/src/mastra/tools/map-schema-tool.ts"
      provides: "AI SDK 6.0 generateText + Output.object pattern"
      contains: "generateText"
    - path: "apps/web/src/mastra/tools/map-schema-tool.test.ts"
      provides: "Updated mocks for generateText instead of generateObject"
      contains: "generateText"
    - path: "apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx"
      provides: "Bounded table container preventing horizontal overflow"
      contains: "min-w-0"
  key_links:
    - from: "apps/web/src/mastra/tools/map-schema-tool.ts"
      to: "ai"
      via: "import { generateText, Output } from 'ai'"
      pattern: "generateText.*Output\\.object"
---

<objective>
Replace the deprecated `generateObject` AI SDK call with the new `generateText` + `Output.object` pattern (AI SDK 6.0), update all test mocks accordingly, and fix the preview table horizontal overflow in the CSV import wizard.

Purpose: Eliminate deprecation warnings from AI SDK 6.0 migration and fix a UI bug where the preview table extends past the viewport edge.
Output: Updated map-schema-tool using current API, passing tests, and a properly bounded preview table.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/mastra/tools/map-schema-tool.ts
@apps/web/src/mastra/tools/map-schema-tool.test.ts
@apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate map-schema-tool from generateObject to generateText + Output.object</name>
  <files>apps/web/src/mastra/tools/map-schema-tool.ts, apps/web/src/mastra/tools/map-schema-tool.test.ts</files>
  <action>
In `map-schema-tool.ts`:
1. Change import on line 2 from `import { generateObject } from "ai"` to `import { generateText, Output } from "ai"`
2. Replace the `generateObject` call (lines 196-201) with:
   ```typescript
   const { output } = await generateText({
     model: openai("gpt-5-nano"),
     output: Output.object({ schema: llmMappingSchema }),
     prompt: buildMappingPrompt(entityType, headers, sampleRows, schema),
     abortSignal: AbortSignal.timeout(30_000),
   });
   ```
3. Handle nullable output: after the generateText call, add a null check:
   ```typescript
   if (!output) {
     throw new Error("LLM returned no structured output");
   }
   ```
4. On line 203, change `postProcessMappings(object, ...)` to `postProcessMappings(output, ...)`

In `map-schema-tool.test.ts`:
1. Change the vi.mock on line 4-6 from mocking `generateObject` to mocking `generateText` and `Output`:
   ```typescript
   vi.mock("ai", () => ({
     generateText: vi.fn(),
     Output: { object: vi.fn((opts: unknown) => opts) },
   }));
   ```
2. Change import on line 12 from `import { generateObject } from "ai"` to `import { generateText } from "ai"`
3. Change line 15 from `const mockedGenerateObject = vi.mocked(generateObject)` to `const mockedGenerateText = vi.mocked(generateText)`
4. Update ALL mock calls throughout the file: replace `mockedGenerateObject.mockResolvedValueOnce({ object: ... } as never)` with `mockedGenerateText.mockResolvedValueOnce({ output: ... } as never)` — the key changes from `object` to `output` in the resolved value
5. Update ALL mock rejection calls: replace `mockedGenerateObject.mockRejectedValueOnce(...)` with `mockedGenerateText.mockRejectedValueOnce(...)`
6. In Test 6 (line 290-303), update `mockedGenerateObject` references to `mockedGenerateText` and update the assertion to check `mockedGenerateText` was called
  </action>
  <verify>
    <automated>cd /Users/patrickcarter/CodingProjects/WebDevProjects/NextJSProjects/nextjs-onetool/apps/web && pnpm vitest run src/mastra/tools/map-schema-tool.test.ts</automated>
  </verify>
  <done>All 9 map-schema-tool tests pass using generateText + Output.object pattern. No references to generateObject remain in either file.</done>
</task>

<task type="auto">
  <name>Task 2: Fix preview table horizontal overflow</name>
  <files>apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx</files>
  <action>
The table overflows because the outer `<div className="space-y-6">` (line 97) has no width constraint, so the `overflow-x-auto` child has no bounded parent to scroll within.

Fix: Add `min-w-0` to the outer container div on line 97, changing:
```
<div className="space-y-6">
```
to:
```
<div className="space-y-6 min-w-0">
```

The `min-w-0` breaks the default `min-width: auto` on flex/grid children, allowing the child's `overflow-x-auto` to actually trigger scrolling within the parent's bounds instead of expanding the parent.

This is the standard Tailwind pattern for fixing table overflow in flex/grid layouts. No other changes needed — the existing `overflow-x-auto rounded-lg border` on line 123 already handles the scroll behavior once its parent is properly bounded.
  </action>
  <verify>
    <automated>cd /Users/patrickcarter/CodingProjects/WebDevProjects/NextJSProjects/nextjs-onetool && grep -n "min-w-0" apps/web/src/app/\(workspace\)/clients/import/components/step-preview-import.tsx</automated>
  </verify>
  <done>The preview table container has `min-w-0` applied, preventing horizontal overflow past the viewport edge. Table scrolls horizontally within its bounded container.</done>
</task>

</tasks>

<verification>
1. All 9 map-schema-tool tests pass
2. No references to `generateObject` in map-schema-tool.ts or map-schema-tool.test.ts
3. `min-w-0` present on the outer container in step-preview-import.tsx
4. `pnpm build` completes without TypeScript errors in the affected files
</verification>

<success_criteria>
- mapSchemaTool uses `generateText` with `Output.object({ schema: llmMappingSchema })` pattern
- Null output from generateText is handled (throws, caught by existing try/catch, triggers llmFailed fallback)
- All 9 existing tests pass with updated mocks (generateText instead of generateObject)
- Preview table in CSV import step 4 scrolls horizontally within parent bounds
</success_criteria>

<output>
After completion, create `.planning/quick/1-replace-deprecated-generateobject-with-g/1-SUMMARY.md`
</output>
