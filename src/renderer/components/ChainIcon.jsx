import React, { useState, useEffect } from 'react'

const iconPathCache = {}

export default function ChainIcon({ chainId, size = 18 }) {
  const [iconPath, setIconPath] = useState(iconPathCache[chainId] || null)

  useEffect(() => {
    if (iconPathCache[chainId]) {
      setIconPath(iconPathCache[chainId])
      return
    }
    let cancelled = false
    window.api.getChainIconPath(chainId).then(p => {
      if (!cancelled && p) {
        iconPathCache[chainId] = p
        setIconPath(p)
      }
    })
    return () => { cancelled = true }
  }, [chainId])

  if (!iconPath) return null

  return (
    <img
      src={`file://${iconPath}`}
      width={size}
      height={size}
      style={{ borderRadius: '50%' }}
      onError={(e) => { e.target.style.display = 'none' }}
      alt=""
    />
  )
}
