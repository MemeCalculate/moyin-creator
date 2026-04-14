import type { CanonicalStats, StandardizeScriptResult } from '@/types/script';
import { canonicalizeScriptText } from './script-canonicalizer';
import { segmentScriptText } from './script-segmentation';

function computeStats(canonicalText: string): CanonicalStats {
  const lines = canonicalText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return {
    episodeCount: lines.filter((line) => /^第[一二三四五六七八九十百千万零\d]+集[：:]?/.test(line)).length || 1,
    sceneCount: lines.filter((line) => /^\d+-\d+\s+/.test(line)).length,
    characterCount: lines.filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9·]{2,12}（\d{1,3}）[：:]/.test(line)).length,
    dialogueCount: lines.filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9·]{1,12}[：:]/.test(line)).length,
  };
}

export function standardizeScriptForImport(rawText: string): StandardizeScriptResult {
  const blocks = segmentScriptText(rawText);
  const canonicalized = canonicalizeScriptText(blocks, rawText);
  const stats = computeStats(canonicalized.canonicalText);

  return {
    success: true,
    hasFatalIssues: stats.sceneCount === 0,
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
