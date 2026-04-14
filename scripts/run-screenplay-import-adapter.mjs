/* eslint-env node */
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, "..");
export const SCREENPLAY_IMPORT_ADAPTER_RUNNER_USAGE =
  "Usage: node ./scripts/run-screenplay-import-adapter.mjs <input-file> [--out-dir <dir>]";

export function shouldShowScreenplayImportRunnerHelp(cliArgs = []) {
  return cliArgs.includes("--help") || cliArgs.includes("-h");
}

export function buildScreenplayImportRunnerPlan({
  repoRoot = defaultRepoRoot,
  nodeExecutable = process.execPath,
  cliArgs = process.argv.slice(2),
} = {}) {
  const viteConfigPath = path.join(repoRoot, "scripts", "vite-node.screenplay-import.config.mts");
  const toolScriptPath = path.join(repoRoot, "scripts", "screenplay-import-adapter.ts");
  const viteCliPath = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  const bundleDir = path.join(repoRoot, "node_modules", ".cache", "screenplay-import-adapter");
  const bundlePath = path.join(bundleDir, "screenplay-import-adapter.js");

  return {
    paths: {
      repoRoot,
      viteConfigPath,
      toolScriptPath,
      viteCliPath,
      bundleDir,
      bundlePath,
    },
    build: {
      command: nodeExecutable,
      args: [
        viteCliPath,
        "build",
        "--config",
        viteConfigPath,
        "--ssr",
        toolScriptPath,
        "--outDir",
        bundleDir,
      ],
    },
    run: {
      command: nodeExecutable,
      args: [bundlePath, ...cliArgs],
    },
  };
}

function runCommand(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} exited with code ${code ?? 1}`));
    });
  });
}

export async function runScreenplayImportAdapterCli(options = {}) {
  const plan = buildScreenplayImportRunnerPlan(options);

  await runCommand(
    plan.build.command,
    plan.build.args,
    plan.paths.repoRoot,
    "screenplay import adapter build",
  );
  await runCommand(
    plan.run.command,
    plan.run.args,
    plan.paths.repoRoot,
    "screenplay import adapter run",
  );

  return plan;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    if (shouldShowScreenplayImportRunnerHelp(argv)) {
      process.stdout.write(`${SCREENPLAY_IMPORT_ADAPTER_RUNNER_USAGE}\n`);
      return;
    }

    await runScreenplayImportAdapterCli({ cliArgs: argv });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
