import type { CanonicalScriptDocument, NormalizationTrace, ScriptDiagnostic } from '@/types/script';

const LOOSE_SCENE_LABEL_RE =
  /^\s*(?:\u7b2c[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\d]+\u573a|\u573a\u666f[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\d]+)(?:\s|$|[\uff1a:])/;

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
      (_trace, index) => ({
        id: `diag_medium_episode_marker_${index + 1}`,
        severity: 'medium',
        code: 'synthetic_episode_markers_inserted',
        message: 'A synthetic episode marker was inserted to align parser output with detected scene numbering.',
        suggestedFix: 'Prefer explicit episode markers like `第1集：标题` before each episode block.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_scene_characters_'),
      (_trace, index) => ({
        id: `diag_medium_scene_characters_${index + 1}`,
        severity: 'medium',
        code: 'inferred_scene_character_lines_inserted',
        message: 'A parser-friendly `人物：...` line was inserted by inferring speakers from dialogue in this scene.',
        suggestedFix: 'Add an explicit `人物：角色A、角色B` line under the scene header if you want to avoid inference.',
      }),
    ),
  );

  diagnostics.push(
    ...buildTraceDiagnostics(
      document,
      (trace) => trace.id.startsWith('trace_scene_header_characters_'),
      (_trace, index) => ({
        id: `diag_medium_scene_header_characters_${index + 1}`,
        severity: 'medium',
        code: 'scene_header_character_tags_extracted',
        message: 'Character tags that were mixed into the scene header were extracted into a standalone `人物：...` line.',
        suggestedFix: 'Keep the scene header and the `人物：...` line on separate lines in the source manuscript.',
      }),
    ),
  );

  return diagnostics;
}

export function hasFatalDiagnostics(diagnostics: ScriptDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'fatal');
}
