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
});
