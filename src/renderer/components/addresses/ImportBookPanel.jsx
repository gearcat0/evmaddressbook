import React, { useState, useEffect } from 'react'

// Inline (non-modal) panel for creating a local address book from an existing
// Anytype collection: pick a space → pick a collection → name the book → import.
export default function ImportBookPanel({ onCancel, onImported }) {
  const [spaces, setSpaces] = useState(null)
  const [spaceId, setSpaceId] = useState('')
  const [collections, setCollections] = useState(null)
  const [collectionId, setCollectionId] = useState('')
  const [bookName, setBookName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    window.api.anytypeListSpaces()
      .then(list => { if (active) setSpaces(list) })
      .catch(err => { if (active) setError(err.message || 'Failed to reach Anytype') })
    return () => { active = false }
  }, [])

  const handleSpaceChange = async (e) => {
    const id = e.target.value
    setSpaceId(id)
    setCollections(null)
    setCollectionId('')
    setBookName('')
    setError('')
    if (!id) return
    setBusy(true)
    try {
      setCollections(await window.api.anytypeListCollections(id))
    } catch (err) {
      setError(err.message || 'Failed to load collections')
    } finally {
      setBusy(false)
    }
  }

  const handleCollectionChange = (e) => {
    const id = e.target.value
    setCollectionId(id)
    const col = (collections || []).find(c => c.id === id)
    if (col && !bookName) setBookName(col.name)
  }

  const handleImport = async () => {
    setError('')
    setBusy(true)
    try {
      const space = (spaces || []).find(s => s.id === spaceId)
      const result = await window.api.anytypeImportBook({
        spaceId,
        spaceName: space ? space.name : '',
        collectionId,
        bookName: bookName.trim()
      })
      onImported(result.book)
    } catch (err) {
      setError(err.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const canImport = spaceId && collectionId && bookName.trim() && !busy

  return (
    <div className="inline-form">
      <h3 style={{ marginBottom: 12 }}>Import address book from Anytype</h3>

      <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
          <label>Space</label>
          <select className="book-select" value={spaceId} onChange={handleSpaceChange} disabled={!spaces}>
            <option value="">{spaces ? 'Select a space…' : 'Loading…'}</option>
            {(spaces || []).map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
          <label>Collection</label>
          <select
            className="book-select"
            value={collectionId}
            onChange={handleCollectionChange}
            disabled={!collections || collections.length === 0}
          >
            <option value="">
              {!spaceId ? 'Pick a space first' : !collections ? 'Loading…' : collections.length === 0 ? 'No collections' : 'Select a collection…'}
            </option>
            {(collections || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
          <label>New address book name</label>
          <input
            type="text"
            value={bookName}
            onChange={(e) => setBookName(e.target.value)}
            placeholder="Address book name"
          />
        </div>

        <div className="form-group" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleImport} disabled={!canImport}>
            {busy ? 'Importing…' : 'Import'}
          </button>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
    </div>
  )
}
