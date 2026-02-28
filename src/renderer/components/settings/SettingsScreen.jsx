import React, { useState } from 'react'
import useSettings from '../../hooks/useSettings'

export default function SettingsScreen() {
  const { settings, loading, update } = useSettings()
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyLoaded, setKeyLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!keyLoaded && settings.etherscanApiKey !== undefined) {
    setApiKey(settings.etherscanApiKey || '')
    setKeyLoaded(true)
  }

  if (loading) return <div className="empty-state"><p>Loading settings...</p></div>

  const handleSaveApiKey = async () => {
    await update({ etherscanApiKey: apiKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleChangeDir = async () => {
    const dir = await window.api.openDirectoryDialog()
    if (dir) {
      await update({ dataDir: dir })
    }
  }

  return (
    <div>
      <div className="screen-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-section">
        <h3>Data Directory</h3>
        <div className="settings-row">
          <div className="data-dir-display">{settings.dataDir || 'Default'}</div>
          <button className="btn btn-secondary" onClick={handleChangeDir}>
            Change
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Etherscan API Key</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Get a free API key at etherscan.io. Required for chain activity scanning.
        </p>
        <div className="settings-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setSaved(false) }}
            placeholder="Enter your Etherscan API key"
          />
          <button
            className="btn btn-secondary"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
          <button className="btn btn-primary" onClick={handleSaveApiKey}>
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
