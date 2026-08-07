import React, { useState, useEffect } from 'react'
import useAddresses from '../../hooks/useAddresses'
import useBooks from '../../hooks/useBooks'
import useChains from '../../hooks/useChains'
import useSettings from '../../hooks/useSettings'
import { Button, EmptyState, Field, Input } from 'evm-ui'
import AddressForm from './AddressForm'
import AddressTable from './AddressTable'
import BookSyncControl from './BookSyncControl'
import ImportBookPanel from './ImportBookPanel'
import ImportXpubPanel from './ImportXpubPanel'

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
  const [showXpubImport, setShowXpubImport] = useState(false)
  const [bookError, setBookError] = useState('')
  const [importStatus, setImportStatus] = useState(null)
  const [exportStatus, setExportStatus] = useState(null) // null | {exporting} | {path, count} | {error}

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

  // Refresh when background sync changes the current book or removes a book
  useEffect(() => {
    const unsub = window.api.onAnytypeSynced((result) => {
      if (result.bookDeleted || result.unlinked) {
        reloadBooks() // a book was deleted/unlinked elsewhere; refresh the list
        return
      }
      if (result.book === current && (result.pulled > 0 || result.changed)) {
        reload()
      }
    })
    return unsub
  }, [current, reload, reloadBooks])

  // ESCAPE dismisses whichever inline prompt is open
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (newBookName !== null || confirmDelete || showImport || showXpubImport) {
        closeBookPrompts()
      } else if (showForm) {
        setShowForm(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newBookName, confirmDelete, showImport, showXpubImport, showForm])

  const handleAdd = async ({ address, description, tags }) => {
    await add(address, description, tags)
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
    setShowXpubImport(false)
    setBookError('')
  }

  const handleXpubImported = async (result) => {
    closeBookPrompts()
    await reload()
    setImportStatus(result)
    setTimeout(() => setImportStatus(null), 8000)
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

  const handleExport = async () => {
    setExportStatus({ exporting: true })
    try {
      const result = await window.api.exportAddresses(current)
      if (result.canceled) {
        setExportStatus(null)
        return
      }
      setExportStatus({ path: result.path, count: result.count })
      setTimeout(() => setExportStatus(null), 6000)
    } catch (err) {
      setExportStatus({ error: err.message || 'Export failed' })
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { closeBookPrompts(); setNewBookName('') }}
          >
            New Book
          </Button>
          {anytypeReady && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { closeBookPrompts(); setShowImport(true) }}
            >
              Import from Anytype
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            title="Import watch-only addresses derived from an extended public key"
            onClick={() => { closeBookPrompts(); setShowForm(false); setShowXpubImport(true) }}
          >
            Import xpub
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!!(exportStatus && exportStatus.exporting)}
            title="Save this address book as a JSON file"
            onClick={handleExport}
          >
            {exportStatus && exportStatus.exporting ? 'Exporting…' : 'Export'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={current === DEFAULT_BOOK}
            title={current === DEFAULT_BOOK ? 'The Default address book cannot be deleted' : ''}
            onClick={() => { closeBookPrompts(); setConfirmDelete(true) }}
          >
            Delete Book
          </Button>
        </div>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Address'}
        </Button>
      </div>

      <BookSyncControl book={current} onPulled={reload} onBookDeleted={reloadBooks} />

      {exportStatus && exportStatus.path && (
        <div style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 13 }}>
          Exported {exportStatus.count} address{exportStatus.count === 1 ? '' : 'es'} to{' '}
          <span className="address-text">{exportStatus.path}</span>
        </div>
      )}
      {exportStatus && exportStatus.error && (
        <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: 13 }}>
          Export failed: {exportStatus.error}
        </div>
      )}

      {showImport && (
        <ImportBookPanel onCancel={closeBookPrompts} onImported={handleImported} />
      )}

      {showXpubImport && (
        <ImportXpubPanel book={current} onCancel={closeBookPrompts} onImported={handleXpubImported} />
      )}

      {importStatus && (
        <div style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 13 }}>
          Imported {importStatus.added} address{importStatus.added === 1 ? '' : 'es'}
          {importStatus.skipped > 0 && `, skipped ${importStatus.skipped} already present`}
          {importStatus.errors && importStatus.errors.length > 0 &&
            `, ${importStatus.errors.length} failed`}
        </div>
      )}

      {newBookName !== null && (
        <div className="inline-form">
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Field label="New address book name">
                <Input
                  autoFocus
                  value={newBookName}
                  onChange={(e) => setNewBookName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBook() }}
                  placeholder="e.g. Work, Cold Storage"
                />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={handleCreateBook}>Create</Button>
              <Button variant="secondary" onClick={closeBookPrompts}>Cancel</Button>
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
            <Button variant="danger" onClick={handleDeleteBook}>Delete permanently</Button>
            <Button variant="secondary" onClick={closeBookPrompts}>Cancel</Button>
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
        <EmptyState title="Loading addresses…" />
      ) : addresses.length === 0 ? (
        <EmptyState
          title="No addresses yet"
          description='Click "Add Address" to add your first EVM address.'
        />
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
