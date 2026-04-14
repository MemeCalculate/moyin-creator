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
    const diagnostic = result.document.diagnostics.find(
      (item) =>
        item.code === 'unresolved_loose_scene_label' &&
        item.message.includes('第一场 学校门口'),
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.sourceStart).toBeTypeOf('number');
    expect(diagnostic?.sourceEnd).toBeTypeOf('number');
    expect(diagnostic?.canonicalStart).toBeTypeOf('number');
    expect(diagnostic?.canonicalEnd).toBeTypeOf('number');
    expect(
      raw.slice(diagnostic?.sourceStart ?? 0, diagnostic?.sourceEnd ?? 0),
    ).toBe('第一场 学校门口');
    expect(
      result.document.canonicalText.slice(diagnostic?.canonicalStart ?? 0, diagnostic?.canonicalEnd ?? 0),
    ).toBe('第一场 学校门口');
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
    const diagnostic = result.document.diagnostics.find(
      (item) =>
        item.code === 'episode_default_scene_fallback' &&
        item.message.includes('第2集'),
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.sourceStart).toBeTypeOf('number');
    expect(diagnostic?.canonicalStart).toBeTypeOf('number');
    expect(
      raw.slice(diagnostic?.sourceStart ?? 0, diagnostic?.sourceEnd ?? 0),
    ).toContain('第二集');
    expect(
      result.document.canonicalText.slice(diagnostic?.canonicalStart ?? 0, diagnostic?.canonicalEnd ?? 0),
    ).toContain('失联');
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

  it('audits inferred scene character lines without misreporting synthetic episode markers', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      'ALICE: Hello.',
      'BOB: Follow me.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    const diagnostic = result.document.diagnostics.find(
      (item) => item.code === 'inferred_scene_character_lines_inserted',
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.message).toContain('人物');
    expect(diagnostic?.message).toContain('ALICE');
    expect(result.document.diagnostics.some((item) => item.code === 'synthetic_episode_markers_inserted')).toBe(false);
  });

  it('audits scene-header character tags that were extracted into a standalone character line', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate \u4eba\u7269\uff1aALICE\u3001BOB',
      '\u25b3They look at each other.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    const diagnostic = result.document.diagnostics.find(
      (item) => item.code === 'scene_header_character_tags_extracted',
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.message).toContain('ALICE');
    expect(diagnostic?.message).toContain('BOB');
  });

  it('splits clear multi-speaker dialogue runs onto separate lines', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      'ALICE: Hello. BOB: Follow me.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('ALICE: Hello.\nBOB: Follow me.');
    expect(result.document.diagnostics.some((item) => item.code === 'multiple_dialogue_markers_same_line')).toBe(false);
    expect(result.document.diagnostics.some((item) => item.code === 'dense_paragraphs_split')).toBe(true);
  });

  it('normalizes low-risk character aliases and reports merged names', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      '\u4eba\u7269\uff1aALICE\uff08\u9752\u5e74\uff09\u3001BOB\uff08\u7535\u8bdd\u4e2d\uff09',
      'ALICE\uff08OS\uff09: Hello.',
      'BOB\uff08\u7535\u8bdd\u4e2d\uff09: I can hear you.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('\u4eba\u7269\uff1aALICE\u3001BOB');
    expect(result.document.canonicalText).toContain('ALICE: Hello.');
    expect(result.document.canonicalText).toContain('BOB: I can hear you.');
    expect(result.document.aliasMap).toEqual(
      expect.objectContaining({
        'ALICE\uff08\u9752\u5e74\uff09': 'ALICE',
        'ALICE\uff08OS\uff09': 'ALICE',
        'BOB\uff08\u7535\u8bdd\u4e2d\uff09': 'BOB',
      }),
    );
    expect(result.document.diagnostics.some((item) => item.code === 'normalized_alias')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'ALICE')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'BOB')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'ALICE\uff08OS\uff09')).toBe(false);
  });

  it('audits scene headers that were auto-normalized into parser-friendly format', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u5916 \u65e5 Campus Gate',
      'ALICE: Hello.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('1-1 \u65e5 \u5916 Campus Gate');
    const diagnostic = result.document.diagnostics.find(
      (item) => item.code === 'scene_headers_normalized',
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.message).toContain('1-1');
    expect(diagnostic?.message).toContain('Campus Gate');
  });

  it('normalizes explicit non-standard character bio headers into the parser-friendly section label', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u4e3b\u8981\u89d2\u8272\uff1a',
      'ALICE\uff1a\u5e74\u9f84\uff1a18\uff0c\u8f6c\u5b66\u751f\u3002',
      'BOB\uff1a\u5e74\u9f84\uff1a19\uff0c\u73ed\u957f\u3002',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      'ALICE: Hello.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('\u4eba\u7269\u5c0f\u4f20\uff1a');
    expect(result.document.canonicalText).not.toContain('\u4e3b\u8981\u89d2\u8272\uff1a');
    expect(result.document.diagnostics.some((item) => item.code === 'character_bio_section_normalized')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'ALICE')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'BOB')).toBe(true);
  });

  it('infers a missing character bio section header from numbered character-group labels', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u4e00\u3001\u6838\u5fc3\u4e3b\u89d2',
      'ALICE\uff1a\u5e74\u9f84\uff1a18\uff0c\u8f6c\u5b66\u751f\u3002',
      'BOB\uff1a\u5e74\u9f84\uff1a19\uff0c\u73ed\u957f\u3002',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      'ALICE: Hello.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('\u4eba\u7269\u5c0f\u4f20\uff1a\n\u4e00\u3001\u6838\u5fc3\u4e3b\u89d2');
    expect(result.document.diagnostics.some((item) => item.code === 'character_bio_section_inferred')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'ALICE')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'BOB')).toBe(true);
  });

  it('infers a missing character bio section header from standalone bio-like entries', () => {
    const raw = [
      'Title',
      'Outline: test story',
      'ALICE\uff1a\u5e74\u9f84\uff1a18\uff0c\u8f6c\u5b66\u751f\u3002',
      'BOB\uff1a\u8eab\u4efd\uff1a19\u5c81\uff0c\u73ed\u957f\u3002',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      'ALICE: Hello.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('\u4eba\u7269\u5c0f\u4f20\uff1a\nALICE\uff1a\u5e74\u9f84\uff1a18\uff0c\u8f6c\u5b66\u751f\u3002');
    expect(result.document.diagnostics.some((item) => item.code === 'character_bio_section_inferred')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'ALICE')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'BOB')).toBe(true);
  });

  it('normalizes markdown-style character bios into parser-friendly lines', () => {
    const raw = [
      'Title',
      'Outline: test story',
      '\u4eba\u7269\u5c0f\u4f20\uff1a',
      '### ALICE',
      '\u8f6c\u5b66\u751f\uff0c18\u5c81\uff0c\u5014\u5f3a\u3002',
      '### BOB',
      '\u73ed\u957f\uff0c19\u5c81\uff0c\u514b\u5236\u3002',
      '\u7b2c1\u96c6\uff1aMeet',
      '1-1 \u65e5 \u5916 Campus Gate',
      'ALICE: Hello.',
    ].join('\n');

    const result = standardizeScriptForImport(raw);

    expect(result.success).toBe(true);
    expect(result.document.canonicalText).toContain('\u4eba\u7269\u5c0f\u4f20\uff1a\nALICE\uff1a\u8f6c\u5b66\u751f\uff0c18\u5c81\uff0c\u5014\u5f3a\u3002\nBOB\uff1a\u73ed\u957f\uff0c19\u5c81\uff0c\u514b\u5236\u3002');
    expect(result.document.diagnostics.some((item) => item.code === 'markdown_character_bios_normalized')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'ALICE')).toBe(true);
    expect(result.parseResult?.scriptData.characters.some((item) => item.name === 'BOB')).toBe(true);
  });
});
