import { BrowserWindow } from 'electron'
import { loadSettings } from './data-store'
import { syncBook } from './anytype-sync'
import { IPC, ANYTYPE_POLL_INTERVAL_MS, debug } from './constants'

let timer = null

function notifyRenderer(result) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.ANYTYPE_SYNCED, result)
  }
}

async function pollAll() {
  const settings = loadSettings()
  if (!settings.anytypeApiKey) return // Anytype not configured

  const spaces = settings.anytypeSpaces || {}
  for (const book of Object.keys(spaces)) {
    const mapping = spaces[book]
    if (!mapping || !mapping.id) continue
    try {
      const result = await syncBook(book)
      if (result.created || result.updated || result.pulled || result.changed) {
        notifyRenderer(result)
      }
    } catch (err) {
      // Anytype may be closed/unreachable; keep polling quietly.
      debug('Background sync failed for', book, err.message)
    }
  }
}

// Polls every synced book on a fixed interval. Uses a self-rescheduling timeout
// (not setInterval) so a slow cycle can never overlap the next one.
export function startAnytypePolling() {
  if (timer) return
  const tick = async () => {
    try {
      await pollAll()
    } catch (err) {
      debug('Anytype poll error:', err.message)
    }
    timer = setTimeout(tick, ANYTYPE_POLL_INTERVAL_MS)
  }
  timer = setTimeout(tick, ANYTYPE_POLL_INTERVAL_MS)
}
