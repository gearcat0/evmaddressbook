import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import { resetDataDirCache } from '../src/main/data-store'

// Creates a throwaway data dir, points the app at it, and returns its path.
// Pass file contents keyed by filename (JSON-stringified automatically).
export function useTempDataDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evmab-test-'))
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(content, null, 2))
  }
  process.env.EVMADDRESSBOOK_DATADIR = dir
  resetDataDirCache()
  return dir
}

export function removeDataDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.EVMADDRESSBOOK_DATADIR
  resetDataDirCache()
}

export function readJson(dir, name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'))
}

export function writeJson(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(content, null, 2))
}

// Replaces global fetch with a URL-dispatching stub. handler(url, opts) returns
// { status?, body? } (JSON response) or an Error to simulate a network failure.
// Returns the recorded calls: [{ url, opts }].
export function stubFetch(handler) {
  const calls = []
  vi.stubGlobal('fetch', async (url, opts) => {
    calls.push({ url: String(url), opts })
    const res = handler(String(url), opts)
    if (res instanceof Error) throw res
    const { status = 200, body = {} } = res || {}
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })
  return calls
}

// Runs fn under fake timers, fast-forwarding through rate-limiter gaps and
// retry backoffs, and returns fn's settled result.
export async function withFakeTimers(fn) {
  vi.useFakeTimers({ now: Date.now() })
  try {
    const p = fn()
    p.catch(() => {}) // observed below; avoid unhandled-rejection noise
    await vi.runAllTimersAsync()
    return await p
  } finally {
    vi.useRealTimers()
  }
}
