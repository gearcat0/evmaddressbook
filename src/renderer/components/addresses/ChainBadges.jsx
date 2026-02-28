import React from 'react'
import ChainIcon from '../ChainIcon'

export default function ChainBadges({ activeChains, chains, address }) {
  if (!activeChains || activeChains.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No chains scanned</span>
  }

  const chainMap = {}
  for (const c of chains) {
    chainMap[c.chainid] = { name: c.chainname, explorer: c.blockexplorer }
  }

  return (
    <div className="chain-badges">
      {activeChains.map(chainId => {
        const chain = chainMap[chainId] || {}
        const title = chain.name || `Chain ${chainId}`
        const explorerUrl = chain.explorer && address
          ? `${chain.explorer.replace(/\/+$/, '')}/address/${address}`
          : null

        const icon = <ChainIcon chainId={chainId} size={14} />

        return explorerUrl ? (
          <a key={chainId} className="chain-badge" title={title} href={explorerUrl} target="_blank" rel="noopener noreferrer">
            {icon}
          </a>
        ) : (
          <span key={chainId} className="chain-badge" title={title}>
            {icon}
          </span>
        )
      })}
    </div>
  )
}
