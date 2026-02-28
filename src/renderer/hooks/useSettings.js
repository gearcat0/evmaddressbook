import { useState, useEffect, useCallback } from 'react'

export default function useSettings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await window.api.getSettings()
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const update = useCallback(async (updates) => {
    try {
      const data = await window.api.updateSettings(updates)
      setSettings(data)
      return data
    } catch (err) {
      console.error('Failed to update settings:', err)
      throw err
    }
  }, [])

  return { settings, loading, update, reload: load }
}
