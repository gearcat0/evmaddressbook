import React, { useCallback } from 'react'
import { Button, EmptyState } from 'evm-ui'
import useChains from '../../hooks/useChains'
import ChainTable from './ChainTable'

export default function ChainsScreen() {
  const { chains, setChains, loading, refreshing, error, refresh } = useChains()

  const handleUpdateRpc = useCallback(async (chainId, rpcurl) => {
    await window.api.updateChainRpc({ chainId, rpcurl })
    setChains(prev => prev.map(c => c.chainid === chainId ? { ...c, rpcurl } : c))
  }, [setChains])

  const handleToggleEnabled = useCallback(async (chainId) => {
    await window.api.toggleChainEnabled(chainId)
    setChains(prev => prev.map(c =>
      c.chainid === chainId ? { ...c, enabled: c.enabled === false ? true : false } : c
    ))
  }, [setChains])

  const handleSetTestnetsEnabled = useCallback(async (enabled) => {
    const updated = await window.api.setTestnetsEnabled(enabled)
    setChains(updated)
  }, [setChains])

  if (loading) return <EmptyState title="Loading chains…" />

  return (
    <div>
      <div className="screen-header">
        <h2>Chains ({chains.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => handleSetTestnetsEnabled(true)}>
            Enable Testnets
          </Button>
          <Button variant="secondary" onClick={() => handleSetTestnetsEnabled(false)}>
            Disable Testnets
          </Button>
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh from Etherscan'}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {chains.length === 0 ? (
        <EmptyState
          title="No chains loaded"
          description='Click "Refresh from Etherscan" to fetch the chain list.'
        />
      ) : (
        <ChainTable chains={chains} onUpdateRpc={handleUpdateRpc} onToggleEnabled={handleToggleEnabled} />
      )}
    </div>
  )
}
