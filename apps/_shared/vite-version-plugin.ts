// Writes dist/version.json with the current git short SHA at build time.
// The companion runtime utility (apps/_shared/version-check.ts) polls this
// endpoint to detect when a new deploy is live, then reloads the SPA at a
// safe moment so the user picks up the new bundle without manual refresh.
//
// version.json schema (intentionally minimal — public file, no secrets):
//   { "version": "abc1234", "buildTime": "2026-05-11T03:14:00.000Z" }
//
// Cache headers for this file MUST be no-store at the origin (S3 metadata or
// nginx location block). The runtime adds a `?t=...` query bust + Cache:
// no-store request header, but the origin must cooperate.

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

export function viteVersionPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'nasun-inject-version-json',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      let sha = 'unknown'
      try {
        sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
      } catch {
        // git not available — leave 'unknown' so polling no-ops gracefully
      }
      const payload = JSON.stringify({
        version: sha,
        buildTime: new Date().toISOString(),
      }) + '\n'
      writeFileSync(path.resolve(outDir, 'version.json'), payload)
    },
  }
}
