import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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

export interface ScreenplayImportBatchOptions {
  inputPaths: string[];
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

interface ResolvedScreenplayImportInput {
  inputPath: string;
  basePath: string;
}

export interface ScreenplayImportBatchArtifacts {
  discoveredInputPaths: string[];
  results: ScreenplayImportToolArtifacts[];
}

interface CliArgs {
  inputPaths?: string[];
  outputDir?: string;
  showHelp?: boolean;
}

export const SCREENPLAY_IMPORT_ADAPTER_USAGE =
  "Usage: node ./scripts/run-screenplay-import-adapter.mjs <input-file-or-dir> [more-inputs...] [--out-dir <dir>]";
const SUPPORTED_SCREENPLAY_INPUT_EXTENSIONS = new Set([".txt", ".md"]);

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

function isSupportedScreenplayInputPath(inputPath: string): boolean {
  return SUPPORTED_SCREENPLAY_INPUT_EXTENSIONS.has(path.extname(inputPath).toLowerCase());
}

async function collectScreenplayInputFiles(
  inputPath: string,
  basePath: string,
): Promise<ResolvedScreenplayImportInput[]> {
  const inputStat = await stat(inputPath);
  if (inputStat.isDirectory()) {
    const entries = await readdir(inputPath, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) =>
        collectScreenplayInputFiles(path.join(inputPath, entry.name), basePath),
      ),
    );
    return nested.flat();
  }

  if (!isSupportedScreenplayInputPath(inputPath)) {
    return [];
  }

  return [
    {
      inputPath,
      basePath,
    },
  ];
}

async function resolveScreenplayImportInputs(
  inputPaths: string[],
): Promise<ResolvedScreenplayImportInput[]> {
  const expanded = await Promise.all(
    inputPaths.map(async (candidatePath) => {
      const resolvedPath = path.resolve(candidatePath);
      const candidateStat = await stat(resolvedPath);
      const basePath = candidateStat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);
      return collectScreenplayInputFiles(resolvedPath, basePath);
    }),
  );

  return expanded.flat().sort((left, right) => left.inputPath.localeCompare(right.inputPath));
}

function resolveBatchArtifactOutputDir(
  input: ResolvedScreenplayImportInput,
  outputDir?: string,
): string | undefined {
  if (!outputDir) {
    return undefined;
  }

  const relativeInputPath = path.relative(input.basePath, input.inputPath);
  const relativeDir = path.dirname(relativeInputPath);
  const fileName = path.parse(relativeInputPath).name;

  return path.join(path.resolve(outputDir), relativeDir, `${fileName}.screenplay-import`);
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

export async function runScreenplayImportBatch(
  options: ScreenplayImportBatchOptions,
): Promise<ScreenplayImportBatchArtifacts> {
  const resolvedInputs = await resolveScreenplayImportInputs(options.inputPaths);
  if (resolvedInputs.length === 0) {
    throw new Error("No supported screenplay input files were found. Supported extensions: .txt, .md");
  }

  const results = await Promise.all(
    resolvedInputs.map((input) =>
      runScreenplayImportTool({
        inputPath: input.inputPath,
        outputDir: resolveBatchArtifactOutputDir(input, options.outputDir),
      }),
    ),
  );

  return {
    discoveredInputPaths: resolvedInputs.map((input) => input.inputPath),
    results,
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

function formatBatchRunSummary(result: ScreenplayImportBatchArtifacts): string {
  if (result.results.length === 1) {
    return formatRunSummary(result.results[0]);
  }

  return [
    "[screenplay-import-adapter]",
    `inputs: ${result.discoveredInputPaths.length}`,
    `importReady: ${result.results.filter((item) => item.adapted.canImport).length}`,
    `requiresReview: ${result.results.filter((item) => item.adapted.requiresReview).length}`,
    `fatalIssues: ${result.results.filter((item) => item.adapted.hasFatalIssues).length}`,
    ...result.results.map((item) => `artifact: ${item.outputDir}`),
  ].join("\n");
}

export function parseCliArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  let outputDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      return {
        showHelp: true,
        outputDir,
      };
    }

    if (token === "--out-dir") {
      outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    positional.push(token);
  }

  if (!positional[0]) {
    throw new Error(SCREENPLAY_IMPORT_ADAPTER_USAGE);
  }

  return {
    inputPaths: positional,
    outputDir,
  };
}

async function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.showHelp) {
      process.stdout.write(`${SCREENPLAY_IMPORT_ADAPTER_USAGE}\n`);
      return;
    }

    const result = await runScreenplayImportBatch({
      inputPaths: args.inputPaths ?? [],
      outputDir: args.outputDir,
    });
    process.stdout.write(`${formatBatchRunSummary(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
