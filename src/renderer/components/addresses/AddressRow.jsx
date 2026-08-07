import React, { useState } from 'react'
import { Button, Spinner } from 'evm-ui'
import ChainBadges from './ChainBadges'
import AddressForm from './AddressForm'

function ScanIcon({ entry }) {
  if (!entry.lastScanned) {
    return <span className="scan-icon scan-icon-none" title="Never scanned">{'○'}</span>
  }
  if (entry.lastScanErrors && entry.lastScanErrors.length > 0) {
    const tooltip = `Last scan had ${entry.lastScanErrors.length} error(s):\n${entry.lastScanErrors.join('\n')}`
    return <span className="scan-icon scan-icon-error" title={tooltip}>{'⚠'}</span>
  }
  return <span className="scan-icon scan-icon-ok" title="Last scan completed successfully">{'✓'}</span>
}

export default function AddressRow({ entry, chains, onUpdate, onDelete, onScan, scanState, onTagClick }) {
  const [editing, setEditing] = useState(false)

  const handleUpdate = async ({ description, tags }) => {
    await onUpdate(entry.address, description, tags)
    setEditing(false)
  }

  const isScanning = scanState && scanState.address === entry.address

  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <AddressForm
            initial={entry}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    )
  }

  const tags = entry.tags || []

  return (
    <tr>
      <td>
        <span className="address-text">{entry.address}</span>
      </td>
      <td>{entry.description || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
      <td>
        {tags.length > 0 ? (
          <div className="tag-chips">
            {tags.map(tag => (
              <button
                key={tag}
                type="button"
                className="tag-chip"
                title={`Filter by "${tag}"`}
                onClick={() => onTagClick && onTagClick(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td>
        {isScanning ? (
          <div className="scan-progress-wrapper">
            <div className="scan-progress">
              <Spinner size={14} />
              <span>
                {scanState.phase === 'discovery'
                  ? `Discovering ${scanState.chainName || '...'} (${scanState.current}/${scanState.total})`
                  : `Scanning ${scanState.chainName || '...'} (${scanState.current}/${scanState.total})`
                }
              </span>
            </div>
          </div>
        ) : (
          <ChainBadges activeChains={entry.activeChains} chains={chains} address={entry.address} lastScanned={entry.lastScanned} />
        )}
      </td>
      <td>
        <div className="row-actions">
          <Button
            variant="secondary"
            size="sm"
            style={{ minWidth: 44 }}
            onClick={() => onScan(entry.address)}
            disabled={isScanning}
          >
            {isScanning ? '…' : <><ScanIcon entry={entry} /> Scan</>}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(entry.address)}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  )
}
