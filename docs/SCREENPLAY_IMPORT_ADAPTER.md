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
npm run screenplay:adapt -- ./demo-data/screenplay-import-adapter/campus-gate-raw.txt
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

## End-to-End Demo

The repository includes a checked-in raw screenplay sample at:

```text
./demo-data/screenplay-import-adapter/campus-gate-raw.txt
```

Run the adapter against that sample and write artifacts into an ignored temp directory:

```bash
npm run screenplay:adapt -- ./demo-data/screenplay-import-adapter/campus-gate-raw.txt --out-dir ./.tmp/screenplay-import-demo
```

Shortcut:

```bash
npm run screenplay:adapt:demo
```

After the command completes, you should see:

```text
.tmp/
  screenplay-import-demo/
    campus-gate-raw.screenplay-import/
      standardized-script.txt
      adapter-summary.json
      standardization-report.json
      standardization-preview.json
      parse-result.json
```

Even when you pass a single file, the CLI still writes artifacts into a dedicated
`<input-name>.screenplay-import/` folder so the standalone and batch layouts stay consistent.

What this sample demonstrates:

- Compact character bios written on one line
- Loose scene header format such as `第一场 外/日 校门口`
- Scene-header character tags mixed into the same line
- Action and dialogue packed into dense paragraph blocks
- Two speakers written on the same source line

What to inspect first:

`standardized-script.txt`

- Confirms the canonical screenplay text the parser will consume
- You should see the loose scene header normalized into a numbered scene header
- You should see a standalone `人物：...` line and one-speaker-per-line dialogue blocks

`adapter-summary.json`

- Fast acceptance verdict for the sample
- Start with `canImport`, `requiresReview`, and `hasFatalIssues`
- Use the issue counts to decide whether to stop, review, or continue importing

The checked-in sample currently produces:

```json
{
  "canImport": true,
  "requiresReview": false,
  "hasFatalIssues": false,
  "blockingIssueCount": 0,
  "inferredItemCount": 1,
  "autofixedItemCount": 3
}
```

`standardization-preview.json`

- Short import-facing report for product or operator review
- Shows the most important diagnostics, plus a short canonical excerpt
- For the checked-in sample, the top diagnostics are currently:
  - `scene_headers_normalized`
  - `bio_compact_entries_split`
  - `dense_paragraphs_split`
  - `scene_header_character_tags_extracted`

`standardization-report.json`

- Full raw-to-canonical trace log
- Best place to understand which fixes were inferred or auto-applied

`parse-result.json`

- Present when the standardized screenplay is parseable
- Useful for checking episodes, scenes, extracted characters, and downstream script data

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
