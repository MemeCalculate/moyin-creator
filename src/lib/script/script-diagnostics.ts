import type { CanonicalScriptDocument, ScriptDiagnostic } from '@/types/script';

export function buildDiagnostics(document: CanonicalScriptDocument): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];

  if (document.stats.sceneCount === 0) {
    diagnostics.push({
      id: 'diag_fatal_scene_1',
      severity: 'fatal',
      code: 'fatal_no_scene_detected',
      message: 'No parser-friendly scene header was recognized after canonicalization.',
      suggestedFix: 'Add scene headers like `1-1 日 内 地点`.',
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
  return diagnostics.some((diagnostic) => diagnostic.severity === 'fatal');
}
