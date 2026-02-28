import React from 'react'
import ChainIcon from '../ChainIcon'

export default function ChainBadges({ activeChains, chains }) {
  if (!activeChains || activeChains.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No chains scanned</span>
  }

  const chainMap = {}
  for (const c of chains) {
    chainMap[c.chainid] = c.chainname
  }

  return (
    <div className="chain-badges">
      {activeChains.map(chainId => (
        <span key={chainId} className="chain-badge" title={chainMap[chainId] || `Chain ${chainId}`}>
          <ChainIcon chainId={chainId} size={14} />
          {chainMap[chainId] || chainId}
        </span>
      ))}
    </div>
  )
}
