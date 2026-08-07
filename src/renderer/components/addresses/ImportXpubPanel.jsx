import React, { useState, useEffect, useMemo } from 'react'
import { Button, Field, Input, Select, Spinner } from 'evm-ui'
import {
  validateXpub, deriveAddresses, suggestedKind,
  ADDRESS_KINDS, UNSUPPORTED_FAMILIES
} from '../../../shared/xpub'

const COUNTS = [5, 10, 20, 50, 100]

// Import addresses derived from an extended PUBLIC key.
//
// The key stays in this component's state and is never sent over IPC, written
// to disk, or logged — only the derived addresses are imported.
export default function ImportXpubPanel({ book, onCancel, onImported }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState('evm')
  const [kindTouched, setKindTouched] = useState(false)
  const [count, setCount] = useState(20)
  const [label, setLabel] = useState('')
  const [selected, setSelected] = useState({})
  const [activity, setActivity] = useState(null) // {address: bool|null}
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const info = useMemo(() => validateXpub(text), [text])

  // Snap to the address type the key's prefix conventionally implies, until
  // the user picks one themselves.
  useEffect(() => {
    if (info.ok && !kindTouched) setKind(suggestedKind(info.format))
  }, [info.ok, info.format, kindTouched])

  const derived = useMemo(() => {
    if (!info.ok) return []
    try {
      return deriveAddresses(text, kind, count)
    } catch (err) {
      return []
    }
  }, [text, kind, count, info.ok])

  // Fresh derivation: select everything, drop any previous activity results.
  useEffect(() => {
    setSelected(Object.fromEntries(derived.map(d => [d.address, true])))
    setActivity(null)
  }, [derived])

  const selectedList = derived.filter(d => selected[d.address])
  const kindInfo = ADDRESS_KINDS.find(k => k.key === kind)

  const handleCheckActivity = async () => {
    setChecking(true)
    setError('')
    try {
      const results = await window.api.checkAddressActivity({
        addresses: derived.map(d => d.address),
        family: kindInfo.family
      })
      const map = Object.fromEntries(results.map(r => [r.address, r.active]))
      setActivity(map)
      // Keep only addresses with confirmed activity selected; leave unknowns on.
      setSelected(Object.fromEntries(derived.map(d => [d.address, map[d.address] !== false])))
    } catch (err) {
      setError(err.message || 'Activity check failed')
    } finally {
      setChecking(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setError('')
    try {
      const entries = selectedList.map(d => ({
        address: d.address,
        description: label ? `${label} ${d.path}` : `xpub ${d.path}`
      }))
      const result = await window.api.importAddresses({ entries, book })
      onImported(result)
    } catch (err) {
      setError(err.message || 'Import failed')
      setImporting(false)
    }
  }

  const toggle = (address) => setSelected(prev => ({ ...prev, [address]: !prev[address] }))
  const setAll = (value) => setSelected(Object.fromEntries(derived.map(d => [d.address, value])))

  return (
    <div className="inline-form">
      <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
        Paste an extended <strong>public</strong> key (xpub, ypub, or zpub) to import its
        addresses as watch-only entries. The key is used in this window only — it is never
        saved, synced, or sent anywhere. Never paste an xprv/yprv/zprv.
      </p>

      <Field
        label="Extended public key"
        error={text && !info.ok ? info.error : undefined}
      >
        <Input
          mono
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="xpub… / ypub… / zpub…"
          invalid={!!text && !info.ok}
          disabled={importing}
        />
      </Field>

      {info.ok && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {info.format} · watch-only
          {info.depth !== 3 && (
            <span style={{ color: 'var(--warning, #d19a26)' }}>
              {' '}· depth {info.depth}: this is not an account-level key, so addresses are
              derived relative to it and may not match your wallet
            </span>
          )}
        </div>
      )}

      {info.ok && (
        <div className="form-row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <Field label="Address type">
              <Select
                value={kind}
                onChange={(e) => { setKind(e.target.value); setKindTouched(true) }}
                disabled={importing}
              >
                {ADDRESS_KINDS.map(k => (
                  <option key={k.key} value={k.key}>{k.label} — {k.purpose}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Addresses">
              <Select
                value={String(count)}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={importing}
              >
                {COUNTS.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Label (optional)">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Ledger"
                disabled={importing}
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={handleCheckActivity}
              disabled={checking || importing || derived.length === 0}
              title="Probe each address for on-chain activity (uses API calls)"
            >
              {checking ? 'Checking…' : 'Check activity'}
            </Button>
          </div>
        </div>
      )}

      {derived.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {selectedList.length} of {derived.length} selected
            </span>
            <Button variant="secondary" size="sm" onClick={() => setAll(true)}>Select all</Button>
            <Button variant="secondary" size="sm" onClick={() => setAll(false)}>Select none</Button>
            {checking && <Spinner size={14} />}
          </div>
          <div className="table-container" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 60 }}>Path</th>
                  <th>Address</th>
                  {activity && <th style={{ width: 90 }}>Activity</th>}
                </tr>
              </thead>
              <tbody>
                {derived.map(d => (
                  <tr key={d.address}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!selected[d.address]}
                        onChange={() => toggle(d.address)}
                        disabled={importing}
                      />
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.path}</td>
                    <td><span className="address-text">{d.address}</span></td>
                    {activity && (
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {activity[d.address] === true ? 'Used'
                          : activity[d.address] === false ? '—'
                            : '?'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!text && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          Not derivable from an extended key:{' '}
          {UNSUPPORTED_FAMILIES.map(f => f.family).join(', ')} — {UNSUPPORTED_FAMILIES[0].reason.toLowerCase()}
          {', and the others use different key schemes.'}
        </div>
      )}

      {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button
          variant="primary"
          onClick={handleImport}
          disabled={importing || selectedList.length === 0}
        >
          {importing ? 'Importing…' : `Import ${selectedList.length} address${selectedList.length === 1 ? '' : 'es'}`}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={importing}>Cancel</Button>
      </div>
    </div>
  )
}
