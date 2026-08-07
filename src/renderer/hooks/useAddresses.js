import { useState, useEffect, useCallback } from 'react'
import { addressKey } from '../../shared/address-validator'

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

  const add = useCallback(async (address, description, tags) => {
    const entry = await window.api.addAddress({ address, description, tags, book })
    setAddresses(prev => [...prev, entry])
    return entry
  }, [book])

  const update = useCallback(async (address, description, tags) => {
    const entry = await window.api.updateAddress({ address, description, tags, book })
    setAddresses(prev => prev.map(a =>
      addressKey(a.address) === addressKey(address) ? entry : a
    ))
    return entry
  }, [book])

  const remove = useCallback(async (address) => {
    await window.api.deleteAddress({ address, book })
    setAddresses(prev => prev.filter(a =>
      addressKey(a.address) !== addressKey(address)
    ))
  }, [book])

  const scan = useCallback(async (address) => {
    return window.api.scanAddress({ address, book })
  }, [book])

  return { addresses, loading, error, add, update, remove, scan, reload: load }
}
