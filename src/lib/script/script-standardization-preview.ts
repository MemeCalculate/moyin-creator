import type { CanonicalScriptDocument, ScriptDiagnostic } from "@/types/script";

export interface StandardizationPreviewDiagnostic extends ScriptDiagnostic {
  locationLabel?: string;
  contextLine?: string;
}

export interface StandardizationPreview {
  stats: Array<{ label: string; value: number }>;
  diagnostics: StandardizationPreviewDiagnostic[];
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

interface LineSpan {
  lineNumber: number;
  start: number;
  end: number;
  text: string;
  trimmed: string;
}

function getLineSpans(text: string): LineSpan[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const spans: LineSpan[] = [];
  let cursor = 0;

  lines.forEach((line, index) => {
    const leadingWhitespace = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    const start = cursor + leadingWhitespace;
    const end = trimmed ? start + trimmed.length : cursor + line.length;

    spans.push({
      lineNumber: index + 1,
      start,
      end,
      text: line,
      trimmed,
    });

    cursor += line.length + 1;
  });

  return spans;
}

function findLineForOffset(lineSpans: LineSpan[], offset: number): LineSpan | undefined {
  return lineSpans.find((line) => {
    if (!line.trimmed) {
      return false;
    }

    return offset >= line.start && offset <= line.end;
  });
}

function decorateDiagnostic(
  diagnostic: ScriptDiagnostic,
  lineSpans: LineSpan[]
): StandardizationPreviewDiagnostic {
  if (typeof diagnostic.canonicalStart !== "number") {
    return diagnostic;
  }

  const line = findLineForOffset(lineSpans, diagnostic.canonicalStart);
  if (!line) {
    return diagnostic;
  }

  return {
    ...diagnostic,
    locationLabel: `标准稿第 ${line.lineNumber} 行`,
    contextLine: line.trimmed || line.text.trim(),
  };
}

export function buildStandardizationPreview(
  report: CanonicalScriptDocument | null | undefined,
  standardizedScript: string | null | undefined
): StandardizationPreview | null {
  const canonicalText = report?.canonicalText || standardizedScript || "";
  const lineSpans = getLineSpans(canonicalText);
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
    .map((item) => decorateDiagnostic(item, lineSpans))
    .slice(0, 3);

  return {
    stats,
    diagnostics,
    excerpt,
    hasFatalIssues: (report?.diagnostics || []).some((item) => item.severity === "fatal"),
  };
}
