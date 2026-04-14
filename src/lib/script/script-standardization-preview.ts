import type { CanonicalScriptDocument, ScriptDiagnostic } from "@/types/script";

export interface StandardizationPreviewDiagnostic extends ScriptDiagnostic {
  sourceLocationLabel?: string;
  sourceContextLine?: string;
  locationLabel?: string;
  contextLine?: string;
}

export interface StandardizationPreviewOverviewItem {
  key: "blocking" | "inferred" | "autofixed";
  count: number;
}

export interface StandardizationPreview {
  stats: Array<{ label: string; value: number }>;
  overview: StandardizationPreviewOverviewItem[];
  diagnostics: StandardizationPreviewDiagnostic[];
  excerpt: string[];
  hasBlockingIssues: boolean;
  hasFatalIssues: boolean;
}

const DIAGNOSTIC_PRIORITY: Record<ScriptDiagnostic["severity"], number> = {
  fatal: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const BLOCKING_CODES = new Set([
  "fatal_no_scene_detected",
  "fatal_parser_exception",
  "unresolved_loose_scene_label",
  "missing_episode_marker",
  "multiple_dialogue_markers_same_line",
]);

const INFERRED_CODES = new Set([
  "synthetic_episode_markers_inserted",
  "inferred_scene_character_lines_inserted",
  "scene_header_character_tags_extracted",
  "episode_default_scene_fallback",
  "character_bio_section_inferred",
]);

const AUTOFIXED_CODES = new Set([
  "bio_compact_entries_split",
  "dense_paragraphs_split",
  "normalized_alias",
  "scene_headers_normalized",
  "character_bio_section_normalized",
  "markdown_character_bios_normalized",
]);

type PreviewDiagnosticCategory =
  | StandardizationPreviewOverviewItem["key"]
  | "other";

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
  sourceLineSpans: LineSpan[],
  canonicalLineSpans: LineSpan[]
): StandardizationPreviewDiagnostic {
  const decorated: StandardizationPreviewDiagnostic = {
    ...diagnostic,
  };

  if (typeof diagnostic.sourceStart === "number") {
    const sourceLine = findLineForOffset(sourceLineSpans, diagnostic.sourceStart);
    if (sourceLine) {
      decorated.sourceLocationLabel = `原稿第 ${sourceLine.lineNumber} 行`;
      decorated.sourceContextLine = sourceLine.trimmed || sourceLine.text.trim();
    }
  }

  if (typeof diagnostic.canonicalStart === "number") {
    const canonicalLine = findLineForOffset(canonicalLineSpans, diagnostic.canonicalStart);
    if (canonicalLine) {
      decorated.locationLabel = `标准稿第 ${canonicalLine.lineNumber} 行`;
      decorated.contextLine = canonicalLine.trimmed || canonicalLine.text.trim();
    }
  }

  return decorated;
}

function buildOverview(diagnostics: ScriptDiagnostic[]): StandardizationPreviewOverviewItem[] {
  const counts = {
    blocking: 0,
    inferred: 0,
    autofixed: 0,
  };

  diagnostics.forEach((diagnostic) => {
    if (BLOCKING_CODES.has(diagnostic.code) || diagnostic.severity === "fatal") {
      counts.blocking += 1;
      return;
    }

    if (INFERRED_CODES.has(diagnostic.code)) {
      counts.inferred += 1;
      return;
    }

    if (AUTOFIXED_CODES.has(diagnostic.code)) {
      counts.autofixed += 1;
    }
  });

  return [
    { key: "blocking", count: counts.blocking },
    { key: "inferred", count: counts.inferred },
    { key: "autofixed", count: counts.autofixed },
  ];
}

function getDiagnosticCategory(diagnostic: ScriptDiagnostic): PreviewDiagnosticCategory {
  if (BLOCKING_CODES.has(diagnostic.code) || diagnostic.severity === "fatal") {
    return "blocking";
  }

  if (INFERRED_CODES.has(diagnostic.code)) {
    return "inferred";
  }

  if (AUTOFIXED_CODES.has(diagnostic.code)) {
    return "autofixed";
  }

  return "other";
}

function selectPreviewDiagnostics(
  diagnostics: StandardizationPreviewDiagnostic[]
): StandardizationPreviewDiagnostic[] {
  const preferredCategories: StandardizationPreviewOverviewItem["key"][] = [
    "blocking",
    "inferred",
    "autofixed",
  ];
  const selected: StandardizationPreviewDiagnostic[] = [];
  const seenIds = new Set<string>();

  preferredCategories.forEach((category) => {
    const match = diagnostics.find(
      (diagnostic) =>
        !seenIds.has(diagnostic.id) &&
        getDiagnosticCategory(diagnostic) === category
    );
    if (!match) {
      return;
    }

    selected.push(match);
    seenIds.add(match.id);
  });

  diagnostics.forEach((diagnostic) => {
    if (selected.length >= 3 || seenIds.has(diagnostic.id)) {
      return;
    }

    selected.push(diagnostic);
    seenIds.add(diagnostic.id);
  });

  return selected.slice(0, 3);
}

export function buildStandardizationPreview(
  report: CanonicalScriptDocument | null | undefined,
  standardizedScript: string | null | undefined
): StandardizationPreview | null {
  const canonicalText = report?.canonicalText || standardizedScript || "";
  const sourceLineSpans = getLineSpans(report?.rawText || "");
  const canonicalLineSpans = getLineSpans(canonicalText);
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

  const diagnostics = selectPreviewDiagnostics(
    (report?.diagnostics || [])
    .filter((item) => DIAGNOSTIC_PRIORITY[item.severity] <= DIAGNOSTIC_PRIORITY.medium)
    .sort((left, right) => DIAGNOSTIC_PRIORITY[left.severity] - DIAGNOSTIC_PRIORITY[right.severity])
    .map((item) => decorateDiagnostic(item, sourceLineSpans, canonicalLineSpans))
  );
  const overview = buildOverview(report?.diagnostics || []);

  return {
    stats,
    overview,
    diagnostics,
    excerpt,
    hasBlockingIssues: overview.some((item) => item.key === "blocking" && item.count > 0),
    hasFatalIssues: (report?.diagnostics || []).some((item) => item.severity === "fatal"),
  };
}
