import { describe, expect, it } from "vitest";

import { buildStandardizationPreview } from "../script-standardization-preview";

describe("buildStandardizationPreview", () => {
  it("extracts stats, prominent diagnostics, and a canonical excerpt", () => {
    const preview = buildStandardizationPreview(
      {
        rawText: "原始文本",
        canonicalText: "第1集\n1-1 日 外 校门口\n人物：林夏\n林夏：我回来了。\n△林夏抬头",
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "fatal-1",
            severity: "fatal",
            code: "fatal_no_scene_detected",
            message: "仍有场景头未识别",
          },
          {
            id: "high-1",
            severity: "high",
            code: "bio_compact_entries_split",
            message: "人物小传已拆分，请人工复核",
          },
          {
            id: "info-1",
            severity: "info",
            code: "normalized_alias",
            message: "已归一化角色别名",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 1,
          dialogueCount: 1,
        },
      },
      "第1集\n1-1 日 外 校门口\n人物：林夏\n林夏：我回来了。\n△林夏抬头"
    );

    expect(preview).not.toBeNull();
    expect(preview?.stats).toEqual([
      { label: "集", value: 1 },
      { label: "场", value: 1 },
      { label: "角色", value: 1 },
      { label: "对白", value: 1 },
    ]);
    expect(preview?.diagnostics).toHaveLength(2);
    expect(preview?.diagnostics.map((item) => item.message)).toEqual([
      "仍有场景头未识别",
      "人物小传已拆分，请人工复核",
    ]);
    expect(preview?.excerpt).toEqual([
      "第1集",
      "1-1 日 外 校门口",
      "人物：林夏",
      "林夏：我回来了。",
      "△林夏抬头",
    ]);
    expect(preview?.hasFatalIssues).toBe(true);
  });

  it("falls back to standardized script when report is unavailable", () => {
    const preview = buildStandardizationPreview(null, "\n\n第1集\n\n1-1 日 外 校门口\n");

    expect(preview).not.toBeNull();
    expect(preview?.stats).toEqual([]);
    expect(preview?.diagnostics).toEqual([]);
    expect(preview?.excerpt).toEqual(["第1集", "1-1 日 外 校门口"]);
    expect(preview?.hasFatalIssues).toBe(false);
  });

  it("formats diagnostic locations and preserves suggested fixes for preview cards", () => {
    const canonicalText = ["第1集：相遇", "第一场 学校门口", "马一花：我来了。"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "high-1",
            severity: "high",
            code: "unresolved_loose_scene_label",
            message: "Loose scene label still needs normalization: 第一场 学校门口",
            sourceStart: canonicalText.indexOf("第一场 学校门口"),
            sourceEnd: canonicalText.indexOf("第一场 学校门口") + "第一场 学校门口".length,
            canonicalStart: canonicalText.indexOf("第一场 学校门口"),
            canonicalEnd: canonicalText.indexOf("第一场 学校门口") + "第一场 学校门口".length,
            suggestedFix: "Add scene headers like `1-1 日 外 学校门口`.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 0,
          characterCount: 1,
          dialogueCount: 1,
        },
      },
      canonicalText
    );

    expect(preview?.diagnostics).toEqual([
      expect.objectContaining({
        code: "unresolved_loose_scene_label",
        sourceLocationLabel: "原稿第 2 行",
        sourceContextLine: "第一场 学校门口",
        locationLabel: "标准稿第 2 行",
        contextLine: "第一场 学校门口",
        suggestedFix: "Add scene headers like `1-1 日 外 学校门口`.",
      }),
    ]);
  });

  it("builds acceptance overview counts for blocking issues, inferred structure, and auto-fixes", () => {
    const canonicalText = ["第1集：相遇", "1-1 日 外 学校门口", "人物：ALICE、BOB"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "fatal-1",
            severity: "fatal",
            code: "fatal_no_scene_detected",
            message: "No parser-friendly scene header was recognized after canonicalization.",
          },
          {
            id: "inferred-1",
            severity: "medium",
            code: "inferred_scene_character_lines_inserted",
            message: "Inserted inferred character line: 人物：ALICE、BOB",
          },
          {
            id: "inferred-2",
            severity: "high",
            code: "episode_default_scene_fallback",
            message: "第2集 fell back to a default scene because no parser-friendly scene header was found.",
          },
          {
            id: "fixed-1",
            severity: "medium",
            code: "dense_paragraphs_split",
            message: "Dense screenplay paragraphs were split into structural lines before parsing.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 2,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 1 },
      { key: "inferred", count: 2 },
      { key: "autofixed", count: 1 },
    ]);
  });

  it("selects representative diagnostics across blocking, inferred, and auto-fixed categories", () => {
    const canonicalText = ["第1集：相遇", "1-1 日 外 学校门口", "人物：ALICE、BOB"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-1",
            severity: "fatal",
            code: "fatal_no_scene_detected",
            message: "No parser-friendly scene header was recognized after canonicalization.",
          },
          {
            id: "blocking-2",
            severity: "high",
            code: "unresolved_loose_scene_label",
            message: "Loose scene label still needs normalization: 第一场 学校门口",
          },
          {
            id: "inferred-1",
            severity: "medium",
            code: "inferred_scene_character_lines_inserted",
            message: "Inserted inferred character line: 人物：ALICE、BOB",
          },
          {
            id: "fixed-1",
            severity: "medium",
            code: "dense_paragraphs_split",
            message: "Dense screenplay paragraphs were split into structural lines before parsing.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 2,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.diagnostics.map((item) => item.code)).toEqual([
      "fatal_no_scene_detected",
      "inferred_scene_character_lines_inserted",
      "dense_paragraphs_split",
    ]);
  });

  it("treats blocking issues as requiring review even when there is no fatal diagnostic", () => {
    const canonicalText = ["第1集：相遇", "第一场 学校门口", "马一花：我来了。"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-1",
            severity: "high",
            code: "unresolved_loose_scene_label",
            message: "Loose scene label still needs normalization: 第一场 学校门口",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 0,
          characterCount: 1,
          dialogueCount: 1,
        },
      },
      canonicalText
    );

    expect(preview?.hasFatalIssues).toBe(false);
    expect(preview?.hasBlockingIssues).toBe(true);
  });
});
