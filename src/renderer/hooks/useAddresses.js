import { useState, useEffect, useCallback } from 'react'

export default function useAddresses() {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await window.api.listAddresses()
      setAddresses(data)
    } catch (err) {
      setError('Failed to load addresses: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const add = useCallback(async (address, description) => {
    const entry = await window.api.addAddress({ address, description })
    setAddresses(prev => [...prev, entry])
    return entry
  }, [])

  const update = useCallback(async (address, description) => {
    const entry = await window.api.updateAddress({ address, description })
    setAddresses(prev => prev.map(a =>
      a.address.toLowerCase() === address.toLowerCase() ? entry : a
    ))
    return entry
  }, [])

  const remove = useCallback(async (address) => {
    await window.api.deleteAddress({ address })
    setAddresses(prev => prev.filter(a =>
      a.address.toLowerCase() !== address.toLowerCase()
    ))
  }, [])

  const scan = useCallback(async (address) => {
    return window.api.scanAddress({ address })
  }, [])

  return { addresses, loading, error, add, update, remove, scan, reload: load }
}
