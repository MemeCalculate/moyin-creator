import { existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const processPatterns = ['moyin-creator', '魔因漫创']

function killRunningProcesses() {
  if (process.platform === 'win32') {
    for (const pattern of processPatterns) {
      spawnSync('taskkill', ['/F', '/IM', `${pattern}.exe`], { stdio: 'ignore' })
    }
    return
  }

  for (const pattern of processPatterns) {
    spawnSync('pkill', ['-f', pattern], { stdio: 'ignore' })
  }
}

function cleanReleaseDirectory() {
  if (!existsSync('release')) {
    return
  }
  rmSync('release', { recursive: true, force: true })
}

killRunningProcesses()
cleanReleaseDirectory()
console.log('Cleaned release directory and attempted to stop running app processes.')
