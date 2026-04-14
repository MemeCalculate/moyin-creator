import type {
  CanonicalScriptDocument,
  CanonicalStats,
  ScriptDiagnostic,
  StandardizeScriptParseResult,
  StandardizeScriptResult,
} from '@/types/script';
import { canonicalizeScriptText } from './script-canonicalizer';
import { buildDiagnostics, hasFatalDiagnostics } from './script-diagnostics';
import { convertToScriptData, parseFullScript } from './episode-parser';
import { segmentScriptText } from './script-segmentation';

function computeStats(canonicalText: string): CanonicalStats {
  const lines = canonicalText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return {
    episodeCount: lines.filter((line) => /^第[零一二三四五六七八九十百千万\d]+集[：:]?/.test(line)).length,
    sceneCount: lines.filter((line) => /^\d+-\d+\s+/.test(line)).length,
    characterCount: lines.filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9·]{2,12}（?\d{1,3}）?[：:]/.test(line)).length,
    dialogueCount: lines.filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9·]{1,12}[：:]/.test(line)).length,
  };
}

function findEpisodeMarkerSpan(
  text: string,
  episodeOrder: number,
  target: 'source' | 'canonical',
): Pick<ScriptDiagnostic, 'sourceStart' | 'sourceEnd'> | Pick<ScriptDiagnostic, 'canonicalStart' | 'canonicalEnd'> | undefined {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let cursor = 0;
  let matchedEpisodeCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const leadingWhitespace = line.match(/^\s*/)?.[0].length ?? 0;
    if (/^第[零一二三四五六七八九十百千万\d]+集[：:]?/.test(trimmed)) {
      if (matchedEpisodeCount === episodeOrder) {
        const start = cursor + leadingWhitespace;
        if (target === 'source') {
          return {
            sourceStart: start,
            sourceEnd: start + trimmed.length,
          };
        }

        return {
          canonicalStart: start,
          canonicalEnd: start + trimmed.length,
        };
      }

      matchedEpisodeCount += 1;
    }

    cursor += line.length + 1;
  }

  return undefined;
}

function buildParseResultDiagnostics(
  rawText: string,
  canonicalText: string,
  parseResult: StandardizeScriptParseResult,
): ScriptDiagnostic[] {
  return parseResult.episodes.flatMap((episode, index) => {
    const fallbackScene = episode.scenes.find((scene) => scene.sceneHeader === '主场景');
    if (!fallbackScene) {
      return [];
    }

    return [
      {
        id: `diag_high_episode_fallback_${index + 1}`,
        severity: 'high',
        code: 'episode_default_scene_fallback',
        message: `第${episode.episodeIndex}集 fell back to a default scene because no parser-friendly scene header was found.`,
        suggestedFix: 'Add scene headers like `1-1 日 外 地点` for every episode block before import.',
        ...findEpisodeMarkerSpan(rawText, index, 'source'),
        ...findEpisodeMarkerSpan(canonicalText, index, 'canonical'),
      },
    ];
  });
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
    const parseResult: StandardizeScriptParseResult = {
      background,
      episodes,
      scriptData,
    };
    document.diagnostics.push(...buildParseResultDiagnostics(rawText, document.canonicalText, parseResult));

    return {
      success: true,
      hasFatalIssues: false,
      document,
      parseResult,
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
