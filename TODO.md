##Goal
Translate the entire Moyin Creator codebase from Chinese to English, focusing on comments, UI text, labels, messages, default values, and documentation while preserving all code syntax exactly as‑is.
Instructions
- Use up to 50 parallel sub‑agents to perform translations.
- Translate only Chinese content found in:
  - Line and block comments
  - String literals (UI labels, button text, placeholders, tooltips, error/log messages, default project names, documentation strings)
- Do not modify code identifiers, variable/function/type names, or any syntax.
- Follow the established workflow: first obtain file list (already done), then translate files systematically—starting with core library (src/lib/), then stores (src/stores/), components (src/components/), UI library, Electron, config, and documentation.
- Each sub‑agent should edit only the files assigned to it and commit the changes.
- Maintain existing file structure and formatting.
Discoveries- The project is a React/TypeScript video/storyboard creation app named “Moyin Creator” (魔因漫创).
- Core directories include src/lib/ (AI, storage, utils, API helpers), src/stores/ (Zustand state stores), src/components/ (feature‑grouped React components), src/types/, src/constants/, src/hooks/, src/packages/ai-core/ (AI service providers), Electron main/preload files, configuration, documentation, and demo data.
- Significant Chinese content exists in comments, default project names ("魔因漫创项目" → "Default Moyin Project", "新项目" → "New Project"), UI labels/button texts, tooltips, placeholders, error/log messages, and documentation/markdown files.
- Translation progress has already been made on many core library, store, and UI files (see Accomplished section).
Accomplished
Completed (translated or verified English)
- src/lib/ai/ – all 8 files translated
- src/lib/storage/ – storage-service.ts
- src/lib/utils/ – concurrency.ts, image-upload.ts, retry.ts
- src/lib/ – api-key-manager.ts, brand-mapping.ts, cors-fetch.ts, image-host.ts, media-processing.ts, project-switcher.ts, storage-migration.ts, video-cache.ts
- src/stores/ – api-config-store.ts, app-settings-store.ts, character-library-store.ts, custom-style-store.ts, director-presets.ts, scene-store.ts, sclass-store.ts, media-store.ts, media-panel-store.ts, project-store.ts, preview-store.ts, props-library-store.ts
- src/lib/character/ and src/constants/ – multiple files (character‑prompt‑service.ts, cinematography‑profiles.ts, visual‑styles.ts, generation/prompt‑builder.ts, generation/media‑type‑tokens.ts, freedom/camera‑dictionary.ts, freedom/freedom‑api.ts, freedom/model‑display‑names.ts, freedom/model‑registry.ts, freedom/veo‑capability.ts, scene/viewpoint‑matcher.ts)
- src/packages/ai-core/ – services (character-bible.ts, prompt-compiler.ts), API (index.ts, task-queue.ts, task-poller.ts)
- Root/app files – src/App.tsx, src/index.css, index.html
- Type definitions – src/types/script.ts
- UI components – src/components/ui/style-picker/index.tsx, src/components/ui/cinematography-profile-picker/index.tsx, src/components/ui/local-image.tsx, src/components/panels/overview/index.tsx
In Progress / Verified (no Chinese)
- Stores with no Chinese content (verification complete): theme-store.ts, simple-timeline-store.ts, director-shot-store.ts, freedom-store.ts, playback-store.ts, panel-store.ts
- Store script-store.ts – translation attempt aborted; needs retry.
- Store director-store.ts – not yet processed.
Left to Do
- Remaining store files: director-store.ts, script-store.ts (retry)
- All remaining component groups:
  - Layout, PreviewPanel, ProjectHeader, RightPanel, SimpleTimeline, TabBar, UpdateDialog, WardrobeModal, BatchProgressOverlay, Dashboard
  - Angle‑switch components, quad‑grid components
  - API‑manager dialogs/panels (AddProviderDialog, ApiKeyEditorDialog, EditProviderDialog, FeatureBindingPanel, image‑host‑manager components)
  - Director panel sub‑components (ambient‑sound‑input, api‑settings, character‑selector, context‑panel, etc.)
  - Script panel sub‑components (episode‑tree, export‑panel, property‑panel, script‑input, shot‑breakdown, shot‑list)
  - Characters panel sub‑components (character‑card, character‑detail, character‑gallery, character‑generator, generation‑panel, wardrobe‑modal)
  - Scenes panel sub‑components (generation‑panel, scene‑detail, scene‑gallery)
  - Sclass panel sub‑components (auto‑grouping, extend‑edit‑dialog, group‑ref‑manager, sclass‑calibrator, sclass‑prompt‑builder, sclass‑scene‑card, sclass‑scenes, shot‑group‑prompt, shot‑group, use‑sclass‑generation)
  - Assets panel sub‑components (AssetSidebar, CustomStylesGrid, DefaultStylesGrid, PropsLibrary, StyleCard, StyleEditor)
  - Export, Freedom, Media, Overview, Settings panels
  - All remaining UI components (accordion, alert‑dialog, alert, aspect‑ratio, audio‑player, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, etc.)
- Electron files: electron/main.ts, electron/preload.ts, electron/electron-env.d.ts, electron.vite.config.ts, electron-builder.yml
- Config files: postcss.config.js, SECURITY.md, CONTRIBUTING.md, COMMERCIAL_LICENSE.md, CODE_OF_CONDUCT.md, LICENSE
- Documentation: docs/WORKFLOW_GUIDE.md, docs/SCRIPT_FORMAT_EXAMPLE.md, README.md, README_EN.md, CHANGELOG.md, CHANGELOG-v0.1.8.md
- Demo data: all JSON files under demo-data/projects/
Relevant files / directories
Completed / Verified Directories
- src/lib/ai/ (all files)
- src/lib/storage/ (storage-service.ts)
- src/lib/utils/ (concurrency.ts, image-upload.ts, retry.ts)
- src/lib/ (api-key-manager.ts, brand-mapping.ts, cors-fetch.ts, image-host.ts, media-processing.ts, project-switcher.ts, storage-migration.ts, video-cache.ts)
- src/stores/ (completed: api-config-store.ts, app-settings-store.ts, character-library-store.ts, custom-style-store.ts, director-presets.ts, scene-store.ts, sclass-store.ts, media-store.ts, media-panel-store.ts, project-store.ts, preview-store.ts, props-library-store.ts; verified no Chinese: theme-store.ts, simple-timeline-store.ts, director-shot-store.ts, freedom-store.ts, playback-store.ts, panel-store.ts; pending: director-store.ts, script-store.ts)
- src/lib/character/ and src/constants/ (multiple translated files)
- src/packages/ai-core/ (services, API, task queue/poller)
- src/types/ (script.ts)
- src/components/ui/ (style-picker/index.tsx, cinematography-profile-picker/index.tsx, local-image.tsx)
- src/components/panels/overview/ (index.tsx)
- src/ (App.tsx, index.css)
- ./ (index.html)
Remaining Directories (to be processed)
- src/stores/ (director-store.ts, script-store.ts)
- src/components/ (layout, preview panels, header, right panel, simple timeline, tab bar, dialogs, etc.)
- src/components/api-manager/ (dialogs and panels)
- src/components/panels/director/ (all sub‑components)
- src/components/panels/script/ (all sub‑components)
- src/components/panels/characters/ (all sub‑components)
- src/components/panels/scenes/ (all sub‑components)
- src/components/panels/sclass/ (all sub‑components)
- src/components/panels/assets/ (all sub‑components)
- src/components/panels/export/, freedom/, media/, overview/, settings/
- src/components/ui/ (remaining UI component library)
- electron/ (main, preload, config, builder)
- demo-data/ (project JSON files)
- docs/ (markdown guides and changelogs)
- Root level config/markdown files (postcss.config.js, various .md files, LICENSE)
This summary captures the current state of the translation effort and provides the necessary context for another agent to resume work on the remaining files.
