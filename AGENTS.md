# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

Moyin Creator is an Electron + React + Vite TypeScript desktop application for AI-assisted anime/short-drama script, storyboard, image, and video creation workflows.

## Common commands

- Install dependencies: `npm install`
- Start development app: `npm run dev`
- Build desktop app: `npm run build`
- Platform builds: `npm run build:win`, `npm run build:mac`, `npm run build:linux`
- Lint: `npm run lint`

## Code layout

- `src/` — renderer application, React components, stores, and domain libraries
- `electron/` — Electron main and preload processes
- `scripts/` — build and maintenance scripts
- `docs/` — user/project documentation
- `build/`, `public/` — static/build assets

## Conventions

- Use TypeScript and React functional components.
- Prefer the `@/` alias for imports from `src/`.
- Keep Electron main/preload APIs explicit and typed where possible.
- Do not commit generated artifacts from `out/`, `dist/`, or local runtime data unless intentionally required.
- Run `npm run lint` before finalizing code changes when practical.

## Notes

- The project uses `electron-vite` for development and desktop builds.
- `package-lock.json` is present; use npm for dependency management.
