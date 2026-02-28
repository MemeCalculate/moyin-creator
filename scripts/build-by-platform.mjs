import { spawnSync } from 'node:child_process'

const buildScriptByPlatform = {
  win32: 'build:win',
  darwin: 'build:mac',
  linux: 'build:linux'
}

const selectedScript = buildScriptByPlatform[process.platform]

if (!selectedScript) {
  console.error(`Unsupported platform: ${process.platform}`)
  process.exit(1)
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawnSync(npmCommand, ['run', selectedScript], { stdio: 'inherit' })

if (child.error) {
  console.error(child.error.message)
  process.exit(1)
}

process.exit(child.status ?? 1)
