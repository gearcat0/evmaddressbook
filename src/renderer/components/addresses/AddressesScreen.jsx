import React, { useState, useEffect } from 'react'
import useAddresses from '../../hooks/useAddresses'
import useChains from '../../hooks/useChains'
import AddressForm from './AddressForm'
import AddressTable from './AddressTable'

export default function AddressesScreen() {
  const { addresses, loading, error, add, update, remove, scan, reload } = useAddresses()
  const { chains } = useChains()
  const [showForm, setShowForm] = useState(false)
  const [scanState, setScanState] = useState(null)

  useEffect(() => {
    const unsubProgress = window.api.onScanProgress((data) => {
      setScanState(data)
    })
    const unsubComplete = window.api.onScanComplete((data) => {
      setScanState(null)
      reload()
    })
    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [reload])

  const handleAdd = async ({ address, description }) => {
    await add(address, description)
    setShowForm(false)
  }

  const handleDelete = async (address) => {
    await remove(address)
  }

  const handleScan = async (address) => {
    setScanState({ address, current: 0, total: 0, chainName: 'Starting...' })
    try {
      await scan(address)
    } catch (err) {
      console.error('Scan failed:', err)
      setScanState(null)
    }
  }

  if (loading) return <div className="empty-state"><p>Loading addresses...</p></div>

  return (
    <div>
      <div className="screen-header">
        <h2>Addresses ({addresses.length})</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Address'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <AddressForm
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      {addresses.length === 0 ? (
        <div className="empty-state">
          <h3>No addresses yet</h3>
          <p>Click "Add Address" to add your first EVM address.</p>
        </div>
      ) : (
        <AddressTable
          addresses={addresses}
          chains={chains}
          onUpdate={update}
          onDelete={handleDelete}
          onScan={handleScan}
          scanState={scanState}
        />
      )}
    </div>
  )
}
