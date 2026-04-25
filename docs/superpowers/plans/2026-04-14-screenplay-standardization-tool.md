# Screenplay Standardization Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a screenplay standardization MVP that converts raw scripts into parser-friendly canonical text, validates the result, persists the standardization artifacts, and shows import-time diagnostics in the script panel.

**Architecture:** Introduce a service-first standardization layer in `src/lib/script` that segments and canonicalizes raw screenplay text before parser import. Keep the existing parser as the downstream source of truth, but add a deterministic diagnostics pass plus store persistence and a lightweight preview surface in the script import panel.

**Tech Stack:** TypeScript, React 18, Zustand, Electron Vite, ESLint, Vitest

---

## File Map

### New Files

- `C:\Users\Administrator\Documents\jm\moyin-creator\vitest.config.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-standardizer.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-segmentation.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-canonicalizer.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-diagnostics.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\__tests__\script-standardizer.test.ts`

### Modified Files

- `C:\Users\Administrator\Documents\jm\moyin-creator\package.json`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\types\script.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\stores\script-store.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\full-script-service.ts`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\components\panels\script\script-input.tsx`
- `C:\Users\Administrator\Documents\jm\moyin-creator\src\components\panels\script\index.tsx`

---

### Task 1: Add Test Harness And Import-Time Types

**Files:**
- Create: `C:\Users\Administrator\Documents\jm\moyin-creator\vitest.config.ts`
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\package.json`
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\types\script.ts`

- [ ] **Step 1: Add Vitest dependencies and test scripts**

Update `package.json` to add a test runner the repo does not currently have.

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Add a Vitest config with the repo alias**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add standardization types to `src/types/script.ts`**

Append the import-time types next to the existing screenplay types:

```ts
export interface CanonicalStats {
  episodeCount: number;
  sceneCount: number;
  characterCount: number;
  dialogueCount: number;
}

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

export interface CanonicalScriptDocument {
  rawText: string;
  canonicalText: string;
  blocks: CanonicalBlock[];
  aliasMap: Record<string, string>;
  traces: NormalizationTrace[];
  diagnostics: ScriptDiagnostic[];
  stats: CanonicalStats;
}

export interface StandardizeScriptParseResult {
  background: ProjectBackground;
  episodes: EpisodeRawScript[];
  scriptData: ScriptData;
}

export interface StandardizeScriptResult {
  success: boolean;
  document: CanonicalScriptDocument;
  parseResult?: StandardizeScriptParseResult;
  hasFatalIssues: boolean;
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: install completes and `vitest` is added to `package-lock.json`

- [ ] **Step 5: Run lint to verify the type additions compile at baseline**

Run: `npm run lint`

Expected: existing repo remains lint-clean after the config and type additions

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/types/script.ts
git commit -m "test: add screenplay standardization test scaffold"
```

---

### Task 2: Build The Core Standardizer With Failing Tests First

**Files:**
- Create: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-segmentation.ts`
- Create: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-canonicalizer.ts`
- Create: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-standardizer.ts`
- Create: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\__tests__\script-standardizer.test.ts`

- [ ] **Step 1: Write the first failing test for compact bios and loose scene headers**

Create `src/lib/script/__tests__/script-standardizer.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { standardizeScriptForImport } from '@/lib/script/script-standardizer';

describe('standardizeScriptForImport', () => {
  it('splits compact bios and normalizes loose scene headers', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '人物小传：马一花（17）：转学生，倔强。陈茉莉（17）：班长，克制。',
      '第一集：相遇',
      '第一场 外 日 学校门口',
      '马一花：我转学来的。',
      '陈茉莉：跟我走。'
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('人物小传：');
    expect(result.document.canonicalText).toContain('马一花（17）：转学生，倔强。');
    expect(result.document.canonicalText).toContain('陈茉莉（17）：班长，克制。');
    expect(result.document.canonicalText).toContain('1-1 日 外 学校门口');
    expect(result.hasFatalIssues).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails because the service does not exist yet**

Run: `npm test -- src/lib/script/__tests__/script-standardizer.test.ts`

Expected: FAIL with a module resolution or missing export error for `standardizeScriptForImport`

- [ ] **Step 3: Add the segmentation helper**

Create `src/lib/script/script-segmentation.ts`:

```ts
import type { CanonicalBlock } from '@/types/script';

const TITLE_RE = /《[^》]+》/;
const EPISODE_RE = /^(?:第[一二三四五六七八九十百千\d]+集|Episode\s+\d+)/;
const BIO_HEADER_RE = /^人物小传[：:]/;
const OUTLINE_HEADER_RE = /^大纲[：:]/;

export function segmentScriptText(text: string): CanonicalBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: CanonicalBlock[] = [];
  let cursor = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const type: CanonicalBlock['type'] =
      TITLE_RE.test(trimmed) ? 'title'
        : OUTLINE_HEADER_RE.test(trimmed) ? 'outline'
        : BIO_HEADER_RE.test(trimmed) ? 'character_bio'
        : EPISODE_RE.test(trimmed) ? 'episode'
        : 'unknown';

    blocks.push({
      id: `block_${index + 1}`,
      type,
      sourceText: line,
      normalizedText: line,
      sourceStart: cursor,
      sourceEnd: cursor + line.length,
      confidence: type === 'unknown' ? 0.4 : 0.95,
    });

    cursor += line.length + 1;
  });

  return blocks;
}
```

- [ ] **Step 4: Add the canonicalizer helper**

Create `src/lib/script/script-canonicalizer.ts`:

```ts
import type { CanonicalBlock, NormalizationTrace } from '@/types/script';

function splitCompactBios(text: string): { text: string; traces: NormalizationTrace[] } {
  const traces: NormalizationTrace[] = [];
  const replaced = text.replace(
    /([^\n：:（）()]{2,12}（\d{1,3}）[：:][^\n]+?)(?=([^\n：:（）()]{2,12}（\d{1,3}）[：:]))/g,
    (match) => {
      const next = `${match}\n`;
      traces.push({
        id: `trace_bio_${traces.length + 1}`,
        operation: 'split_character_bios',
        before: match,
        after: next.trimEnd(),
        reason: 'Split compact same-line character bio entries',
      });
      return next;
    },
  );

  return { text: replaced, traces };
}

function normalizeLooseSceneHeaders(text: string): { text: string; traces: NormalizationTrace[] } {
  const traces: NormalizationTrace[] = [];
  let sceneIndex = 1;

  const replaced = text.replace(
    /^(?:第一场|场景一)\s*(?:外\s*日|日\s*外)\s*(.+)$/gm,
    (_, location: string) => {
      const next = `1-${sceneIndex++} 日 外 ${location.trim()}`;
      traces.push({
        id: `trace_scene_${traces.length + 1}`,
        operation: 'normalize_scene_header',
        before: _,
        after: next,
        reason: 'Normalize loose scene header into parser-friendly format',
      });
      return next;
    },
  );

  return { text: replaced, traces };
}

export function canonicalizeScriptText(blocks: CanonicalBlock[], rawText: string) {
  const bioStep = splitCompactBios(rawText);
  const sceneStep = normalizeLooseSceneHeaders(bioStep.text);
  const canonicalText = sceneStep.text;

  return {
    canonicalText,
    blocks: blocks.map((block) => ({ ...block })),
    aliasMap: {},
    traces: [...bioStep.traces, ...sceneStep.traces],
  };
}
```

- [ ] **Step 5: Add the orchestration service**

Create `src/lib/script/script-standardizer.ts`:

```ts
import type { CanonicalStats, StandardizeScriptResult } from '@/types/script';
import { segmentScriptText } from './script-segmentation';
import { canonicalizeScriptText } from './script-canonicalizer';

function computeStats(canonicalText: string): CanonicalStats {
  const lines = canonicalText.split(/\r?\n/);
  return {
    episodeCount: lines.filter((line) => /^第[一二三四五六七八九十百千\d]+集/.test(line)).length || 1,
    sceneCount: lines.filter((line) => /^\d+-\d+\s+/.test(line)).length,
    characterCount: Array.from(canonicalText.matchAll(/^[^\n：:]{1,12}（\d{1,3}）[：:]/gm)).length,
    dialogueCount: Array.from(canonicalText.matchAll(/^[^\n：:]{1,10}[：:]/gm)).length,
  };
}

export function standardizeScriptForImport(rawText: string): StandardizeScriptResult {
  const blocks = segmentScriptText(rawText);
  const canonicalized = canonicalizeScriptText(blocks, rawText);
  const stats = computeStats(canonicalized.canonicalText);

  return {
    success: true,
    hasFatalIssues: stats.episodeCount === 0,
    document: {
      rawText,
      canonicalText: canonicalized.canonicalText,
      blocks: canonicalized.blocks,
      aliasMap: canonicalized.aliasMap,
      traces: canonicalized.traces,
      diagnostics: [],
      stats,
    },
  };
}
```

- [ ] **Step 6: Run the targeted test to verify it passes**

Run: `npm test -- src/lib/script/__tests__/script-standardizer.test.ts`

Expected: PASS for the compact bio and loose scene header case

- [ ] **Step 7: Commit**

```bash
git add src/lib/script/script-segmentation.ts src/lib/script/script-canonicalizer.ts src/lib/script/script-standardizer.ts src/lib/script/__tests__/script-standardizer.test.ts
git commit -m "feat: add core screenplay standardizer service"
```

---

### Task 3: Add Diagnostics And Parser Round-Trip Validation

**Files:**
- Create: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-diagnostics.ts`
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\script-standardizer.ts`
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\__tests__\script-standardizer.test.ts`

- [ ] **Step 1: Add a failing test for silent degradation detection**

Extend `script-standardizer.test.ts`:

```ts
it('flags fatal issues when canonical text still lacks structured episodes or scenes', () => {
  const raw = '没有标题也没有集场结构，只有一大段叙述文本';

  const result = standardizeScriptForImport(raw);

  expect(result.hasFatalIssues).toBe(true);
  expect(result.document.diagnostics.some((item) => item.code === 'fatal_no_scene_detected')).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails for missing diagnostics**

Run: `npm test -- src/lib/script/__tests__/script-standardizer.test.ts`

Expected: FAIL because diagnostics are empty and `hasFatalIssues` does not reflect scene collapse yet

- [ ] **Step 3: Add diagnostics helpers**

Create `src/lib/script/script-diagnostics.ts`:

```ts
import type { CanonicalScriptDocument, ScriptDiagnostic } from '@/types/script';

export function buildDiagnostics(document: CanonicalScriptDocument): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];

  if (document.stats.episodeCount === 0) {
    diagnostics.push({
      id: 'diag_fatal_episode_1',
      severity: 'fatal',
      code: 'fatal_no_episode_detected',
      message: 'No episode marker could be recognized after canonicalization.',
      suggestedFix: 'Add at least one `第X集：标题` marker.',
    });
  }

  if (document.stats.sceneCount === 0) {
    diagnostics.push({
      id: 'diag_fatal_scene_1',
      severity: 'fatal',
      code: 'fatal_no_scene_detected',
      message: 'No parser-friendly scene header was recognized after canonicalization.',
      suggestedFix: 'Add headers like `1-1 日 内 地点`.',
    });
  }

  if (document.traces.some((trace) => trace.operation === 'split_character_bios')) {
    diagnostics.push({
      id: 'diag_high_bio_1',
      severity: 'high',
      code: 'bio_compact_entries_split',
      message: 'Compact same-line character bios were split into separate entries.',
    });
  }

  return diagnostics;
}

export function hasFatalDiagnostics(diagnostics: ScriptDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'fatal');
}
```

- [ ] **Step 4: Add parser round-trip validation to the standardizer**

Update `script-standardizer.ts`:

```ts
import { convertToScriptData, parseFullScript } from './episode-parser';
import { buildDiagnostics, hasFatalDiagnostics } from './script-diagnostics';
```

Then replace the function body with:

```ts
export function standardizeScriptForImport(rawText: string): StandardizeScriptResult {
  const blocks = segmentScriptText(rawText);
  const canonicalized = canonicalizeScriptText(blocks, rawText);
  const stats = computeStats(canonicalized.canonicalText);

  const document = {
    rawText,
    canonicalText: canonicalized.canonicalText,
    blocks: canonicalized.blocks,
    aliasMap: canonicalized.aliasMap,
    traces: canonicalized.traces,
    diagnostics: [],
    stats,
  };

  const diagnostics = buildDiagnostics(document);
  document.diagnostics = diagnostics;

  if (hasFatalDiagnostics(diagnostics)) {
    return {
      success: true,
      document,
      hasFatalIssues: true,
    };
  }

  const { background, episodes } = parseFullScript(document.canonicalText);
  const scriptData = convertToScriptData(background, episodes);

  return {
    success: true,
    document,
    parseResult: {
      background,
      episodes,
      scriptData,
    },
    hasFatalIssues: false,
  };
}
```

- [ ] **Step 5: Run the targeted tests again**

Run: `npm test -- src/lib/script/__tests__/script-standardizer.test.ts`

Expected: PASS for both the happy-path and the fatal-diagnostics case

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: PASS with 2 tests total

- [ ] **Step 7: Commit**

```bash
git add src/lib/script/script-diagnostics.ts src/lib/script/script-standardizer.ts src/lib/script/__tests__/script-standardizer.test.ts
git commit -m "feat: add screenplay standardization diagnostics"
```

---

### Task 4: Persist Canonical Import Artifacts In The Store And Service Layer

**Files:**
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\stores\script-store.ts`
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\lib\script\full-script-service.ts`

- [ ] **Step 1: Add a parser-ready regression test before store integration**

Add this case to `script-standardizer.test.ts`:

```ts
it('returns parse-ready data when canonicalization succeeds', () => {
  const raw = [
    '《样例》',
    '大纲：这是一个测试故事。',
    '人物小传：马一花（17）：转学生，倔强。',
    '第一集：相遇',
    '1-1 日 外 学校门口',
    '人物：马一花',
    '马一花：我来了。'
  ].join('\n');

  const result = standardizeScriptForImport(raw);

  expect(result.parseResult?.episodes.length).toBe(1);
  expect(result.parseResult?.scriptData.scenes.length).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify the parse-ready path still passes before wiring import persistence**

Run: `npm test -- src/lib/script/__tests__/script-standardizer.test.ts`

Expected: PASS and confirm the service contract is stable before store integration

- [ ] **Step 3: Add store fields and setters**

In `src/stores/script-store.ts`, extend `ScriptProjectData` and actions:

```ts
import type { CanonicalScriptDocument } from '@/types/script';
```

Add fields:

```ts
standardizedScript?: string;
standardizationReport?: CanonicalScriptDocument | null;
standardizationGeneratedAt?: number;
```

Add actions:

```ts
setStandardizedScript: (projectId: string, text: string) => void;
setStandardizationReport: (projectId: string, report: CanonicalScriptDocument | null) => void;
```

Set defaults:

```ts
standardizedScript: '',
standardizationReport: null,
standardizationGeneratedAt: undefined,
```

Add setters mirroring the existing store style:

```ts
setStandardizedScript: (projectId, text) => {
  get().ensureProject(projectId);
  set((state) => ({
    projects: {
      ...state.projects,
      [projectId]: {
        ...state.projects[projectId],
        standardizedScript: text,
        standardizationGeneratedAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  }));
},
setStandardizationReport: (projectId, report) => {
  get().ensureProject(projectId);
  set((state) => ({
    projects: {
      ...state.projects,
      [projectId]: {
        ...state.projects[projectId],
        standardizationReport: report,
        standardizationGeneratedAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  }));
},
```

- [ ] **Step 4: Replace direct normalizer-first import with standardizer-first import**

In `src/lib/script/full-script-service.ts`, add:

```ts
import { standardizeScriptForImport } from './script-standardizer';
import type { CanonicalScriptDocument } from '@/types/script';
```

Extend `ImportResult`:

```ts
standardizationReport?: CanonicalScriptDocument;
standardizedScript?: string;
```

Then replace the import body from the preprocess/normalize branch with:

```ts
const standardization = standardizeScriptForImport(fullText);

store.setRawScript(projectId, fullText);
store.setStandardizedScript(projectId, standardization.document.canonicalText);
store.setStandardizationReport(projectId, standardization.document);

if (standardization.hasFatalIssues || !standardization.parseResult) {
  return {
    success: false,
    background: null,
    episodes: [],
    scriptData: null,
    error: standardization.document.diagnostics
      .filter((item) => item.severity === 'fatal')
      .map((item) => item.message)
      .join('；') || '剧本标准化后仍无法识别结构',
    standardizationReport: standardization.document,
    standardizedScript: standardization.document.canonicalText,
  };
}

const { background, episodes, scriptData } = standardization.parseResult;
```

Keep the rest of the persistence flow intact, but remove the second `setRawScript(projectId, fullText)` call to avoid duplication.

- [ ] **Step 5: Run lint and tests**

Run: `npm run lint`

Expected: PASS

Run: `npm test`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/script-store.ts src/lib/script/full-script-service.ts src/lib/script/__tests__/script-standardizer.test.ts
git commit -m "feat: persist screenplay standardization artifacts"
```

---

### Task 5: Expose Canonical Preview And Diagnostics In The Script Import UI

**Files:**
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\components\panels\script\script-input.tsx`
- Modify: `C:\Users\Administrator\Documents\jm\moyin-creator\src\components\panels\script\index.tsx`

- [ ] **Step 1: Add a failing UI-facing contract test by locking the props shape in code**

Before editing JSX, add these prop types in `script-input.tsx`:

```ts
import type { CanonicalScriptDocument } from '@/types/script';
```

Extend the component props:

```ts
standardizationReport: CanonicalScriptDocument | null;
standardizedScript: string;
```

Expected compile failure in callers until `index.tsx` passes the new props.

- [ ] **Step 2: Run lint to verify the caller breakage is real**

Run: `npm run lint`

Expected: FAIL because `ScriptInput` is missing the new required preview props in `index.tsx`

- [ ] **Step 3: Wire the new state into `index.tsx`**

Read the current project state from the store and pass the preview props:

```ts
const standardizationReport = scriptProject?.standardizationReport ?? null;
const standardizedScript = scriptProject?.standardizedScript ?? '';
```

Then pass them into `ScriptInput`:

```tsx
<ScriptInput
  ...
  standardizationReport={standardizationReport}
  standardizedScript={standardizedScript}
  onImportFullScript={handleImportFullScript}
/>
```

- [ ] **Step 4: Add the preview UI to `script-input.tsx`**

Under the import controls, render a lightweight diagnostics panel:

```tsx
{standardizationReport && (
  <div className="space-y-2 rounded-md border p-3 bg-muted/20">
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium">标准化预览</p>
      <p className="text-[11px] text-muted-foreground">
        {standardizationReport.stats.episodeCount} 集 / {standardizationReport.stats.sceneCount} 场 / {standardizationReport.stats.characterCount} 人 / {standardizationReport.stats.dialogueCount} 段对白
      </p>
    </div>
    {standardizationReport.diagnostics.length > 0 && (
      <div className="space-y-1">
        {standardizationReport.diagnostics.map((item) => (
          <div
            key={item.id}
            className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700"
          >
            [{item.severity}] {item.message}
          </div>
        ))}
      </div>
    )}
    <Textarea
      value={standardizedScript}
      readOnly
      className="min-h-[180px] max-h-[32vh] resize-none text-xs"
    />
  </div>
)}
```

- [ ] **Step 5: Update import success and failure messaging to use diagnostics**

In `index.tsx`, inside `handleImportFullScript`, add:

```ts
if (result.standardizationReport?.diagnostics.some((item) => item.severity === 'high')) {
  toast.warning('剧本已标准化导入，但存在高优先级识别警告，请检查下方标准化预览。');
}
```

And on failure:

```ts
toast.error(result.error || '导入失败，请先处理标准化报告中的致命问题');
```

- [ ] **Step 6: Run lint and tests**

Run: `npm run lint`

Expected: PASS

Run: `npm test`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/script/script-input.tsx src/components/panels/script/index.tsx
git commit -m "feat: add screenplay standardization preview"
```

---

### Task 6: Final Verification

**Files:**
- Modify: none
- Test: existing changed files only

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS

- [ ] **Step 3: Smoke-check the import workflow in dev mode**

Run: `npm run dev`

Expected:
- app starts successfully
- script import panel loads
- pasting a malformed script shows standardization preview
- fatal issues block import with actionable messaging
- valid scripts import and persist standardized artifacts

- [ ] **Step 4: Record the verification evidence in the final change summary**

Include:

- exact commands run
- whether canonical preview rendered
- whether malformed sample scripts produced fatal diagnostics
- whether valid sample scripts parsed into episodes and scenes

- [ ] **Step 5: Commit any final verification-only fixes if needed**

```bash
git add -A
git commit -m "chore: finalize screenplay standardization mvp"
```
