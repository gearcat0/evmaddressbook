import React, { useState } from 'react'

function hashColor(chainId) {
  const hue = (chainId * 137) % 360
  return `hsl(${hue}, 60%, 50%)`
}

function ChainIcon({ chainId }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className="chain-dot"
        style={{ backgroundColor: hashColor(chainId) }}
      />
    )
  }

  return (
    <img
      src={`https://icons.llamao.fi/icons/chains/rsz_${chainId}.jpg`}
      width="14"
      height="14"
      style={{ borderRadius: '50%' }}
      onError={() => setFailed(true)}
      alt=""
    />
  )
}

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
          <ChainIcon chainId={chainId} />
          {chainMap[chainId] || chainId}
        </span>
      ))}
    </div>
  )
}
