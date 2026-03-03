import React, { useState } from 'react'
import ChainBadges from './ChainBadges'
import AddressForm from './AddressForm'

export default function AddressRow({ entry, chains, onUpdate, onDelete, onScan, scanState }) {
  const [editing, setEditing] = useState(false)

  const handleUpdate = async ({ description }) => {
    await onUpdate(entry.address, description)
    setEditing(false)
  }

  const isScanning = scanState && scanState.address === entry.address

  if (editing) {
    return (
      <tr>
        <td colSpan={4}>
          <AddressForm
            initial={entry}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <span className="address-text">{entry.address}</span>
      </td>
      <td>{entry.description || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
      <td>
        {isScanning ? (
          <div className="scan-progress">
            <div className="spinner" />
            <span>
              {scanState.phase === 'discovery'
                ? `Discovering ${scanState.chainName || '...'} (${scanState.current}/${scanState.total})`
                : `Scanning ${scanState.chainName || '...'} (${scanState.current}/${scanState.total})`
              }
            </span>
          </div>
        ) : (
          <ChainBadges activeChains={entry.activeChains} chains={chains} address={entry.address} />
        )}
      </td>
      <td>
        <div className="row-actions">
          <button
            className="btn btn-secondary btn-small"
            style={{ minWidth: 44 }}
            onClick={() => onScan(entry.address)}
            disabled={isScanning}
            title="Scan for chain activity"
          >
            {isScanning ? '\u2026' : 'Scan'}
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            className="btn btn-danger btn-small"
            onClick={() => onDelete(entry.address)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}
