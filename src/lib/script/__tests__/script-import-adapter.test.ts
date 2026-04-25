import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { adaptScriptForImport } from "../script-import-adapter";

const DEMO_SAMPLE_URL = new URL(
  "../../../../demo-data/screenplay-import-adapter/campus-gate-raw.txt",
  import.meta.url,
);

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

  it("keeps the checked-in raw demo screenplay import-ready after adaptation", () => {
    const raw = readFileSync(DEMO_SAMPLE_URL, "utf8");

    const adapted = adaptScriptForImport(raw);

    expect(adapted.success).toBe(true);
    expect(adapted.canImport).toBe(true);
    expect(adapted.requiresReview).toBe(false);
    expect(adapted.hasFatalIssues).toBe(false);
    expect(adapted.report.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "scene_headers_normalized",
        "bio_compact_entries_split",
        "dense_paragraphs_split",
        "scene_header_character_tags_extracted",
      ]),
    );
    expect(adapted.preview?.overview).toEqual([
      { key: "blocking", count: 0 },
      { key: "inferred", count: 1 },
      { key: "autofixed", count: 3 },
    ]);
    expect(adapted.parseResult?.scriptData.characters.map((item) => item.name).sort()).toEqual([
      "陈茉莉",
      "马一花",
    ]);
  });
});
