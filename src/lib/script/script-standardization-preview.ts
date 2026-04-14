import type { CanonicalScriptDocument, ScriptDiagnostic } from "@/types/script";

export interface StandardizationPreview {
  stats: Array<{ label: string; value: number }>;
  diagnostics: ScriptDiagnostic[];
  excerpt: string[];
  hasFatalIssues: boolean;
}

const DIAGNOSTIC_PRIORITY: Record<ScriptDiagnostic["severity"], number> = {
  fatal: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function buildStandardizationPreview(
  report: CanonicalScriptDocument | null | undefined,
  standardizedScript: string | null | undefined
): StandardizationPreview | null {
  const canonicalText = report?.canonicalText || standardizedScript || "";
  const excerpt = canonicalText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!report && excerpt.length === 0) {
    return null;
  }

  const stats = report
    ? [
        { label: "集", value: report.stats.episodeCount },
        { label: "场", value: report.stats.sceneCount },
        { label: "角色", value: report.stats.characterCount },
        { label: "对白", value: report.stats.dialogueCount },
      ]
    : [];

  const diagnostics = (report?.diagnostics || [])
    .filter((item) => DIAGNOSTIC_PRIORITY[item.severity] <= DIAGNOSTIC_PRIORITY.medium)
    .sort((left, right) => DIAGNOSTIC_PRIORITY[left.severity] - DIAGNOSTIC_PRIORITY[right.severity])
    .slice(0, 3);

  return {
    stats,
    diagnostics,
    excerpt,
    hasFatalIssues: (report?.diagnostics || []).some((item) => item.severity === "fatal"),
  };
}
