import React, { useState, useEffect } from 'react'
import useSettings from '../../hooks/useSettings'

// Per-book Anytype sync target. The mapping lives in settings under
// `anytypeSpaces`, keyed by address book name: { [book]: { id, name } }.
export default function BookSyncControl({ book, onPulled, onBookDeleted }) {
  const { settings, update, reload } = useSettings()
  const [open, setOpen] = useState(false)
  const [spaces, setSpaces] = useState(null) // null = not loaded
  const [status, setStatus] = useState(null) // null | {loading} | {error}
  const [syncStatus, setSyncStatus] = useState(null) // null | {syncing} | {done} | {error}

  // Settings can change in the main process (e.g. on import); refresh the
  // mapping whenever the selected book changes.
  useEffect(() => { reload() }, [book, reload])

  const mapping = (settings.anytypeSpaces || {})[book] || null

  const loadSpaces = async () => {
    setStatus({ loading: true })
    try {
      const list = await window.api.anytypeListSpaces()
      setSpaces(list)
      setStatus(null)
    } catch (err) {
      setStatus({ error: err.message || 'Failed to reach Anytype' })
    }
  }

  const saveMapping = async (next) => {
    const all = { ...(settings.anytypeSpaces || {}) }
    if (next) all[book] = next
    else delete all[book]
    await update({ anytypeSpaces: all })
  }

  const handleSelect = async (e) => {
    const id = e.target.value
    if (!id) return
    const sp = (spaces || []).find(s => s.id === id)
    await saveMapping({ id, name: sp ? sp.name : '' })
  }

  const handleStop = async () => {
    await saveMapping(null)
    setSyncStatus(null)
  }

  const handleSyncNow = async () => {
    setSyncStatus({ syncing: true })
    try {
      const result = await window.api.anytypeSyncBook(book)
      setSyncStatus({ done: result })
      if ((result.bookDeleted || result.unlinked) && onBookDeleted) onBookDeleted()
      else if ((result.pulled > 0 || result.changed) && onPulled) onPulled()
    } catch (err) {
      setSyncStatus({ error: err.message || 'Sync failed' })
    }
  }

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    if (next && spaces === null) loadSpaces()
  }

  return (
    <div className="book-sync">
      <div className="book-sync-summary">
        <span className="book-sync-label">
          Anytype sync:{' '}
          {mapping
            ? <strong>{mapping.name || mapping.id}</strong>
            : <span style={{ color: 'var(--text-muted)' }}>off</span>}
        </span>
        {mapping && (
          <button
            className="btn btn-primary btn-small"
            onClick={handleSyncNow}
            disabled={syncStatus && syncStatus.syncing}
          >
            {syncStatus && syncStatus.syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
        <button className="btn btn-secondary btn-small" onClick={toggleOpen}>
          {open ? 'Close' : mapping ? 'Change' : 'Set up sync'}
        </button>
        {mapping && (
          <button className="btn btn-danger btn-small" onClick={handleStop}>
            Stop syncing
          </button>
        )}
      </div>

      {syncStatus && syncStatus.error && (
        <div className="form-error" style={{ marginTop: 8 }}>{syncStatus.error}</div>
      )}
      {syncStatus && syncStatus.done && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          Synced with Anytype — {syncStatus.done.total} total
          {' '}({syncStatus.done.created} pushed, {syncStatus.done.updated} updated, {syncStatus.done.pulled} pulled).
        </div>
      )}

      {open && (
        <div className="inline-form" style={{ marginTop: 12 }}>
          {status && status.loading && <p>Loading spaces from Anytype…</p>}
          {status && status.error && <div className="form-error">{status.error}</div>}
          {spaces !== null && (
            spaces.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No spaces found in Anytype.</p>
            ) : (
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Sync “{book}” to space</label>
                  <select
                    className="book-select"
                    value={mapping ? mapping.id : ''}
                    onChange={handleSelect}
                  >
                    <option value="">Select a space…</option>
                    {spaces.map(s => (
                      <option key={s.id} value={s.id}>{s.name || s.id}</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-secondary" onClick={loadSpaces}>Reload</button>
              </div>
            )
          )}
          {status && status.error && (
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={loadSpaces}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
