import React, { useState, useEffect, useCallback } from 'react'

export default function StatusBar() {
  const [zoom, setZoom] = useState(100)
  const [apiCalls, setApiCalls] = useState(0)
  const [apiErrors, setApiErrors] = useState(0)

  const refreshStatus = useCallback(async () => {
    const [zoomFactor, status] = await Promise.all([
      window.api.getZoom(),
      window.api.getStatus()
    ])
    setZoom(Math.round(zoomFactor * 100))
    setApiCalls(status.apiCallCount)
    setApiErrors(status.apiErrorCount)
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 2000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const changeZoom = async (delta) => {
    const newFactor = Math.min(2, Math.max(0.5, (zoom + delta) / 100))
    await window.api.setZoom(newFactor)
    setZoom(Math.round(newFactor * 100))
  }

  return (
    <div className="status-bar">
      <div className="status-item">
        <span className="status-label">API Calls:</span>
        <span className="status-value">{apiCalls}</span>
      </div>
      <div className="status-item">
        <span className="status-label">API Errors:</span>
        <span className={`status-value${apiErrors > 0 ? ' status-error' : ''}`}>{apiErrors}</span>
      </div>
      <div className="status-item">
        <button className="status-zoom-btn" onClick={() => changeZoom(-10)}>-</button>
        <span className="status-label">Zoom:</span>
        <span className="status-value">{zoom}%</span>
        <button className="status-zoom-btn" onClick={() => changeZoom(10)}>+</button>
      </div>
    </div>
  )
}
