import type { CanonicalScriptDocument, ScriptDiagnostic } from '@/types/script';

const LOOSE_SCENE_LABEL_RE =
  /^\s*(第[零一二三四五六七八九十百千\d]+场|场景[零一二三四五六七八九十百千\d]+)(?:\s|$|[：:])/;

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

function findCanonicalSpanBySnippet(
  canonicalText: string,
  snippet: string | undefined,
): Pick<ScriptDiagnostic, 'canonicalStart' | 'canonicalEnd'> | undefined {
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
    const start = canonicalText.indexOf(anchor);
    if (start >= 0) {
      return {
        canonicalStart: start,
        canonicalEnd: start + anchor.length,
      };
    }
  }

  return undefined;
}

function buildTraceDiagnostic(
  document: CanonicalScriptDocument,
  operation: CanonicalScriptDocument['traces'][number]['operation'],
  baseDiagnostic: ScriptDiagnostic,
): ScriptDiagnostic {
  const trace = document.traces.find((item) => item.operation === operation);
  const span =
    findCanonicalSpanBySnippet(document.canonicalText, trace?.after) ??
    findCanonicalSpanBySnippet(document.canonicalText, trace?.before);

  return {
    ...baseDiagnostic,
    ...span,
  };
}

export function buildDiagnostics(document: CanonicalScriptDocument): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];
  const lineSpans = getLineSpans(document.canonicalText);

  lineSpans
    .filter((line) => line.trimmed && LOOSE_SCENE_LABEL_RE.test(line.trimmed))
    .forEach((line, index) => {
      diagnostics.push({
        id: `diag_high_loose_scene_${index + 1}`,
        severity: 'high',
        code: 'unresolved_loose_scene_label',
        message: `Loose scene label still needs normalization: ${line.trimmed}`,
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

  if (document.traces.some((trace) => trace.operation === 'split_character_bios')) {
    diagnostics.push(
      buildTraceDiagnostic(document, 'split_character_bios', {
        id: 'diag_high_bio_1',
        severity: 'high',
        code: 'bio_compact_entries_split',
        message: 'Compact same-line character bios were split into separate entries.',
      }),
    );
  }

  if (document.traces.some((trace) => trace.operation === 'split_paragraph')) {
    diagnostics.push(
      buildTraceDiagnostic(document, 'split_paragraph', {
        id: 'diag_medium_paragraph_1',
        severity: 'medium',
        code: 'dense_paragraphs_split',
        message: 'Dense screenplay paragraphs were split into structural lines before parsing.',
        suggestedFix: 'Keep dialogue, action, and scene headers on separate lines in the source manuscript when possible.',
      }),
    );
  }

  if (document.traces.some((trace) => trace.operation === 'insert_marker')) {
    diagnostics.push(
      buildTraceDiagnostic(document, 'insert_marker', {
        id: 'diag_medium_episode_1',
        severity: 'medium',
        code: 'synthetic_episode_markers_inserted',
        message: 'Synthetic episode markers were inserted to align parser output with detected scene numbering.',
        suggestedFix: 'Prefer explicit episode markers like `第1集：标题` before each episode block.',
      }),
    );
  }

  return diagnostics;
}

export function hasFatalDiagnostics(diagnostics: ScriptDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'fatal');
}
