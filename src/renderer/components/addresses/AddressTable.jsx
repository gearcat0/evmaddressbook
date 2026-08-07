import React from 'react'
import { addressKey } from '../../../shared/address-validator'
import useSortFilter from '../../hooks/useSortFilter'
import AddressRow from './AddressRow'

export default function AddressTable({ addresses, chains, onUpdate, onDelete, onScan, scanState }) {
  const { sorted, filter, setFilter, toggleSort, sortIndicator } = useSortFilter(addresses, 'address')

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Filter addresses..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {sorted.length} of {addresses.length} addresses
        </span>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('address')} style={{ width: 1, whiteSpace: 'nowrap' }}>
                Address<span className="sort-indicator">{sortIndicator('address')}</span>
              </th>
              <th onClick={() => toggleSort('description')}>
                Description<span className="sort-indicator">{sortIndicator('description')}</span>
              </th>
              <th>Tags</th>
              <th>Active Chains</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(entry => (
              <AddressRow
                key={entry.address}
                entry={entry}
                chains={chains}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onScan={onScan}
                scanState={scanState?.address && addressKey(scanState.address) === addressKey(entry.address) ? scanState : null}
                onTagClick={setFilter}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
