import React, { useState } from 'react'
import { Button, Input, EmptyState } from 'evm-ui'
import useSettings from '../../hooks/useSettings'

export default function SettingsScreen() {
  const { settings, loading, update } = useSettings()
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyLoaded, setKeyLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  const [anytypeKey, setAnytypeKey] = useState('')
  const [showAnytypeKey, setShowAnytypeKey] = useState(false)
  const [anytypeKeyLoaded, setAnytypeKeyLoaded] = useState(false)
  const [anytypeSaved, setAnytypeSaved] = useState(false)
  const [anytypeStatus, setAnytypeStatus] = useState(null) // null | {testing} | {ok,count} | {error}

  if (!keyLoaded && settings.etherscanApiKey !== undefined) {
    setApiKey(settings.etherscanApiKey || '')
    setKeyLoaded(true)
  }

  if (!anytypeKeyLoaded && settings.anytypeApiKey !== undefined) {
    setAnytypeKey(settings.anytypeApiKey || '')
    setAnytypeKeyLoaded(true)
  }

  if (loading) return <EmptyState title="Loading settings…" />

  const handleSaveApiKey = async () => {
    await update({ etherscanApiKey: apiKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveAnytypeKey = async () => {
    await update({ anytypeApiKey: anytypeKey })
    setAnytypeSaved(true)
    setTimeout(() => setAnytypeSaved(false), 2000)
  }

  // Saves the key and verifies it against the local API.
  const handleTestAnytype = async () => {
    setAnytypeStatus({ testing: true })
    try {
      // Persist the key first so the test uses what's in the box
      await update({ anytypeApiKey: anytypeKey })
      const list = await window.api.anytypeListSpaces()
      setAnytypeStatus({ ok: true, count: list.length })
    } catch (err) {
      setAnytypeStatus({ error: err.message || 'Connection failed' })
    }
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
          <Button variant="secondary" onClick={handleChangeDir}>
            Change
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Etherscan API Key</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Get a free API key at etherscan.io. Required for chain activity scanning.
        </p>
        <div className="settings-row">
          <Input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setSaved(false) }}
            placeholder="Enter your Etherscan API key"
          />
          <Button variant="secondary" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </Button>
          <Button variant="primary" onClick={handleSaveApiKey}>
            {saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Anytype API Key</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Used to sync address books with Anytype for sharing. Generate a key in the
          Anytype desktop app (Settings → API Keys), which exposes a local API at
          http://localhost:31009.
        </p>
        <div className="settings-row">
          <Input
            type={showAnytypeKey ? 'text' : 'password'}
            value={anytypeKey}
            onChange={(e) => { setAnytypeKey(e.target.value); setAnytypeSaved(false) }}
            placeholder="Enter your Anytype API key"
          />
          <Button variant="secondary" onClick={() => setShowAnytypeKey(!showAnytypeKey)}>
            {showAnytypeKey ? 'Hide' : 'Show'}
          </Button>
          <Button variant="primary" onClick={handleSaveAnytypeKey}>
            {anytypeSaved ? 'Saved!' : 'Save'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleTestAnytype}
            disabled={!anytypeKey || (anytypeStatus && anytypeStatus.testing)}
          >
            {anytypeStatus && anytypeStatus.testing ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
        {anytypeStatus && anytypeStatus.error && (
          <div className="form-error" style={{ marginTop: 10 }}>{anytypeStatus.error}</div>
        )}
        {anytypeStatus && anytypeStatus.ok && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            Connected — {anytypeStatus.count} space{anytypeStatus.count === 1 ? '' : 's'} found.
            Choose a sync space per address book on the Addresses tab.
          </div>
        )}
      </div>
    </div>
  )
}
