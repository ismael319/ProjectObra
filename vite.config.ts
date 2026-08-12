import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function getBuildVersion() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return Date.now().toString(36)
  }
}

function serviceWorkerVersionPlugin(): Plugin {
  return {
    name: 'service-worker-version',
    apply: 'build',
    async closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js')
      const source = await readFile(swPath, 'utf8')
      await writeFile(swPath, source.replaceAll('__BUILD_VERSION__', getBuildVersion()))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerVersionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
})
