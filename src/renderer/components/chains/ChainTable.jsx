import React, { useState } from 'react'
import useSortFilter from '../../hooks/useSortFilter'
import ChainIcon from '../ChainIcon'

function RpcCell({ chain, onUpdateRpc }) {
  const [value, setValue] = useState(chain.rpcurl || '')
  const [fetching, setFetching] = useState(false)

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed !== (chain.rpcurl || '')) {
      onUpdateRpc(chain.chainid, trimmed)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    }
  }

  const handleFetch = async () => {
    setFetching(true)
    try {
      const url = await window.api.fetchChainRpc(chain.chainid)
      if (url) {
        setValue(url)
        onUpdateRpc(chain.chainid, url)
      }
    } finally {
      setFetching(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder="No RPC URL"
        style={{
          flex: 1,
          padding: '2px 6px',
          fontSize: 12,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text-primary)',
          minWidth: 0
        }}
      />
      <button
        onClick={handleFetch}
        disabled={fetching}
        title="Fetch RPC URL from chainlist.org"
        style={{
          padding: '2px 6px',
          fontSize: 11,
          whiteSpace: 'nowrap',
          cursor: fetching ? 'wait' : 'pointer'
        }}
        className="btn btn-secondary"
      >
        {fetching ? '...' : 'Fetch'}
      </button>
    </div>
  )
}

export default function ChainTable({ chains, onUpdateRpc, onToggleEnabled }) {
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
              <th style={{ width: 70, textAlign: 'center' }}>Enabled</th>
              <th onClick={() => toggleSort('chainid')}>
                Chain ID<span className="sort-indicator">{sortIndicator('chainid')}</span>
              </th>
              <th onClick={() => toggleSort('chainname')}>
                Name<span className="sort-indicator">{sortIndicator('chainname')}</span>
              </th>
              <th onClick={() => toggleSort('blockexplorer')}>
                Block Explorer<span className="sort-indicator">{sortIndicator('blockexplorer')}</span>
              </th>
              <th onClick={() => toggleSort('rpcurl')}>
                RPC URL<span className="sort-indicator">{sortIndicator('rpcurl')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(chain => (
              <tr key={chain.chainid}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="chain-toggle"
                    checked={chain.enabled !== false}
                    onChange={() => onToggleEnabled(chain.chainid)}
                  />
                </td>
                <td>{chain.chainid}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChainIcon chainId={chain.chainid} size={18} />
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
                <td>
                  <RpcCell chain={chain} onUpdateRpc={onUpdateRpc} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
