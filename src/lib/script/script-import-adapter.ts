import type {
  CanonicalScriptDocument,
  StandardizeScriptParseResult,
  StandardizeScriptResult,
} from "@/types/script";
import {
  buildStandardizationPreview,
  type StandardizationPreview,
} from "./script-standardization-preview";
import { standardizeScriptForImport } from "./script-standardizer";

export interface ScriptImportAdapterResult {
  success: boolean;
  canImport: boolean;
  requiresReview: boolean;
  hasFatalIssues: boolean;
  report: CanonicalScriptDocument;
  standardizedScript: string;
  preview: StandardizationPreview | null;
  parseResult?: StandardizeScriptParseResult;
  result: StandardizeScriptResult;
}

export function adaptScriptForImport(rawText: string): ScriptImportAdapterResult {
  const result = standardizeScriptForImport(rawText);
  const report = result.document;
  const standardizedScript = report.canonicalText;
  const preview = buildStandardizationPreview(report, standardizedScript);

  return {
    success: result.success,
    canImport: result.success && !result.hasFatalIssues && Boolean(result.parseResult),
    requiresReview: Boolean(preview?.hasBlockingIssues),
    hasFatalIssues: result.hasFatalIssues,
    report,
    standardizedScript,
    preview,
    parseResult: result.parseResult,
    result,
  };
}
