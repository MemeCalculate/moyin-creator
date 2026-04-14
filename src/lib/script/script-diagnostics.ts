import type { CanonicalScriptDocument, NormalizationTrace, ScriptDiagnostic } from '@/types/script';

const LOOSE_SCENE_LABEL_RE =
  /^\s*(?:\u7b2c[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\d]+\u573a|\u573a\u666f[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\d]+)(?:\s|$|[\uff1a:])/;
const EPISODE_MARKER_RE =
  /^\s*\*{0,2}(?:\u7b2c[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\d]+\u96c6|Episode\s+\d+)(?:\s|$|[\uff1a:])/i;
const NUMBERED_SCENE_PREFIX_RE = /^\s*\d+-\d+\s+/;
const SCENE_TIME_TOKEN_RE =
  /(?:^|\s)(?:\u65e5|\u591c|\u6668|\u66ae|\u9ec4\u660f|\u9ece\u660e|\u6e05\u6668|\u508d\u665a)(?=\s|$)/;
const SCENE_INTERIOR_TOKEN_RE = /(?:^|\s)(?:\u5185\/\u5916|\u5185|\u5916)(?=\s|$)/;
const COMPLETE_NUMBERED_SCENE_RE =
  /^\s*\d+-\d+\s+(?:\u65e5|\u591c|\u6668|\u66ae|\u9ec4\u660f|\u9ece\u660e|\u6e05\u6668|\u508d\u665a)\s+(?:\u5185\/\u5916|\u5185|\u5916)\s*(.*)$/;
const DIALOGUE_MARKER_RE = /[\u4e00-\u9fa5A-Za-z0-9路]{1,12}[\uff1a:]/g;
const NON_DIALOGUE_PREFIX_RE = /^(?:人物|角色|地点|时间|大纲|备注|补充|旁白|字幕)[\uff1a:]/;

interface LineSpan {
  start: number;
  end: number;
  text: string;
  trimmed: string;
}

function getLineSpans(text: string): LineSpan[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const spans: LineSpan[] = [];
  let cursor = 0;

  lines.forEach((line) => {
    const leadingWhitespace = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    const start = cursor + leadingWhitespace;
    const end = trimmed ? start + trimmed.length : cursor + line.length;

    spans.push({
      start,
      end,
      text: line,
      trimmed,
    });

    cursor += line.length + 1;
  });

  return spans;
}

function findSpanBySnippet(
  text: string,
  snippet: string | undefined,
  target: 'source' | 'canonical',
): Pick<ScriptDiagnostic, 'sourceStart' | 'sourceEnd'> | Pick<ScriptDiagnostic, 'canonicalStart' | 'canonicalEnd'> | undefined {
  if (!snippet) {
    return undefined;
  }

  const normalizedSnippet = snippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!normalizedSnippet) {
    return undefined;
  }

  const snippetLines = normalizedSnippet.split('\n');
  const anchors = [
    normalizedSnippet,
    snippetLines[0],
    snippetLines[snippetLines.length - 1],
  ].filter(Boolean);

  for (const anchor of anchors) {
    const start = text.indexOf(anchor);
    if (start >= 0) {
      if (target === 'source') {
        return {
          sourceStart: start,
          sourceEnd: start + anchor.length,
        };
      }

      return {
        canonicalStart: start,
        canonicalEnd: start + anchor.length,
      };
    }
  }

  return undefined;
}

function buildDiagnosticFromTrace(
  document: CanonicalScriptDocument,
  trace: NormalizationTrace,
  baseDiagnostic: ScriptDiagnostic,
): ScriptDiagnostic {
  const canonicalSpan =
    findSpanBySnippet(document.canonicalText, trace.after, 'canonical') ??
    findSpanBySnippet(document.canonicalText, trace.before, 'canonical');
  const sourceSpan =
    findSpanBySnippet(document.rawText, trace.before, 'source') ??
    findSpanBySnippet(document.rawText, trace.after, 'source');

  return {
    ...baseDiagnostic,
    ...sourceSpan,
    ...canonicalSpan,
  };
}

function buildFirstTraceDiagnostic(
  document: CanonicalScriptDocument,
  predicate: (trace: NormalizationTrace) => boolean,
  baseDiagnostic: ScriptDiagnostic,
): ScriptDiagnostic | null {
  const trace = document.traces.find(predicate);
  if (!trace) {
    return null;
  }

  return buildDiagnosticFromTrace(document, trace, baseDiagnostic);
}

function buildTraceDiagnostics(
  document: CanonicalScriptDocument,
  predicate: (trace: NormalizationTrace) => boolean,
  createDiagnostic: (trace: NormalizationTrace, index: number) => ScriptDiagnostic,
): ScriptDiagnostic[] {
  return document.traces
    .filter(predicate)
    .map((trace, index) => buildDiagnosticFromTrace(document, trace, createDiagnostic(trace, index)));
}

function getTraceLine(traceText: string, mode: 'first' | 'last'): string {
  const lines = traceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  return mode === 'first' ? lines[0] : lines[lines.length - 1];
}

function hasMultipleDialogueMarkers(line: string): boolean {
  const trimmed = line.trim();
  if (
    !trimmed ||
    /^\d+-\d+\s+/.test(trimmed) ||
    LOOSE_SCENE_LABEL_RE.test(trimmed) ||
    EPISODE_MARKER_RE.test(trimmed) ||
    NON_DIALOGUE_PREFIX_RE.test(trimmed) ||
    /^[[△【]/.test(trimmed)
  ) {
    return false;
  }

  const markers = trimmed.match(DIALOGUE_MARKER_RE) ?? [];
  return markers.length >= 2;
}

export function buildDiagnostics(document: CanonicalScriptDocument): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];
  const lineSpans = getLineSpans(document.canonicalText);

  lineSpans
    .filter((line) => line.trimmed && LOOSE_SCENE_LABEL_RE.test(line.trimmed))
    .forEach((line, index) => {
      const sourceSpan = findSpanBySnippet(document.rawText, line.trimmed, 'source');
      diagnostics.push({
        id: `diag_high_loose_scene_${index + 1}`,
        severity: 'high',
        code: 'unresolved_loose_scene_label',
        message: `Loose scene label still needs normalization: ${line.trimmed}`,
        ...sourceSpan,
        canonicalStart: line.start,
        canonicalEnd: line.end,
        suggestedFix: 'Add time/interior info, for example `第一场 外 日 学校门口` or `1-1 日 外 学校门口`.',
      });
    });

  lineSpans
    .filter(
      (line) =>
        line.trimmed &&
        NUMBERED_SCENE_PREFIX_RE.test(line.trimmed) &&
        !SCENE_TIME_TOKEN_RE.test(line.trimmed),
    )
    .forEach((line, index) => {
      const sourceSpan = findSpanBySnippet(document.rawText, line.trimmed, 'source');
      diagnostics.push({
        id: `diag_high_numbered_scene_time_${index + 1}`,
        severity: 'high',
        code: 'numbered_scene_missing_time_marker',
        message: `Numbered scene header still lacks a recognizable time marker: ${line.trimmed}`,
        ...sourceSpan,
        canonicalStart: line.start,
        canonicalEnd: line.end,
        suggestedFix:
          'Add a time token such as `\u65e5` or `\u591c`, for example `1-1 \u65e5 \u5916 \u5730\u70b9`.',
      });
    });

  lineSpans
    .filter(
      (line) =>
        line.trimmed &&
        NUMBERED_SCENE_PREFIX_RE.test(line.trimmed) &&
        SCENE_TIME_TOKEN_RE.test(line.trimmed) &&
        !SCENE_INTERIOR_TOKEN_RE.test(line.trimmed),
    )
    .forEach((line, index) => {
      const sourceSpan = findSpanBySnippet(document.rawText, line.trimmed, 'source');
      diagnostics.push({
        id: `diag_high_numbered_scene_interior_${index + 1}`,
        severity: 'high',
        code: 'numbered_scene_missing_interior_marker',
        message: `Numbered scene header still lacks an interior marker: ${line.trimmed}`,
        ...sourceSpan,
        canonicalStart: line.start,
        canonicalEnd: line.end,
        suggestedFix:
          'Add an interior marker such as `\u5185` or `\u5916`, for example `1-1 \u65e5 \u5916 \u5730\u70b9`.',
      });
    });

  lineSpans
    .filter((line) => {
      const location = line.trimmed.match(COMPLETE_NUMBERED_SCENE_RE)?.[1]?.trim() ?? '';
      return Boolean(line.trimmed && location.length === 0 && COMPLETE_NUMBERED_SCENE_RE.test(line.trimmed));
    })
    .forEach((line, index) => {
      const sourceSpan = findSpanBySnippet(document.rawText, line.trimmed, 'source');
      diagnostics.push({
        id: `diag_high_numbered_scene_location_${index + 1}`,
        severity: 'high',
        code: 'numbered_scene_missing_location',
        message: `Numbered scene header still lacks a location payload: ${line.trimmed}`,
        ...sourceSpan,
        canonicalStart: line.start,
        canonicalEnd: line.end,
        suggestedFix:
          'Add a location after the time and interior markers, for example `1-1 \u65e5 \u5916 \u5b66\u6821\u95e8\u53e3`.',
      });
    });

  lineSpans
    .filter((line) => hasMultipleDialogueMarkers(line.trimmed))
    .forEach((line, index) => {
      const sourceSpan = findSpanBySnippet(document.rawText, line.trimmed, 'source');
      diagnostics.push({
        id: `diag_high_multi_dialogue_${index + 1}`,
        severity: 'high',
        code: 'multiple_dialogue_markers_same_line',
        message: `Multiple dialogue markers remain on the same line: ${line.trimmed}`,
        ...sourceSpan,
        canonicalStart: line.start,
        canonicalEnd: line.end,
        suggestedFix: 'Split each speaker onto its own line, for example `ALICE: ...` followed by `BOB: ...`.',
      });
    });

  if (document.stats.sceneCount === 0) {
    diagnostics.push({
      id: 'diag_fatal_scene_1',
      severity: 'fatal',
      code: 'fatal_no_scene_detected',
      message: 'No parser-friendly scene header was recognized after canonicalization.',
      suggestedFix: 'Add scene headers like `1-1 日 外 地点`.',
    });
  }

  if (document.stats.episodeCount === 0) {
    diagnostics.push({
      id: 'diag_high_episode_1',
      severity: 'high',
      code: 'missing_episode_marker',
      message: 'No explicit episode marker was recognized; import will need a synthetic default episode.',
      suggestedFix: 'Add markers like `第1集：标题`.',
    });
  }

  Object.entries(document.aliasMap).forEach(([alias, canonical], index) => {
    diagnostics.push({
      id: `diag_medium_alias_${index + 1}`,
      severity: 'medium',
      code: 'normalized_alias',
      message: `Normalized character alias \`${alias}\` to \`${canonical}\`.`,
      suggestedFix: 'Prefer the canonical character name consistently in dialogue lines and `人物：...` lines.',
    });
  });

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_character_bio_inferred_'),
      (trace, index) => ({
        id: `diag_medium_character_bio_inferred_${index + 1}`,
        severity: 'medium',
        code: 'character_bio_section_inferred',
        message: `Inserted missing character bio section header before: ${getTraceLine(trace.before, 'first')}`,
        suggestedFix: 'Add an explicit `人物小传：` section label before the character bios in the source manuscript.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_markdown_character_bios_'),
      (trace, index) => ({
        id: `diag_medium_markdown_character_bios_${index + 1}`,
        severity: 'medium',
        code: 'markdown_character_bios_normalized',
        message: 'Normalized markdown-style character bio headings into parser-friendly lines.',
        suggestedFix: 'Prefer `角色名：描述` lines under `人物小传：` when preparing the source manuscript.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_character_bio_header_'),
      (trace, index) => ({
        id: `diag_medium_character_bio_header_${index + 1}`,
        severity: 'medium',
        code: 'character_bio_section_normalized',
        message: `Normalized character bio section header: ${trace.before} -> ${trace.after}`,
        suggestedFix: 'Prefer the canonical `人物小传：` section label in the source manuscript.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_episode_header_'),
      (trace, index) => ({
        id: `diag_medium_episode_header_${index + 1}`,
        severity: 'medium',
        code: 'episode_markers_normalized',
        message: `Normalized episode marker: ${trace.before} -> ${trace.after}`,
        suggestedFix: 'Prefer parser-friendly episode markers like `第1集：标题` in the source manuscript.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.operation === 'normalize_scene_header',
      (trace, index) => ({
        id: `diag_medium_scene_header_${index + 1}`,
        severity: 'medium',
        code: 'scene_headers_normalized',
        message: `Normalized scene header: ${trace.before} -> ${trace.after}`,
        suggestedFix: 'Prefer parser-friendly scene headers like `1-1 日 外 地点` in the source manuscript.',
      }),
    ),
  );

  const compactBioDiagnostic = buildFirstTraceDiagnostic(
    document,
    (trace) => trace.operation === 'split_character_bios',
    {
      id: 'diag_high_bio_1',
      severity: 'high',
      code: 'bio_compact_entries_split',
      message: 'Compact same-line character bios were split into separate entries.',
    },
  );
  if (compactBioDiagnostic) {
    diagnostics.push(compactBioDiagnostic);
  }

  const denseParagraphDiagnostic = buildFirstTraceDiagnostic(
    document,
    (trace) => trace.operation === 'split_paragraph',
    {
      id: 'diag_medium_paragraph_1',
      severity: 'medium',
      code: 'dense_paragraphs_split',
      message: 'Dense screenplay paragraphs were split into structural lines before parsing.',
      suggestedFix: 'Keep dialogue, action, and scene headers on separate lines in the source manuscript when possible.',
    },
  );
  if (denseParagraphDiagnostic) {
    diagnostics.push(denseParagraphDiagnostic);
  }

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_episode_marker_'),
      (trace, index) => ({
        id: `diag_medium_episode_marker_${index + 1}`,
        severity: 'medium',
        code: 'synthetic_episode_markers_inserted',
        message: `Inserted synthetic episode marker: ${getTraceLine(trace.after, 'first')}`,
        suggestedFix: 'Prefer explicit episode markers like `第1集：标题` before each episode block.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_scene_characters_'),
      (trace, index) => ({
        id: `diag_medium_scene_characters_${index + 1}`,
        severity: 'medium',
        code: 'inferred_scene_character_lines_inserted',
        message: `Inserted inferred character line: ${getTraceLine(trace.after, 'last')}`,
        suggestedFix: 'Add an explicit `人物：角色A、角色B` line under the scene header if you want to avoid inference.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_scene_header_characters_'),
      (trace, index) => ({
        id: `diag_medium_scene_header_characters_${index + 1}`,
        severity: 'medium',
        code: 'scene_header_character_tags_extracted',
        message: `Extracted scene-header character tags into: ${getTraceLine(trace.after, 'last')}`,
        suggestedFix: 'Keep the scene header and the `人物：...` line on separate lines in the source manuscript.',
      }),
    ),
  );

  return diagnostics;
}

export function hasFatalDiagnostics(diagnostics: ScriptDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'fatal');
}
