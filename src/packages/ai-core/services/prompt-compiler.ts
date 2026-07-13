// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Prompt Compiler
 * Mustache-style template engine for AI prompts
 */

import type { AIScene, AICharacter, GenerationConfig } from '../types';

export interface PromptTemplateConfig {
  sceneImage: string;
  sceneVideo: string;
  negative: string;
  screenplay: string;
}

// Default templates
const DEFAULT_TEMPLATES: PromptTemplateConfig = {
  sceneImage: `{{style_tokens}}, {{character_description}}, {{visual_content}}, {{camera}}, {{quality_tokens}}`,
  sceneVideo: `{{character_description}}, {{visual_content}}, {{action}}, {{camera}}`,
  negative: `blurry, low quality, watermark, text, logo, signature, bad anatomy, deformed, mutated`,
  screenplay: `你是一个专业的视频剧本创作者。请根据以下描述创作一个短视频剧本：

描述：{{prompt}}

要求：
1. 创作 {{scene_count}} 个场景
2. 每个场景包含：场景编号、旁白、视觉内容描述、角色动作、镜头类型、角色外观描述
3. visualContent/action/camera/characterDescription 用英文描述
4. narration 用中文
5. 不要输出 mood/情绪 字段（前端不需要）

输出格式为 JSON：
{
  "title": "视频标题",
  "scenes": [
    {
      "sceneId": 1,
      "narration": "中文旁白",
      "visualContent": "English visual description",
      "action": "English character action",
      "camera": "Camera type in English (Close-up/Medium Shot/Wide Shot/etc.)",
      "characterDescription": "English character appearance description"
    }
  ]
}`,
};

export class PromptCompiler {
  private templates: PromptTemplateConfig;

  constructor(customTemplates?: Partial<PromptTemplateConfig>) {
    this.templates = {
      ...DEFAULT_TEMPLATES,
      ...customTemplates,
    };
  }

  /**
   * Compile a template with variables
   */
  compile(templateId: keyof PromptTemplateConfig, variables: Record<string, string | number | undefined>): string {
    const template = this.templates[templateId];
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }
    return this.interpolate(template, variables);
  }

  /**
   * Mustache-style interpolation
   */
  private interpolate(template: string, variables: Record<string, string | number | undefined>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * Compile image prompt for a scene
   */
  compileSceneImagePrompt(
    scene: AIScene,
    characters: AICharacter[],
    config: GenerationConfig
  ): string {
    // Find character for this scene
    const characterDesc = scene.characterDescription || 
      characters.map(c => c.visualTraits).join(', ');

    return this.compile('sceneImage', {
      style_tokens: config.styleTokens.join(', '),
      character_description: characterDesc,
      visual_content: scene.visualContent,
      camera: scene.camera,
      quality_tokens: config.qualityTokens.join(', '),
    });
  }

  /**
   * Compile video prompt for a scene
   */
  compileSceneVideoPrompt(
    scene: AIScene,
    characters: AICharacter[]
  ): string {
    const characterDesc = scene.characterDescription || 
      characters.map(c => c.visualTraits).join(', ');

    return this.compile('sceneVideo', {
      character_description: characterDesc,
      visual_content: scene.visualContent,
      action: scene.action,
      camera: scene.camera,
    });
  }

  /**
   * Compile screenplay generation prompt
   */
  compileScreenplayPrompt(userPrompt: string, sceneCount: number = 5): string {
    return this.compile('screenplay', {
      prompt: userPrompt,
      scene_count: sceneCount,
    });
  }

  /**
   * Get negative prompt
   */
  getNegativePrompt(additionalTerms?: string[]): string {
    let negative = this.templates.negative;
    if (additionalTerms && additionalTerms.length > 0) {
      negative += ', ' + additionalTerms.join(', ');
    }
    return negative;
  }

  /**
   * Update templates at runtime
   */
  updateTemplates(updates: Partial<PromptTemplateConfig>): void {
    this.templates = {
      ...this.templates,
      ...updates,
    };
  }

  /**
   * Get current templates (for debugging/export)
   */
  getTemplates(): PromptTemplateConfig {
    return { ...this.templates };
  }
}

// Singleton instance with default config
export const promptCompiler = new PromptCompiler();
