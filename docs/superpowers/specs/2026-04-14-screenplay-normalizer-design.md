# Screenplay Standardization Tool Design

**Date:** 2026-04-14

**Status:** Proposed

**Owner:** Codex

## Goal

Build a screenplay standardization tool for `moyin-creator` that converts messy raw scripts into a canonical screenplay format that the existing import parser can reliably consume, then validates the result and produces a machine-readable and user-readable recognition report.

## Why This Exists

The current import chain is:

1. `preprocessLineBreaks`
2. `analyzeScriptStructureWithAI` or `normalizeScriptFormat`
3. `parseFullScript`
4. persist `projectBackground`, `episodeRawScripts`, `scriptData`, `metadataMarkdown`, `seriesMeta`

This flow is useful for lightly malformed input, but it does not produce a stable canonical import artifact and it does not expose detailed diagnostics when recognition partially fails.

As a result:

- structurally noisy scripts silently degrade into low-quality parsed data
- parser assumptions around scene headers, dialogue lines, and character bios leak into user-facing quality problems
- bad import data contaminates downstream character calibration, scene calibration, and `SeriesMeta`

## Product Definition

This is not a generic text beautifier.

This tool is a **script import enhancer** with four responsibilities:

1. segment raw screenplay text into meaningful structural blocks
2. rebuild those blocks into a canonical screenplay document optimized for the current parser
3. run parser-based acceptance checks on the canonical result
4. preserve traceability from source text to canonical output and diagnostics

## Recommendation

Implement the tool as a **core service first**, then expose it inside the import panel.

This gives us:

- a reusable pure service for batch regression tests
- a stable intermediate artifact for debugging
- a clean upgrade path into the import UI
- minimal disruption to the existing parser and downstream stores

## Alternatives Considered

### Option A: Expand the existing parser only

Pros:

- fewer new concepts
- no new intermediate model

Cons:

- parser complexity grows quickly
- diagnostics remain weak
- hard to explain or debug transformations
- does not create a stable import artifact

### Option B: Replace the parser with an LLM-first structured parser

Pros:

- broad tolerance for messy input
- can infer missing structure

Cons:

- unstable output contracts
- harder to regression test
- expensive and slower
- weak determinism for import-critical paths

### Option C: Add a canonicalization layer before the parser

Pros:

- deterministic core
- preserves the existing parser investment
- easy to batch test
- straightforward to surface diagnostics

Cons:

- adds intermediate types and service complexity
- still needs heuristics for hard cases

**Recommended:** Option C

## Scope

### In Scope

- canonical screenplay generation from raw text
- structural segmentation of title, outline, bios, episodes, scenes, dialogue, actions, subtitles, notes
- alias normalization for import-time entity consistency
- parser round-trip validation
- import diagnostics with severity levels
- persistence of canonical text and report
- import panel preview for canonical output and warnings

### Out of Scope for MVP

- replacing the existing parser
- fully AI-driven screenplay reconstruction
- OCR-specific image preprocessing
- manual conflict resolution UI beyond a readable warning list
- automatic edits to downstream calibrated characters or scenes after import

## Success Criteria

The MVP is successful when:

1. common real-world malformed scripts can be converted into a canonical format accepted by the current parser
2. the tool explicitly reports silent degradations that are currently hidden
3. import users can inspect the canonical screenplay before final import
4. the system persists enough trace and report data to debug import failures later

## User-Facing Workflow

### New Import Flow

1. user pastes raw screenplay text
2. system runs screenplay standardization
3. system shows:
   - canonical screenplay preview
   - recognition summary
   - warnings and fatal issues
4. if there are no fatal issues, user confirms import
5. system parses the canonical screenplay and persists both canonical and parsed artifacts

### Fallback Behavior

- if standardization fails unexpectedly, the system falls back to the current import path
- the fallback path must still emit a warning that enhanced diagnostics were unavailable

## Architecture

Add a new service layer between `script-normalizer.ts` and `episode-parser.ts`.

### Proposed Pipeline

`raw text -> segment -> canonicalize -> validate with parser -> diagnostics -> optional import`

### New Modules

#### `src/lib/script/script-standardizer.ts`

Primary orchestration service.

Responsibilities:

- accept raw script text
- build segmentation model
- canonicalize blocks
- call existing parser on canonical output
- compute recognition report
- return a single structured result

#### `src/lib/script/script-segmentation.ts`

Loose structure detector.

Responsibilities:

- identify title, outline, character bios, episode markers, scene candidates
- classify lines and paragraphs into probable block kinds
- tolerate malformed numbering and line breaks

#### `src/lib/script/script-canonicalizer.ts`

Canonical screenplay renderer.

Responsibilities:

- render segmented blocks into parser-friendly format
- split compact bios
- split long dialogue paragraphs into individual speaker lines when confidence is sufficient
- normalize scene headers to `1-1 日 内 地点`
- emit alias map and transformation trace

#### `src/lib/script/script-diagnostics.ts`

Validation and reporting utilities.

Responsibilities:

- compute counts for episodes, scenes, characters, dialogues
- detect silent degradations
- classify severity
- create UI-friendly and test-friendly diagnostics

## Data Model

### `CanonicalScriptDocument`

```ts
export interface CanonicalScriptDocument {
  rawText: string;
  canonicalText: string;
  blocks: CanonicalBlock[];
  aliasMap: Record<string, string>;
  traces: NormalizationTrace[];
  diagnostics: ScriptDiagnostic[];
  stats: CanonicalStats;
}
```

### `CanonicalBlock`

```ts
export interface CanonicalBlock {
  id: string;
  type:
    | 'title'
    | 'outline'
    | 'character_bio'
    | 'episode'
    | 'scene_header'
    | 'character_line'
    | 'dialogue'
    | 'action'
    | 'subtitle'
    | 'note'
    | 'unknown';
  sourceText: string;
  normalizedText: string;
  sourceStart: number;
  sourceEnd: number;
  confidence: number;
  meta?: Record<string, string | number | boolean>;
}
```

### `NormalizationTrace`

```ts
export interface NormalizationTrace {
  id: string;
  blockId?: string;
  operation:
    | 'insert_marker'
    | 'split_paragraph'
    | 'normalize_scene_header'
    | 'split_character_bios'
    | 'normalize_alias'
    | 'reclassify_block';
  before: string;
  after: string;
  reason: string;
}
```

### `ScriptDiagnostic`

```ts
export interface ScriptDiagnostic {
  id: string;
  severity: 'fatal' | 'high' | 'medium' | 'low' | 'info';
  code: string;
  message: string;
  sourceStart?: number;
  sourceEnd?: number;
  canonicalStart?: number;
  canonicalEnd?: number;
  suggestedFix?: string;
}
```

### `StandardizeScriptResult`

```ts
export interface StandardizeScriptResult {
  success: boolean;
  document: CanonicalScriptDocument;
  parseResult?: {
    background: ProjectBackground;
    episodes: EpisodeRawScript[];
    scriptData: ScriptData;
  };
  hasFatalIssues: boolean;
}
```

## Canonicalization Rules

### Title

- always render as `《标题》`
- if no title is found, use `《未命名剧本》` and emit a high-severity warning

### Outline

- always render as:

```text
大纲：
<text>
```

- if missing, keep section present and empty only when we truly cannot infer content

### Character Bios

- always render as:

```text
人物小传：
角色名（年龄）：身份，性格，关键特征
```

- compact same-line bios must be split into one role per line
- suspected merged bios must emit diagnostics

### Episode Marker

- normalize all accepted variants to:

```text
第X集：标题
```

- if none found, create `第1集：未命名` and emit a high-severity warning

### Scene Header

- canonical target is:

```text
1-1 日 内 地点
```

- accepted loose inputs for normalization:
  - `第一场`
  - `场景一`
  - `1）`
  - `外 日 学校操场`
  - `日 外 学校操场`
  - `1-1 学校操场 日 外`
- if numbering is missing, generate sequential scene numbers
- if time or interior/exterior is missing, infer only when confidence is high; otherwise use defaults and emit warnings

### Character Line

- canonical target is:

```text
人物：角色A、角色B
```

- if we can infer scene participants from dense dialogue, generate this line

### Dialogue

- canonical target is:

```text
角色名：（状态）台词
```

- one speaker per line
- if a paragraph contains multiple speakers, split only when separator confidence is sufficient
- otherwise preserve as note plus emit a warning

### Action

- canonical target is:

```text
△动作描写
```

- narrative non-dialogue scene text becomes action lines

### Subtitle and Notes

- subtitles and transitions are preserved as bracketed lines such as `【字幕】`
- unsupported structural annotations are retained rather than dropped

## Diagnostics Model

### Fatal

- no episodes recognized after canonicalization
- scene extraction collapses an entire multi-scene episode into a single synthetic scene
- canonical text cannot be parsed by the existing parser

### High

- missing or synthetic episode markers
- multiple character bios merged into one
- scene header normalization required low-confidence assumptions
- dialogue extraction rate far below expected for text containing many colons or quote markers

### Medium

- alias collisions
- inferred participant lists
- ambiguous subtitle versus note classification

### Low

- punctuation normalization
- markdown cleanup
- full-width versus half-width fixes

## Persistence Changes

Add new fields to the script store:

```ts
standardizedScript?: string;
standardizationReport?: CanonicalScriptDocument;
standardizationGeneratedAt?: number;
```

Rationale:

- preserve canonical import artifact
- support later debugging
- avoid losing the exact text that the parser consumed

The existing `rawScript` field must continue to preserve the original user input.

## Integration Points

### `full-script-service.ts`

Current behavior:

- preprocess raw text
- normalize raw text
- parse normalized text
- persist parsed results

New behavior:

1. call `standardizeScriptForImport`
2. if `hasFatalIssues`, return a failed import result plus report
3. otherwise parse the `canonicalText`
4. persist raw text, canonical text, diagnostics report, and parsed results

### `script-input.tsx`

Add a pre-import preview surface:

- button remains `导入完整剧本`
- before committing parsed data, show:
  - canonical screenplay preview
  - diagnostics summary
  - counts: episodes, scenes, characters, dialogues
  - fatal/high warnings

MVP UI can be a lightweight expandable panel instead of a new full-screen workflow.

## Testing Strategy

### Unit Tests

Add tests for:

- compact bio splitting
- malformed scene header normalization
- multi-speaker paragraph handling
- alias normalization
- silent degradation detection

### Snapshot Tests

Use realistic raw scripts and verify:

- canonical output text
- diagnostics list
- parser round-trip counts

### Regression Fixtures

Add fixtures for:

- Word/WeChat copy-paste format
- continuous same-line character bios
- `第一场/场景一` style scene headers
- reversed `外 日` and `日 外`
- scene header containing participant noise

## MVP Milestones

### Milestone 1: Core Service

- add types
- add segmentation and canonicalization service
- produce canonical text and diagnostics
- cover with unit tests

### Milestone 2: Parser Round-Trip Validation

- run parser on canonical text
- compute report and fatal issues
- add regression fixtures

### Milestone 3: Import Panel Integration

- preview canonical text
- surface diagnostics
- persist standardization result

## Risks

### Over-normalization

The tool might confidently rewrite text incorrectly.

Mitigation:

- preserve source spans
- prefer warnings over unsafe edits
- retain original raw script

### Ambiguous Dialogue Splits

Dense paragraphs may not be safely separable.

Mitigation:

- require strong split confidence
- degrade to warnings instead of forced segmentation

### Store Bloat

Persisting canonical documents may increase project payload size.

Mitigation:

- keep traces concise
- optionally cap large trace bodies later if needed

## Open Decisions Resolved for MVP

- Use deterministic service-first architecture
- Keep existing parser as the source of truth for downstream structures
- Persist both raw and canonical script
- Ship warning list before building any manual correction workflow

## Implementation Readiness

This spec is sized for one implementation plan and one MVP feature stream.

The smallest useful release is:

1. core standardizer service
2. diagnostics model
3. import preview and persistence

That release already solves the current pain point: turning messy scripts into parser-friendly canonical imports while exposing what still went wrong.
