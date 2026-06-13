import React, { useState, useEffect } from 'react'
import useAddresses from '../../hooks/useAddresses'
import useBooks from '../../hooks/useBooks'
import useChains from '../../hooks/useChains'
import useSettings from '../../hooks/useSettings'
import AddressForm from './AddressForm'
import AddressTable from './AddressTable'
import BookSyncControl from './BookSyncControl'
import ImportBookPanel from './ImportBookPanel'

export default function AddressesScreen() {
  const { books, current, setCurrent, create, remove: removeBook, reload: reloadBooks, DEFAULT_BOOK } = useBooks()
  const { addresses, loading, error, add, update, remove, scan, reload } = useAddresses(current)
  const { chains } = useChains()
  const { settings } = useSettings()
  const anytypeReady = !!settings.anytypeApiKey
  const [showForm, setShowForm] = useState(false)
  const [scanState, setScanState] = useState(null)

  // Inline book prompts (no modal dialogs)
  const [newBookName, setNewBookName] = useState(null) // null = hidden, string = shown
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [bookError, setBookError] = useState('')

  useEffect(() => {
    const unsubProgress = window.api.onScanProgress((data) => {
      setScanState(data)
    })
    const unsubComplete = window.api.onScanComplete((data) => {
      setScanState(null)
      reload()
    })
    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [reload])

  // Refresh the table when background sync changes the current book's local data
  useEffect(() => {
    const unsub = window.api.onAnytypeSynced((result) => {
      if (result.book === current && (result.pulled > 0 || result.changed)) {
        reload()
      }
    })
    return unsub
  }, [current, reload])

  // ESCAPE dismisses whichever inline prompt is open
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (newBookName !== null || confirmDelete || showImport) {
        closeBookPrompts()
      } else if (showForm) {
        setShowForm(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newBookName, confirmDelete, showImport, showForm])

  const handleAdd = async ({ address, description }) => {
    await add(address, description)
    setShowForm(false)
  }

  const handleDelete = async (address) => {
    await remove(address)
  }

  const handleScan = async (address) => {
    setScanState({ address, current: 0, total: 0, chainName: 'Starting...' })
    try {
      await scan(address)
    } catch (err) {
      console.error('Scan failed:', err)
      setScanState(null)
    }
  }

  const closeBookPrompts = () => {
    setNewBookName(null)
    setConfirmDelete(false)
    setShowImport(false)
    setBookError('')
  }

  const handleImported = async (book) => {
    closeBookPrompts()
    await reloadBooks()
    setCurrent(book)
  }

  const handleSelectBook = (e) => {
    closeBookPrompts()
    setShowForm(false)
    setCurrent(e.target.value)
  }

  const handleCreateBook = async () => {
    setBookError('')
    try {
      await create(newBookName)
      closeBookPrompts()
    } catch (err) {
      setBookError(err.message || 'Failed to create address book')
    }
  }

  const handleDeleteBook = async () => {
    setBookError('')
    try {
      await removeBook(current)
      closeBookPrompts()
    } catch (err) {
      setBookError(err.message || 'Failed to delete address book')
    }
  }

  return (
    <div>
      <div className="screen-header">
        <div className="book-bar">
          <h2>{current} ({addresses.length})</h2>
          <select className="book-select" value={current} onChange={handleSelectBook}>
            {books.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => { closeBookPrompts(); setNewBookName('') }}
          >
            New Book
          </button>
          {anytypeReady && (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => { closeBookPrompts(); setShowImport(true) }}
            >
              Import from Anytype
            </button>
          )}
          <button
            className="btn btn-danger btn-small"
            disabled={current === DEFAULT_BOOK}
            title={current === DEFAULT_BOOK ? 'The Default address book cannot be deleted' : ''}
            onClick={() => { closeBookPrompts(); setConfirmDelete(true) }}
          >
            Delete Book
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Address'}
        </button>
      </div>

      <BookSyncControl book={current} onPulled={reload} />

      {showImport && (
        <ImportBookPanel onCancel={closeBookPrompts} onImported={handleImported} />
      )}

      {newBookName !== null && (
        <div className="inline-form">
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>New address book name</label>
              <input
                type="text"
                autoFocus
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBook() }}
                placeholder="e.g. Work, Cold Storage"
              />
            </div>
            <div className="form-group" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleCreateBook}>Create</button>
              <button className="btn btn-secondary" onClick={closeBookPrompts}>Cancel</button>
            </div>
          </div>
          {bookError && <div className="form-error">{bookError}</div>}
        </div>
      )}

      {confirmDelete && (
        <div className="inline-form">
          <p style={{ marginBottom: 12 }}>
            Delete the address book <strong>{current}</strong>? This permanently removes all
            of its addresses and <strong>cannot be undone</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" onClick={handleDeleteBook}>Delete permanently</button>
            <button className="btn btn-secondary" onClick={closeBookPrompts}>Cancel</button>
          </div>
          {bookError && <div className="form-error">{bookError}</div>}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <AddressForm
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="empty-state"><p>Loading addresses...</p></div>
      ) : addresses.length === 0 ? (
        <div className="empty-state">
          <h3>No addresses yet</h3>
          <p>Click "Add Address" to add your first EVM address.</p>
        </div>
      ) : (
        <AddressTable
          addresses={addresses}
          chains={chains}
          onUpdate={update}
          onDelete={handleDelete}
          onScan={handleScan}
          scanState={scanState}
        />
      )}
    </div>
  )
}
