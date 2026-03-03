import React from 'react'
import ChainIcon from '../ChainIcon'

function getTypeLabel(info) {
  if (!info || !info.addressType) return null
  if (info.addressType === 'eoa') return 'EOA'
  if (info.contractName === 'GnosisSafeProxy') {
    const t = info.threshold || '?'
    const o = info.owners ? info.owners.length : '?'
    return `Safe ${t}/${o}`
  }
  if (info.contractName === 'TransparentUpgradeableProxy') return 'Proxy'
  if (info.contractName) return info.contractName
  return 'Contract'
}

function buildTooltip(chainName, info) {
  const lines = [chainName]
  if (!info || !info.addressType) return chainName

  lines.push(`Type: ${info.addressType === 'eoa' ? 'EOA' : 'Contract'}`)
  if (info.contractName) lines.push(`Contract: ${info.contractName}`)
  if (info.contractCreator) lines.push(`Creator: ${info.contractCreator}`)
  if (info.creationTxHash) lines.push(`Creation TX: ${info.creationTxHash.slice(0, 18)}...`)
  if (info.implementationAddress) lines.push(`Implementation: ${info.implementationAddress}`)
  if (info.version) lines.push(`Version: ${info.version}`)
  if (info.owners) lines.push(`Owners: ${info.owners.length} (${info.owners.map(o => o.slice(0, 8) + '...').join(', ')})`)
  if (info.threshold) lines.push(`Threshold: ${info.threshold}`)

  return lines.join('\n')
}

export default function ChainBadges({ activeChains, chains, address }) {
  if (!activeChains || (typeof activeChains === 'object' && Object.keys(activeChains).length === 0)) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No chains scanned</span>
  }

  const chainMap = {}
  for (const c of chains) {
    chainMap[c.chainid] = { name: c.chainname, explorer: c.blockexplorer }
  }

  const entries = Object.entries(activeChains)

  return (
    <div className="chain-badges">
      {entries.map(([chainId, info]) => {
        const chain = chainMap[chainId] || {}
        const chainName = chain.name || `Chain ${chainId}`
        const tooltip = buildTooltip(chainName, info)
        const typeLabel = getTypeLabel(info)
        const explorerUrl = chain.explorer && address
          ? `${chain.explorer.replace(/\/+$/, '')}/address/${address}`
          : null

        const content = (
          <>
            <ChainIcon chainId={Number(chainId)} size={14} />
            {typeLabel && <span className="chain-type-label">{typeLabel}</span>}
          </>
        )

        return explorerUrl ? (
          <a key={chainId} className="chain-badge" title={tooltip} href={explorerUrl} target="_blank" rel="noopener noreferrer">
            {content}
          </a>
        ) : (
          <span key={chainId} className="chain-badge" title={tooltip}>
            {content}
          </span>
        )
      })}
    </div>
  )
}
