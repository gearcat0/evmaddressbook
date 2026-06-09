import { useState, useEffect, useCallback } from 'react'

export default function useAddresses(book) {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.listAddresses(book)
      setAddresses(data)
    } catch (err) {
      setError('Failed to load addresses: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [book])

  useEffect(() => { load() }, [load])

  const add = useCallback(async (address, description) => {
    const entry = await window.api.addAddress({ address, description, book })
    setAddresses(prev => [...prev, entry])
    return entry
  }, [book])

  const update = useCallback(async (address, description) => {
    const entry = await window.api.updateAddress({ address, description, book })
    setAddresses(prev => prev.map(a =>
      a.address.toLowerCase() === address.toLowerCase() ? entry : a
    ))
    return entry
  }, [book])

  const remove = useCallback(async (address) => {
    await window.api.deleteAddress({ address, book })
    setAddresses(prev => prev.filter(a =>
      a.address.toLowerCase() !== address.toLowerCase()
    ))
  }, [book])

  const scan = useCallback(async (address) => {
    return window.api.scanAddress({ address, book })
  }, [book])

  return { addresses, loading, error, add, update, remove, scan, reload: load }
}
