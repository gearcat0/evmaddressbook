import { useState, useEffect, useCallback } from 'react'

export default function useChains() {
  const [chains, setChains] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await window.api.listChains()
      setChains(data)
      if (data.length === 0) {
        setRefreshing(true)
        try {
          const refreshed = await window.api.refreshChains()
          setChains(refreshed)
        } catch (err) {
          setError('Failed to fetch chain list from Etherscan: ' + err.message)
        } finally {
          setRefreshing(false)
        }
      }
    } catch (err) {
      setError('Failed to load chains: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const data = await window.api.refreshChains()
      setChains(data)
    } catch (err) {
      setError('Failed to refresh chains: ' + err.message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  return { chains, setChains, loading, refreshing, error, refresh, reload: load }
}
