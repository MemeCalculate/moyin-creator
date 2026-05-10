import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  mockStore: null as ReturnType<typeof createMockStore> | null,
  standardizeScriptForImport: vi.fn(),
  populateSeriesMetaFromImport: vi.fn(),
}));

vi.mock("@/stores/script-store", () => ({
  useScriptStore: {
    getState: () => mocked.mockStore,
  },
}));

vi.mock("@/stores/character-library-store", () => ({
  useCharacterLibraryStore: {
    getState: () => ({}),
  },
}));

vi.mock("@/stores/api-config-store", () => ({
  useAPIConfigStore: {
    getState: () => ({}),
  },
}));

vi.mock("@/lib/ai/feature-router", () => ({
  callFeatureAPI: vi.fn(),
}));

vi.mock("@/lib/ai/batch-processor", () => ({
  processBatched: vi.fn(),
}));

vi.mock("@/lib/utils/retry", () => ({
  retryOperation: vi.fn(),
}));

vi.mock("@/lib/api-key-manager", () => ({
  ApiKeyManager: class {},
}));

vi.mock("@/lib/constants/visual-styles", () => ({
  getStyleDescription: vi.fn(() => ""),
  getMediaType: vi.fn(() => "image"),
}));

vi.mock("@/lib/constants/cinematography-profiles", () => ({
  buildCinematographyGuidance: vi.fn(() => ""),
}));

vi.mock("@/lib/generation/media-type-tokens", () => ({
  getMediaTypeGuidance: vi.fn(() => ""),
}));

vi.mock("../character-stage-analyzer", () => ({
  getVariationForEpisode: vi.fn(() => null),
}));

vi.mock("../viewpoint-analyzer", () => ({
  analyzeSceneViewpoints: vi.fn(),
}));

vi.mock("@/lib/utils/concurrency", () => ({
  runStaggered: vi.fn(),
}));

vi.mock("../shot-calibration-stages", () => ({
  calibrateShotsMultiStage: vi.fn(),
}));

vi.mock("../series-meta-sync", () => ({
  populateSeriesMetaFromImport: mocked.populateSeriesMetaFromImport,
  buildSeriesContextSummary: vi.fn(() => ""),
}));

vi.mock("../script-standardizer", () => ({
  standardizeScriptForImport: mocked.standardizeScriptForImport,
}));

import { importFullScript } from "../full-script-service";

interface MockProjectData {
  rawScript: string;
  standardizedScript: string;
  standardizationReport: unknown;
  standardizationGeneratedAt: number | undefined;
  projectBackground: unknown;
  episodeRawScripts: unknown[];
  scriptData: unknown;
  parseStatus: string;
  parseError?: string;
  metadataMarkdown: string;
  seriesMeta: unknown;
}

function createMockStore() {
  const store = {
    projects: {} as Record<string, MockProjectData>,
    ensureProject(projectId: string) {
      if (!store.projects[projectId]) {
        store.projects[projectId] = {
          rawScript: "",
          standardizedScript: "",
          standardizationReport: null,
          standardizationGeneratedAt: undefined,
          projectBackground: null,
          episodeRawScripts: [],
          scriptData: null,
          parseStatus: "idle",
          parseError: undefined,
          metadataMarkdown: "",
          seriesMeta: null,
        };
      }
    },
    setRawScript(projectId: string, rawScript: string) {
      store.ensureProject(projectId);
      store.projects[projectId].rawScript = rawScript;
    },
    setStandardizedScript(projectId: string, standardizedScript: string) {
      store.ensureProject(projectId);
      store.projects[projectId].standardizedScript = standardizedScript;
      store.projects[projectId].standardizationGeneratedAt = 1234567890;
    },
    setStandardizationReport(projectId: string, report: unknown) {
      store.ensureProject(projectId);
      store.projects[projectId].standardizationReport = report;
      store.projects[projectId].standardizationGeneratedAt = 1234567890;
    },
    setProjectBackground(projectId: string, background: unknown) {
      store.ensureProject(projectId);
      store.projects[projectId].projectBackground = background;
    },
    setEpisodeRawScripts(projectId: string, episodes: unknown[]) {
      store.ensureProject(projectId);
      store.projects[projectId].episodeRawScripts = episodes;
    },
    setScriptData(projectId: string, scriptData: unknown) {
      store.ensureProject(projectId);
      store.projects[projectId].scriptData = scriptData;
    },
    setParseStatus(projectId: string, status: string, error?: string) {
      store.ensureProject(projectId);
      store.projects[projectId].parseStatus = status;
      store.projects[projectId].parseError = error;
    },
    setSeriesMeta(projectId: string, meta: unknown) {
      store.ensureProject(projectId);
      store.projects[projectId].seriesMeta = meta;
    },
    setMetadataMarkdown(projectId: string, markdown: string) {
      store.ensureProject(projectId);
      store.projects[projectId].metadataMarkdown = markdown;
    },
  };

  return store;
}

describe("importFullScript", () => {
  beforeEach(() => {
    mocked.mockStore = createMockStore();
    mocked.standardizeScriptForImport.mockReset();
    mocked.populateSeriesMetaFromImport.mockReset();
    mocked.populateSeriesMetaFromImport.mockReturnValue({
      title: "测试剧",
      genre: "校园",
      language: "zh",
      characters: [],
    });
  });

  it("persists canonical import artifacts and parsed script data on success", async () => {
    const document = {
      rawText: "原始剧本",
      canonicalText: "第1集\n1-1 日 外 校门口",
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
    };
    const background = {
      title: "测试剧",
      outline: "少女重返校园。",
      characterBios: "林夏：转学生",
      genre: "校园",
      era: "现代",
    };
    const episodes = [
      {
        episodeIndex: 1,
        title: "第1集 校门口",
        synopsis: "开场建立关系。",
        keyEvents: ["开学"],
        rawContent: "1-1 日 外 校门口",
        scenes: [
          {
            sceneNumber: 1,
            title: "校门口",
            location: "校门口",
            time: "日",
            characters: [],
            content: "",
            dialogues: [],
            actionLines: [],
          },
        ],
      },
    ];
    const scriptData = {
      title: "测试剧",
      language: "zh",
      episodes: [
        {
          id: "ep-1",
          index: 1,
          title: "第1集 校门口",
          synopsis: "开场建立关系。",
          sceneIds: ["scene-1"],
        },
      ],
      scenes: [
        {
          id: "scene-1",
          episodeId: "ep-1",
          sceneNumber: 1,
          title: "校门口",
        },
      ],
      characters: [],
    };

    mocked.standardizeScriptForImport.mockReturnValue({
      success: true,
      hasFatalIssues: false,
      document,
      parseResult: {
        background,
        episodes,
        scriptData,
      },
    });

    const result = await importFullScript("原始剧本", "project-1", {
      styleId: "2d_ghibli",
      promptLanguage: "zh",
    });

    expect(result.success).toBe(true);
    expect(result.standardizedScript).toBe(document.canonicalText);
    expect(result.standardizationReport).toBe(document);
    expect(result.scriptData).toBe(scriptData);
    expect(mocked.mockStore?.projects["project-1"]).toMatchObject({
      rawScript: "原始剧本",
      standardizedScript: document.canonicalText,
      standardizationReport: document,
      projectBackground: background,
      episodeRawScripts: episodes,
      scriptData,
      parseStatus: "ready",
      seriesMeta: {
        title: "测试剧",
        genre: "校园",
        language: "zh",
        characters: [],
      },
    });
    expect(mocked.mockStore?.projects["project-1"].metadataMarkdown).toContain("测试剧");
  });

  it("returns diagnostics-driven failure while still persisting canonical artifacts", async () => {
    const document = {
      rawText: "原始剧本",
      canonicalText: "人物：林夏",
      blocks: [],
      aliasMap: {},
      traces: [],
      diagnostics: [
        {
          id: "diag-1",
          severity: "fatal",
          code: "fatal_no_scene_detected",
          message: "标准化后仍未识别到任何场景头",
        },
      ],
      stats: {
        episodeCount: 0,
        sceneCount: 0,
        characterCount: 1,
        dialogueCount: 0,
      },
    };

    mocked.standardizeScriptForImport.mockReturnValue({
      success: true,
      hasFatalIssues: true,
      document,
    });

    const result = await importFullScript("原始剧本", "project-2");

    expect(result.success).toBe(false);
    expect(result.error).toBe("标准化后仍未识别到任何场景头");
    expect(result.standardizedScript).toBe(document.canonicalText);
    expect(result.standardizationReport).toBe(document);
    expect(mocked.mockStore?.projects["project-2"]).toMatchObject({
      rawScript: "原始剧本",
      standardizedScript: document.canonicalText,
      standardizationReport: document,
      parseStatus: "error",
      parseError: "标准化后仍未识别到任何场景头",
    });
    expect(mocked.mockStore?.projects["project-2"].scriptData).toBeNull();
  });
});
