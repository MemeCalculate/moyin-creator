# Screenplay Import Adapter

## Purpose

`screenplay-import-adapter` is a standalone batch formatter for raw screenplays.

It is designed for the current `moyin-creator` import chain, where parser stability depends heavily on standardized episode markers, scene headers, character bio sections, and one-speaker-per-line dialogue blocks.

The tool does three things:

1. Standardizes raw screenplay text into parser-friendly structure.
2. Generates diagnostics and a preview summary before import.
3. Writes import artifacts to disk for review or downstream automation.

## Command

```bash
npm run screenplay:adapt -- <input-file-or-dir> [more-inputs...] [--out-dir <dir>]
```

You can also call the wrapper directly:

```bash
node ./scripts/run-screenplay-import-adapter.mjs <input-file-or-dir> [more-inputs...] [--out-dir <dir>]
```

## Supported Inputs

- Single screenplay file
- Multiple screenplay files
- Directory input with recursive scanning

Supported source extensions:

- `.txt`
- `.md`

## Examples

Single file:

```bash
npm run screenplay:adapt -- ./examples/pilot.txt
```

Multiple files:

```bash
npm run screenplay:adapt -- ./raw/pilot-a.txt ./raw/pilot-b.md --out-dir ./exports
```

Directory batch:

```bash
npm run screenplay:adapt -- ./raw-scripts --out-dir ./exports
```

Show help:

```bash
npm run screenplay:adapt -- --help
```

## Output Layout

Without `--out-dir`, each input file gets a sibling output directory:

```text
pilot.txt
pilot.screenplay-import/
```

With `--out-dir`, the tool preserves relative directory structure:

```text
raw-scripts/
  pilot-a.txt
  nested/
    pilot-b.md

exports/
  pilot-a.screenplay-import/
  nested/
    pilot-b.screenplay-import/
```

## Generated Artifacts

Each screenplay output directory includes:

- `standardized-script.txt`
- `adapter-summary.json`
- `standardization-report.json`
- `standardization-preview.json`
- `parse-result.json` when parsing succeeds

## How To Read The Results

`adapter-summary.json`

- High-level acceptance summary
- Counts for blocking issues, inferred structures, and autofixes
- Good for batch dashboards and quick filtering

`standardization-report.json`

- Full canonicalized document report
- Raw-to-canonical traces
- Detailed diagnostics

`standardization-preview.json`

- Import-facing preview summary
- Blocking/fatal flags
- Top diagnostics and short excerpt

`parse-result.json`

- Present only when the standardized script can be parsed successfully
- Contains parsed episodes, scenes, and script data

## Typical Workflow

1. Run the adapter against raw manuscript files.
2. Check `adapter-summary.json` for `canImport`, `requiresReview`, and `hasFatalIssues`.
3. Review `standardized-script.txt` and `standardization-preview.json` for files that require manual correction.
4. Feed import-ready outputs into the next import step.

## Notes

- `--help` exits before the wrapper builds the adapter bundle.
- The wrapper is Windows-safe and avoids the direct `.cmd` execution issue seen with `vite-node`.
- The tool is intentionally import-chain-specific rather than a generic text beautifier.
