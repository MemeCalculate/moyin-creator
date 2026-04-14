import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  adaptScriptForImport,
  type ScriptImportAdapterResult,
} from "../src/lib/script/script-import-adapter";

export interface ScreenplayImportToolOptions {
  inputPath: string;
  outputDir?: string;
}

export interface ScreenplayImportToolArtifacts {
  outputDir: string;
  standardizedScriptPath: string;
  summaryPath: string;
  reportPath: string;
  previewPath: string;
  parseResultPath?: string;
  adapted: ScriptImportAdapterResult;
}

interface CliArgs {
  inputPath: string;
  outputDir?: string;
}

function getOverviewCount(
  adapted: ScriptImportAdapterResult,
  key: "blocking" | "inferred" | "autofixed",
): number {
  return adapted.preview?.overview.find((item) => item.key === key)?.count ?? 0;
}

export function resolveScreenplayImportOutputDir(inputPath: string, outputDir?: string): string {
  if (outputDir) {
    return path.resolve(outputDir);
  }

  const parsed = path.parse(path.resolve(inputPath));
  return path.join(parsed.dir, `${parsed.name}.screenplay-import`);
}

export function buildScreenplayImportSummary(adapted: ScriptImportAdapterResult) {
  return {
    success: adapted.success,
    canImport: adapted.canImport,
    requiresReview: adapted.requiresReview,
    hasFatalIssues: adapted.hasFatalIssues,
    stats: adapted.report.stats,
    blockingIssueCount: getOverviewCount(adapted, "blocking"),
    inferredItemCount: getOverviewCount(adapted, "inferred"),
    autofixedItemCount: getOverviewCount(adapted, "autofixed"),
    diagnosticCodes: adapted.report.diagnostics.map((item) => item.code),
  };
}

export async function runScreenplayImportTool(
  options: ScreenplayImportToolOptions,
): Promise<ScreenplayImportToolArtifacts> {
  const inputPath = path.resolve(options.inputPath);
  const rawText = await readFile(inputPath, "utf8");
  const adapted = adaptScriptForImport(rawText);
  const outputDir = resolveScreenplayImportOutputDir(inputPath, options.outputDir);

  await mkdir(outputDir, { recursive: true });

  const standardizedScriptPath = path.join(outputDir, "standardized-script.txt");
  const summaryPath = path.join(outputDir, "adapter-summary.json");
  const reportPath = path.join(outputDir, "standardization-report.json");
  const previewPath = path.join(outputDir, "standardization-preview.json");
  const parseResultPath = adapted.parseResult
    ? path.join(outputDir, "parse-result.json")
    : undefined;

  await writeFile(standardizedScriptPath, adapted.standardizedScript, "utf8");
  await writeFile(summaryPath, `${JSON.stringify(buildScreenplayImportSummary(adapted), null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(adapted.report, null, 2)}\n`, "utf8");
  await writeFile(previewPath, `${JSON.stringify(adapted.preview, null, 2)}\n`, "utf8");

  if (parseResultPath && adapted.parseResult) {
    await writeFile(parseResultPath, `${JSON.stringify(adapted.parseResult, null, 2)}\n`, "utf8");
  }

  return {
    outputDir,
    standardizedScriptPath,
    summaryPath,
    reportPath,
    previewPath,
    parseResultPath,
    adapted,
  };
}

function formatRunSummary(result: ScreenplayImportToolArtifacts): string {
  const summary = buildScreenplayImportSummary(result.adapted);
  return [
    "[screenplay-import-adapter]",
    `input: ${result.adapted.report.rawText.length} chars`,
    `outputDir: ${result.outputDir}`,
    `canImport: ${summary.canImport}`,
    `requiresReview: ${summary.requiresReview}`,
    `hasFatalIssues: ${summary.hasFatalIssues}`,
    `blockingIssueCount: ${summary.blockingIssueCount}`,
    `inferredItemCount: ${summary.inferredItemCount}`,
    `autofixedItemCount: ${summary.autofixedItemCount}`,
    `standardizedScript: ${result.standardizedScriptPath}`,
    `summary: ${result.summaryPath}`,
    `report: ${result.reportPath}`,
    `preview: ${result.previewPath}`,
    result.parseResultPath ? `parseResult: ${result.parseResultPath}` : "parseResult: <none>",
  ].join("\n");
}

function parseCliArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  let outputDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--out-dir") {
      outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    positional.push(token);
  }

  if (!positional[0]) {
    throw new Error(
      "Usage: node ./scripts/run-screenplay-import-adapter.mjs <input-file> [--out-dir <dir>]",
    );
  }

  return {
    inputPath: positional[0],
    outputDir,
  };
}

async function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const result = await runScreenplayImportTool(args);
    process.stdout.write(`${formatRunSummary(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
