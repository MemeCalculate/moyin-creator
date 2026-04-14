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

  it('flags fatal issues when canonical text still lacks structured scenes', () => {
    const raw = '没有标题也没有集场结构，只有一大段叙述文本';

    const result = standardizeScriptForImport(raw);

    expect(result.hasFatalIssues).toBe(true);
    expect(result.document.diagnostics.some((item) => item.code === 'fatal_no_scene_detected')).toBe(true);
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
});
