import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCREENPLAY_IMPORT_ADAPTER_USAGE,
  buildScreenplayImportSummary,
  parseCliArgs,
  resolveScreenplayImportOutputDir,
  runScreenplayImportBatch,
  runScreenplayImportTool,
} from "../../../../scripts/screenplay-import-adapter";
import {
  SCREENPLAY_IMPORT_ADAPTER_RUNNER_USAGE,
  buildScreenplayImportRunnerPlan,
  shouldShowScreenplayImportRunnerHelp,
} from "../../../../scripts/run-screenplay-import-adapter.mjs";

describe("screenplay-import-adapter CLI tool", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("resolves a default standalone output directory next to the input file", () => {
    const outputDir = resolveScreenplayImportOutputDir("C:\\demo\\pilot.txt");

    expect(outputDir).toBe(path.join("C:\\demo", "pilot.screenplay-import"));
  });

  it("parses help flags without requiring an input file", () => {
    expect(parseCliArgs(["--help"])).toEqual({
      showHelp: true,
      outputDir: undefined,
    });
    expect(parseCliArgs(["-h"])).toEqual({
      showHelp: true,
      outputDir: undefined,
    });
    expect(SCREENPLAY_IMPORT_ADAPTER_USAGE).toContain("run-screenplay-import-adapter.mjs");
  });

  it("parses multiple input paths for batch mode", () => {
    expect(parseCliArgs(["pilot-a.txt", "pilot-b.txt", "--out-dir", "exports"])).toEqual({
      inputPaths: ["pilot-a.txt", "pilot-b.txt"],
      outputDir: "exports",
    });
  });

  it("writes standalone import artifacts to disk", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "screenplay-import-tool-"));
    tempDirs.push(tempDir);

    const inputPath = path.join(tempDir, "pilot.txt");
    await writeFile(
      inputPath,
      [
        "Title",
        "Outline: test story",
        "第1章：Meet",
        "1-1 日 外 Campus Gate",
        "ALICE",
        "Hello there.",
      ].join("\n"),
      "utf8",
    );

    const result = await runScreenplayImportTool({ inputPath });
    const summary = JSON.parse(await readFile(result.summaryPath, "utf8"));
    const standardizedScript = await readFile(result.standardizedScriptPath, "utf8");
    const preview = JSON.parse(await readFile(result.previewPath, "utf8"));

    expect(result.outputDir).toBe(path.join(tempDir, "pilot.screenplay-import"));
    expect(standardizedScript).toContain("第1集：Meet");
    expect(standardizedScript).toContain("ALICE: Hello there.");
    expect(summary.canImport).toBe(true);
    expect(summary.autofixedItemCount).toBeGreaterThan(0);
    expect(preview.hasBlockingIssues).toBe(false);
    expect(result.parseResultPath).toBeDefined();
  });

  it("processes directories in batch mode and keeps outputs separated", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "screenplay-import-batch-"));
    tempDirs.push(tempDir);

    const sourceDir = path.join(tempDir, "inputs");
    const nestedDir = path.join(sourceDir, "nested");
    const outputDir = path.join(tempDir, "exports");
    await Promise.all([mkdir(sourceDir, { recursive: true }), mkdir(nestedDir, { recursive: true })]);

    const scriptText = [
      "Title",
      "Outline: test story",
      "绗?绔狅細Meet",
      "1-1 鏃?澶?Campus Gate",
      "ALICE",
      "Hello there.",
    ].join("\n");

    await Promise.all([
      writeFile(path.join(sourceDir, "pilot-a.txt"), scriptText, "utf8"),
      writeFile(path.join(nestedDir, "pilot-b.md"), scriptText, "utf8"),
    ]);

    const batch = await runScreenplayImportBatch({
      inputPaths: [sourceDir],
      outputDir,
    });

    expect(batch.discoveredInputPaths).toHaveLength(2);
    expect(batch.results).toHaveLength(2);
    expect(batch.results.map((item) => path.basename(item.outputDir)).sort()).toEqual([
      "pilot-a.screenplay-import",
      "pilot-b.screenplay-import",
    ]);
    expect(
      batch.results.some((item) =>
        item.outputDir.includes(path.join("exports", "nested", "pilot-b.screenplay-import")),
      ),
    ).toBe(true);
  });

  it("builds a compact standalone summary for review tooling", () => {
    const summary = buildScreenplayImportSummary({
      success: true,
      canImport: true,
      requiresReview: true,
      hasFatalIssues: false,
      report: {
        rawText: "RAW",
        canonicalText: "CANONICAL",
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "diag-1",
            severity: "high",
            code: "numbered_scene_missing_time_marker",
            message: "missing time",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 0,
          dialogueCount: 0,
        },
      },
      standardizedScript: "CANONICAL",
      preview: {
        stats: [],
        overview: [
          { key: "blocking", count: 1 },
          { key: "inferred", count: 0 },
          { key: "autofixed", count: 0 },
        ],
        diagnostics: [],
        excerpt: [],
        hasBlockingIssues: true,
        hasFatalIssues: false,
      },
      result: {
        success: true,
        hasFatalIssues: false,
        document: {
          rawText: "RAW",
          canonicalText: "CANONICAL",
          blocks: [],
          aliasMap: {},
          traces: [],
          diagnostics: [],
          stats: {
            episodeCount: 1,
            sceneCount: 1,
            characterCount: 0,
            dialogueCount: 0,
          },
        },
      },
    });

    expect(summary).toMatchObject({
      canImport: true,
      requiresReview: true,
      blockingIssueCount: 1,
      diagnosticCodes: ["numbered_scene_missing_time_marker"],
    });
  });

  it("builds a node-based bundle-and-run plan for the standalone wrapper", () => {
    const repoRoot = "C:\\repo";
    const nodeExecutable = "C:\\Program Files\\nodejs\\node.exe";
    const plan = buildScreenplayImportRunnerPlan({
      repoRoot,
      nodeExecutable,
      cliArgs: ["C:\\scripts\\pilot.txt", "--out-dir", "C:\\exports\\normalized"],
    });

    expect(plan.build.command).toBe(nodeExecutable);
    expect(plan.build.args).toEqual([
      path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--config",
      path.join(repoRoot, "scripts", "vite-node.screenplay-import.config.mts"),
      "--ssr",
      path.join(repoRoot, "scripts", "screenplay-import-adapter.ts"),
      "--outDir",
      path.join(repoRoot, "node_modules", ".cache", "screenplay-import-adapter"),
    ]);
    expect(plan.run.command).toBe(nodeExecutable);
    expect(plan.run.args).toEqual([
      path.join(
        repoRoot,
        "node_modules",
        ".cache",
        "screenplay-import-adapter",
        "screenplay-import-adapter.js",
      ),
      "C:\\scripts\\pilot.txt",
      "--out-dir",
      "C:\\exports\\normalized",
    ]);
  });

  it("detects wrapper help mode without building the adapter bundle", () => {
    expect(shouldShowScreenplayImportRunnerHelp(["--help"])).toBe(true);
    expect(shouldShowScreenplayImportRunnerHelp(["-h"])).toBe(true);
    expect(shouldShowScreenplayImportRunnerHelp(["pilot.txt"])).toBe(false);
    expect(SCREENPLAY_IMPORT_ADAPTER_RUNNER_USAGE).toContain("run-screenplay-import-adapter.mjs");
  });
});
