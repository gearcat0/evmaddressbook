import React from 'react'
import { splitMemo } from '../../../shared/address-validator'
import ChainIcon from '../ChainIcon'

const TYPE_LABELS = {
  eoa: 'EOA',
  wallet: 'Wallet',
  program: 'Program',
  account: 'Account',
  private: 'Private',
  script: 'Script',
  stake: 'Stake'
}

function getTypeLabel(info) {
  if (!info || !info.addressType) return null
  if (TYPE_LABELS[info.addressType]) return TYPE_LABELS[info.addressType]
  if (info.contractName === 'GnosisSafeProxy' || info.contractName === 'SafeProxy') {
    const t = info.threshold || '?'
    const o = info.owners ? info.owners.length : '?'
    return `Safe ${t}/${o}`
  }
  if (info.contractName === 'TransparentUpgradeableProxy') return 'Proxy'
  if (info.contractName) return info.contractName
  return 'Contract'
}

// Some chains denominate balances in units whose supply exceeds JS number
// precision (yoctoNEAR, MIST, tinybars), so those arrive as strings and are
// reduced with BigInt rather than division.
function fromBaseUnits(raw, decimals, symbol) {
  let value
  try {
    value = BigInt(raw)
  } catch {
    return null
  }
  const unit = 10n ** BigInt(decimals)
  const whole = value / unit
  const frac = (value % unit) * 10000n / unit // four decimal places
  return `${whole}.${String(frac).padStart(4, '0')} ${symbol}`
}

function formatBalance(info) {
  if (typeof info.balanceYocto === 'string') return fromBaseUnits(info.balanceYocto, 24, 'NEAR')
  if (typeof info.balanceMist === 'string') return fromBaseUnits(info.balanceMist, 9, 'SUI')
  if (typeof info.balanceTinybar === 'string') return fromBaseUnits(info.balanceTinybar, 8, 'HBAR')
  // Horizon already reports XLM as a decimal string.
  if (typeof info.balanceXlm === 'string') return `${info.balanceXlm} XLM`
  if (typeof info.balanceBchSats === 'number') return `${info.balanceBchSats / 1e8} BCH`
  if (typeof info.balanceSats === 'number') return `${info.balanceSats / 1e8} BTC`
  if (typeof info.balanceLamports === 'number') return `${info.balanceLamports / 1e9} SOL`
  if (typeof info.balanceSun === 'number') return `${info.balanceSun / 1e6} TRX`
  if (typeof info.balanceLovelace === 'number') return `${info.balanceLovelace / 1e6} ADA`
  if (typeof info.balanceDrops === 'number') return `${info.balanceDrops / 1e6} XRP`
  if (typeof info.balanceKoinu === 'number') return `${info.balanceKoinu / 1e8} DOGE`
  if (typeof info.balanceZats === 'number') return `${info.balanceZats / 1e8} ZEC`
  return null
}

const MEMO_LABELS = {
  xrp: 'Destination tag',
  stellar: 'Memo',
  hedera: 'Memo',
  monero: 'Payment id'
}

function buildTooltip(chainName, info, memo, family) {
  const lines = [chainName]
  if (memo) lines.push(`${MEMO_LABELS[family] || 'Memo'}: ${memo}`)
  if (!info || !info.addressType) return lines.join('\n')

  lines.push(`Type: ${TYPE_LABELS[info.addressType] || 'Contract'}`)
  if (info.addressType === 'private') lines.push('Activity and balance are not publicly visible')
  if (info.contractName) lines.push(`Contract: ${info.contractName}`)
  if (info.scriptType) lines.push(`Script: ${info.scriptType}`)
  if (info.accountType) lines.push(`Account: ${info.accountType}`)
  if (info.subtype) lines.push(`Subtype: ${info.subtype}`)
  if (info.pool) lines.push(`Pool: ${info.pool}`)
  if (info.era) lines.push(`Era: ${info.era}`)
  if (info.owner) lines.push(`Owner program: ${info.owner}`)
  if (info.contractCreator) lines.push(`Creator: ${info.contractCreator}`)
  if (info.creationTxHash) lines.push(`Creation TX: ${info.creationTxHash.slice(0, 18)}...`)
  if (info.implementationAddress) lines.push(`Implementation: ${info.implementationAddress}`)
  if (info.version) lines.push(`Version: ${info.version}`)
  if (info.owners) lines.push(`Owners: ${info.owners.length} (${info.owners.map(o => o.slice(0, 8) + '...').join(', ')})`)
  if (info.threshold) lines.push(`Threshold: ${info.threshold}`)
  if (info.evmAddress) lines.push(`EVM alias: ${info.evmAddress}`)
  if (typeof info.assetCount === 'number' && info.assetCount > 0) lines.push(`Other assets: ${info.assetCount}`)
  if (typeof info.coinObjects === 'number') lines.push(`Coin objects: ${info.coinObjects}`)
  if (typeof info.txCount === 'number') lines.push(`Transactions: ${info.txCount}`)
  const balance = formatBalance(info)
  if (balance) lines.push(`Balance: ${balance}`)

  return lines.join('\n')
}

export default function ChainBadges({ activeChains, chains, address, lastScanned }) {
  if (!activeChains || (typeof activeChains === 'object' && Object.keys(activeChains).length === 0)) {
    const message = lastScanned ? 'No activity found' : 'No chains scanned'
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{message}</span>
  }

  const chainMap = {}
  for (const c of chains) {
    chainMap[c.chainid] = {
      name: c.chainname,
      explorer: c.blockexplorer,
      enabled: c.enabled,
      addressUrlTemplate: c.addressUrlTemplate,
      family: c.family
    }
  }

  const entries = Object.entries(activeChains).filter(([chainId]) => {
    const chain = chainMap[chainId]
    return !chain || chain.enabled !== false
  })

  return (
    <div className="chain-badges">
      {entries.map(([chainId, info]) => {
        const chain = chainMap[chainId] || {}
        const chainName = chain.name || `Chain ${chainId}`
        const tooltip = buildTooltip(chainName, info, splitMemo(address || '').memo, chain.family)
        const typeLabel = getTypeLabel(info)
        // Explorers index the account, not the memo, so link to the bare form.
        const { address: baseAddress } = splitMemo(address || '')
        const explorerUrl = baseAddress && chain.addressUrlTemplate
          ? chain.addressUrlTemplate.replace('{address}', baseAddress)
          : chain.explorer && baseAddress
            ? `${chain.explorer.replace(/\/+$/, '')}/address/${baseAddress}`
            : null

        const content = (
          <>
            <ChainIcon chainId={chainId} size={14} />
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
