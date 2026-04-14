import { describe, expect, it } from 'vitest';
import { standardizeScriptForImport } from '@/lib/script/script-standardizer';

describe('standardizeScriptForImport', () => {
  it('splits compact bios and normalizes loose scene headers', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '人物小传：马一花（17）：转学生，倔强。陈茉莉（17）：班长，克制。',
      '第一集：相遇',
      '第一场 外 日 学校门口',
      '马一花：我转学来的。',
      '陈茉莉：跟我走。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('人物小传：');
    expect(result.document.canonicalText).toContain('马一花（17）：转学生，倔强。');
    expect(result.document.canonicalText).toContain('陈茉莉（17）：班长，克制。');
    expect(result.document.canonicalText).toContain('1-1 日 外 学校门口');
    expect(result.hasFatalIssues).toBe(false);
  });

  it('splits compact bios even when consecutive entries are not separated by punctuation', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '人物小传：马一花（17）：转学生 倔强 陈茉莉（17）：班长 克制',
      '第一集：相遇',
      '1-1 日 外 学校门口',
      '马一花：我转学来的。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('人物小传：\n马一花（17）：转学生 倔强\n陈茉莉（17）：班长 克制');
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === '马一花')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === '陈茉莉')).toBe(true);
  });

  it('flags fatal issues when canonical text still lacks structured scenes', () => {
    const raw = '没有标题也没有集场结构，只有一大段叙述文本';

    const result = standardizeScriptForImport(raw);

    expect(result.hasFatalIssues).toBe(true);
    expect(result.document.diagnostics.some((item) => item.code === 'fatal_no_scene_detected')).toBe(true);
  });

  it('reports unresolved loose scene labels with the original line content', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '第一集：相遇',
      '第一场 学校门口',
      '马一花：我来了。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.hasFatalIssues).toBe(true);
    expect(
      result.document.diagnostics.some(
        (item) =>
          item.code === 'unresolved_loose_scene_label' &&
          item.message.includes('第一场 学校门口'),
      ),
    ).toBe(true);
  });

  it('returns parse-ready data when canonicalization succeeds', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '人物小传：马一花（17）：转学生，倔强。',
      '第一集：相遇',
      '1-1 日 外 学校门口',
      '人物：马一花',
      '马一花：我来了。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.parseResult?.episodes.length).toBe(1);
    expect(result.parseResult?.scriptData.scenes.length).toBe(1);
  });

  it('injects a character line for scenes that only expose speakers via dialogue', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '第一集：相遇',
      '1-1 日 外 学校门口',
      '马一花：我来了。',
      '陈茉莉：跟我走。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('1-1 日 外 学校门口\n人物：马一花、陈茉莉');
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === '人物')).toBe(false);
  });

  it('extracts mixed scene-header character tags into a standalone character line', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '第一集：相遇',
      '第一场 外 日 学校门口 人物：马一花、陈茉莉',
      '△两人对视。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('1-1 日 外 学校门口\n人物：马一花、陈茉莉');
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === '马一花')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === '陈茉莉')).toBe(true);
  });

  it('reports which episode fell back to a default scene because no parser-friendly scene header was found', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '第一集：相遇',
      '1-1 日 外 学校门口',
      '马一花：我来了。',
      '第二集：失联',
      '这一集只有一整段叙述，没有任何标准场景头。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(
      result.document.diagnostics.some(
        (item) =>
          item.code === 'episode_default_scene_fallback' &&
          item.message.includes('第2集'),
      ),
    ).toBe(true);
  });

  it('inserts synthetic episode markers from scene numbering and splits dense dialogue paragraphs', () => {
    const raw = [
      '《样例》',
      '大纲：这是一个测试故事。',
      '1-1 外 日 校门口马一花：我转学来的。△她背着书包。陈茉莉：跟我走。',
      '2-1 外 夜 天台马一花：今晚见。',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('第1集');
    expect(result.document.canonicalText).toContain('第2集');
    expect(result.document.canonicalText).toContain('1-1 日 外 校门口');
    expect(result.document.canonicalText).toContain('2-1 夜 外 天台');
    expect(result.document.canonicalText).toContain('\n马一花：我转学来的。');
    expect(result.document.canonicalText).toContain('\n陈茉莉：跟我走。');
    expect(result.document.diagnostics.some((item) => item.code === 'dense_paragraphs_split')).toBe(true);
    expect(result.document.diagnostics.some((item) => item.code === 'synthetic_episode_markers_inserted')).toBe(true);
    expect(result.parseResult?.episodes.length).toBe(2);
    expect(result.parseResult?.scriptData.scenes.length).toBe(2);
  });
});
