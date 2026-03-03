import React, { useCallback } from 'react'
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

  if (loading) return <div className="empty-state"><p>Loading chains...</p></div>

  return (
    <div>
      <div className="screen-header">
        <h2>Chains ({chains.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleSetTestnetsEnabled(true)}
          >
            Enable Testnets
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleSetTestnetsEnabled(false)}
          >
            Disable Testnets
          </button>
          <button
            className="btn btn-secondary"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh from Etherscan'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {chains.length === 0 ? (
        <div className="empty-state">
          <h3>No chains loaded</h3>
          <p>Click "Refresh from Etherscan" to fetch the chain list.</p>
        </div>
      ) : (
        <ChainTable chains={chains} onUpdateRpc={handleUpdateRpc} onToggleEnabled={handleToggleEnabled} />
      )}
    </div>
  )
}
