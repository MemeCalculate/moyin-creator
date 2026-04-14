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
  it("treats residual multi-speaker dialogue lines as blocking issues", () => {
    const canonicalText = ["\u7b2c1\u96c6\uff1aMeet", "1-1 \u65e5 \u5916 Campus Gate", "ALICE: HelloBOB: Follow me."].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-2",
            severity: "high",
            code: "multiple_dialogue_markers_same_line",
            message: "Multiple dialogue markers remain on the same line: ALICE: HelloBOB: Follow me.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 2,
          dialogueCount: 1,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 1 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 0 },
    ]);
    expect(preview?.hasBlockingIssues).toBe(true);
  });

  it("counts normalized aliases as auto-fixed acceptance items", () => {
    const canonicalText = ["\u7b2c1\u96c6\uff1aMeet", "1-1 \u65e5 \u5916 Campus Gate", "\u4eba\u7269\uff1aALICE\u3001BOB"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {
          "ALICE\uff08OS\uff09": "ALICE",
        },
        traces: [],
        diagnostics: [
          {
            id: "autofixed-2",
            severity: "medium",
            code: "normalized_alias",
            message: "Normalized character alias `ALICE\uff08OS\uff09` to `ALICE`.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 2,
          dialogueCount: 1,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 0 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 1 },
    ]);
    expect(preview?.hasBlockingIssues).toBe(false);
  });

  it("counts normalized scene headers as auto-fixed acceptance items", () => {
    const canonicalText = ["\u7b2c1\u96c6\uff1aMeet", "1-1 \u65e5 \u5916 Campus Gate", "ALICE: Hello."].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "autofixed-3",
            severity: "medium",
            code: "scene_headers_normalized",
            message: "Normalized scene header: 1-1 \u5916 \u65e5 Campus Gate -> 1-1 \u65e5 \u5916 Campus Gate",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 1,
          dialogueCount: 1,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 0 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 1 },
    ]);
  });

  it("counts normalized character bio section headers as auto-fixed acceptance items", () => {
    const canonicalText = ["Title", "\u4eba\u7269\u5c0f\u4f20\uff1a", "ALICE\uff1a\u5e74\u9f84\uff1a18", "\u7b2c1\u96c6\uff1aMeet"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "autofixed-4",
            severity: "medium",
            code: "character_bio_section_normalized",
            message: "Normalized character bio section header: 主要角色： -> 人物小传：",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 0,
          characterCount: 1,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 0 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 1 },
    ]);
  });

  it("counts inferred character bio section insertions as inferred acceptance items", () => {
    const canonicalText = ["Title", "\u4eba\u7269\u5c0f\u4f20\uff1a", "\u4e00\u3001\u6838\u5fc3\u4e3b\u89d2", "ALICE\uff1a\u5e74\u9f84\uff1a18", "\u7b2c1\u96c6\uff1aMeet"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "inferred-bio-1",
            severity: "medium",
            code: "character_bio_section_inferred",
            message: "Inserted missing character bio section header before: 一、核心主角",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 0,
          characterCount: 1,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 0 },
      { key: "inferred", count: 1 },
      { key: "autofixed", count: 0 },
    ]);
  });

  it("counts normalized markdown character bios as auto-fixed acceptance items", () => {
    const canonicalText = ["Title", "\u4eba\u7269\u5c0f\u4f20\uff1a", "ALICE\uff1a18\u5c81\uff0c\u8f6c\u5b66\u751f", "\u7b2c1\u96c6\uff1aMeet"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "autofixed-markdown-bio-1",
            severity: "medium",
            code: "markdown_character_bios_normalized",
            message: "Normalized markdown-style character bio headings into parser-friendly lines.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 0,
          characterCount: 1,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 0 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 1 },
    ]);
  });

  it("treats unparsed character bio sections as blocking acceptance items", () => {
    const canonicalText = ["Title", "\u4eba\u7269\u5c0f\u4f20\uff1a", "\u8fd9\u662f\u4e00\u6bb5\u6ca1\u6709\u89d2\u8272\u540d\u7684\u63cf\u8ff0\u3002", "\u7b2c1\u96c6\uff1aMeet"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-bio-1",
            severity: "high",
            code: "character_bio_entries_unparsed",
            message: "Character bio section was detected but no characters could be parsed from it.",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 0,
          characterCount: 0,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 1 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 0 },
    ]);
  });

  it("treats numbered scene headers without time markers as blocking acceptance items", () => {
    const canonicalText = ["Title", "\u7b2c1\u96c6\uff1aMeet", "1-1 Campus Gate"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-scene-time-1",
            severity: "high",
            code: "numbered_scene_missing_time_marker",
            message: "Numbered scene header still lacks a recognizable time marker: 1-1 Campus Gate",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 0,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 1 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 0 },
    ]);
  });

  it("treats numbered scene headers without interior markers as blocking acceptance items", () => {
    const canonicalText = ["Title", "\u7b2c1\u96c6\uff1aMeet", "1-1 \u65e5 Campus Gate"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-scene-interior-1",
            severity: "high",
            code: "numbered_scene_missing_interior_marker",
            message: "Numbered scene header still lacks an interior marker: 1-1 日 Campus Gate",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 0,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 1 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 0 },
    ]);
  });

  it("treats numbered scene headers without locations as blocking acceptance items", () => {
    const canonicalText = ["Title", "\u7b2c1\u96c6\uff1aMeet", "1-1 \u65e5 \u5916"].join("\n");
    const preview = buildStandardizationPreview(
      {
        rawText: canonicalText,
        canonicalText,
        blocks: [],
        aliasMap: {},
        traces: [],
        diagnostics: [
          {
            id: "blocking-scene-location-1",
            severity: "high",
            code: "numbered_scene_missing_location",
            message: "Numbered scene header still lacks a location payload: 1-1 日 外",
          },
        ],
        stats: {
          episodeCount: 1,
          sceneCount: 1,
          characterCount: 0,
          dialogueCount: 0,
        },
      },
      canonicalText
    );

    expect(preview?.overview).toEqual([
      { key: "blocking", count: 1 },
      { key: "inferred", count: 0 },
      { key: "autofixed", count: 0 },
    ]);
  });
});
