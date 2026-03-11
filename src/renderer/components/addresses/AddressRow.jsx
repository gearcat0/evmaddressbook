import React, { useState } from 'react'
import ChainBadges from './ChainBadges'
import AddressForm from './AddressForm'

function ScanIcon({ entry }) {
  if (!entry.lastScanned) {
    return <span className="scan-icon scan-icon-none" title="Never scanned">{'\u25CB'}</span>
  }
  if (entry.lastScanErrors && entry.lastScanErrors.length > 0) {
    const tooltip = `Last scan had ${entry.lastScanErrors.length} error(s):\n${entry.lastScanErrors.join('\n')}`
    return <span className="scan-icon scan-icon-error" title={tooltip}>{'\u26A0'}</span>
  }
  return <span className="scan-icon scan-icon-ok" title="Last scan completed successfully">{'\u2713'}</span>
}

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
          <div className="scan-progress-wrapper">
            <div className="scan-progress">
              <div className="spinner" />
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
          <button
            className="btn btn-secondary btn-small"
            style={{ minWidth: 44 }}
            onClick={() => onScan(entry.address)}
            disabled={isScanning}
          >
            {isScanning ? '\u2026' : <><ScanIcon entry={entry} /> Scan</>}
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
