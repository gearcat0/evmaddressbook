import React from 'react'
import useSortFilter from '../../hooks/useSortFilter'

export default function ChainTable({ chains }) {
  const { sorted, filter, setFilter, toggleSort, sortIndicator } = useSortFilter(chains, 'chainid')

  return (
    <div>
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Filter chains..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {sorted.length} of {chains.length} chains
        </span>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('chainid')}>
                Chain ID<span className="sort-indicator">{sortIndicator('chainid')}</span>
              </th>
              <th onClick={() => toggleSort('chainname')}>
                Name<span className="sort-indicator">{sortIndicator('chainname')}</span>
              </th>
              <th onClick={() => toggleSort('blockexplorer')}>
                Block Explorer<span className="sort-indicator">{sortIndicator('blockexplorer')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(chain => (
              <tr key={chain.chainid}>
                <td>{chain.chainid}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img
                      src={`https://icons.llamao.fi/icons/chains/rsz_${chain.chainid}.jpg`}
                      width="18"
                      height="18"
                      style={{ borderRadius: '50%' }}
                      onError={(e) => { e.target.style.display = 'none' }}
                      alt=""
                    />
                    {chain.chainname}
                  </div>
                </td>
                <td>
                  {chain.blockexplorer ? (
                    <span className="address-text" style={{ color: 'var(--text-secondary)' }}>
                      {chain.blockexplorer}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
