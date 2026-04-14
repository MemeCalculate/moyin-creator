import { describe, expect, it } from "vitest";

import { adaptScriptForImport } from "../script-import-adapter";

describe("adaptScriptForImport", () => {
  it("packages standardization result, preview, and parse readiness for import", () => {
    const raw = [
      "Title",
      "Outline: test story",
      "第1集：Meet",
      "1-1 日 外 Campus Gate",
      "ALICE: Hello.",
    ].join("\n");

    const adapted = adaptScriptForImport(raw);

    expect(adapted.success).toBe(true);
    expect(adapted.canImport).toBe(true);
    expect(adapted.requiresReview).toBe(false);
    expect(adapted.standardizedScript).toContain("1-1 日 外 Campus Gate");
    expect(adapted.report).toBe(adapted.result.document);
    expect(adapted.preview?.hasBlockingIssues).toBe(false);
    expect(adapted.parseResult?.episodes.map((episode) => episode.episodeIndex)).toEqual([1]);
  });

  it("surfaces blocking-but-parseable manuscripts as review-required", () => {
    const raw = [
      "Title",
      "Outline: test story",
      "第1集：Meet",
      "1-1 Campus Gate",
      "ALICE: Hello.",
    ].join("\n");

    const adapted = adaptScriptForImport(raw);

    expect(adapted.success).toBe(true);
    expect(adapted.canImport).toBe(true);
    expect(adapted.requiresReview).toBe(true);
    expect(adapted.preview?.hasBlockingIssues).toBe(true);
    expect(adapted.report.diagnostics.some((item) => item.code === "numbered_scene_missing_time_marker")).toBe(true);
  });

  it("marks structurally unparseable manuscripts as not importable", () => {
    const raw = [
      "Title",
      "Outline: test story",
      "ALICE: Hello.",
    ].join("\n");

    const adapted = adaptScriptForImport(raw);

    expect(adapted.success).toBe(true);
    expect(adapted.canImport).toBe(false);
    expect(adapted.hasFatalIssues).toBe(true);
    expect(adapted.preview?.hasFatalIssues).toBe(true);
    expect(adapted.report.diagnostics.some((item) => item.code === "fatal_no_scene_detected")).toBe(true);
  });
});
