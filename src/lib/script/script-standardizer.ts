import type { CanonicalScriptDocument, CanonicalStats, StandardizeScriptResult } from '@/types/script';
import { canonicalizeScriptText } from './script-canonicalizer';
import { buildDiagnostics, hasFatalDiagnostics } from './script-diagnostics';
import { convertToScriptData, parseFullScript } from './episode-parser';
import { segmentScriptText } from './script-segmentation';

function computeStats(canonicalText: string): CanonicalStats {
  const lines = canonicalText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return {
    episodeCount: lines.filter((line) => /^第[一二三四五六七八九十百千万零\d]+集[：:]?/.test(line)).length,
    sceneCount: lines.filter((line) => /^\d+-\d+\s+/.test(line)).length,
    characterCount: lines.filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9·]{2,12}（\d{1,3}）[：:]/.test(line)).length,
    dialogueCount: lines.filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9·]{1,12}[：:]/.test(line)).length,
  };
}

export function standardizeScriptForImport(rawText: string): StandardizeScriptResult {
  const canonicalized = canonicalizeScriptText(rawText);
  const blocks = segmentScriptText(canonicalized.canonicalText);
  const stats = computeStats(canonicalized.canonicalText);
  const document: CanonicalScriptDocument = {
    rawText,
    canonicalText: canonicalized.canonicalText,
    blocks,
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
      hasFatalIssues: true,
      document,
    };
  }

  try {
    const { background, episodes } = parseFullScript(document.canonicalText);
    const scriptData = convertToScriptData(background, episodes);

    return {
      success: true,
      hasFatalIssues: false,
      document,
      parseResult: {
        background,
        episodes,
        scriptData,
      },
    };
  } catch (error) {
    document.diagnostics.push({
      id: 'diag_fatal_parser_exception',
      severity: 'fatal',
      code: 'fatal_parser_exception',
      message: error instanceof Error ? error.message : 'Script parser failed after canonicalization.',
      suggestedFix: 'Review the standardized preview and verify each episode and scene marker is on its own line.',
    });

    return {
      success: false,
      hasFatalIssues: true,
      document,
    };
  }
}
