import { useState, useMemo, useCallback } from 'react'

export default function useSortFilter(items, defaultSortKey = null) {
  const [sortKey, setSortKey] = useState(defaultSortKey)
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter] = useState('')

  const toggleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey])

  const filtered = useMemo(() => {
    if (!filter) return items
    const lower = filter.toLowerCase()
    return items.filter(item =>
      Object.entries(item).some(([key, val]) => {
        if (key === 'activeChains' && val && typeof val === 'object' && !Array.isArray(val)) {
          return Object.entries(val).some(([chainId, info]) => {
            if (chainId.includes(lower)) return true
            if (info && typeof info === 'object') {
              return Object.values(info).some(v => String(v).toLowerCase().includes(lower))
            }
            return false
          })
        }
        return String(val).toLowerCase().includes(lower)
      })
    )
  }, [items, filter])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      let aVal = a[sortKey]
      let bVal = b[sortKey]
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const sortIndicator = useCallback((key) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }, [sortKey, sortDir])

  return { sorted, filter, setFilter, toggleSort, sortIndicator, sortKey, sortDir }
}
