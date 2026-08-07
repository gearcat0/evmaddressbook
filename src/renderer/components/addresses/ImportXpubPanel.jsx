import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Button, Field, Input, Select, Spinner } from 'evm-ui'
import {
  validateXpub, deriveAddresses, suggestedKind,
  ADDRESS_KINDS, UNSUPPORTED_FAMILIES
} from '../../../shared/xpub'
import { discoverAddresses, DEFAULT_GAP_LIMIT } from '../../../shared/xpub-discovery'

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
  const [includeChange, setIncludeChange] = useState(false)
  const [discovered, setDiscovered] = useState(null) // [{index, path, address, active}]
  const [discovery, setDiscovery] = useState(null) // {running, scanned, used, summary}
  const abortRef = useRef(false)

  const info = useMemo(() => validateXpub(text), [text])

  // Snap to the address type the key's prefix conventionally implies, until
  // the user picks one themselves.
  useEffect(() => {
    if (info.ok && !kindTouched) setKind(suggestedKind(info.format))
  }, [info.ok, info.format, kindTouched])

  const manual = useMemo(() => {
    if (!info.ok) return []
    try {
      return deriveAddresses(text, kind, count)
    } catch (err) {
      return []
    }
  }, [text, kind, count, info.ok])

  // Discovery results replace the fixed-count list once available.
  const derived = discovered || manual

  // Changing the key, type, or count invalidates any previous discovery.
  useEffect(() => {
    setDiscovered(null)
    setDiscovery(null)
    setActivity(null)
  }, [text, kind, count, includeChange])

  useEffect(() => {
    if (discovered) {
      // Pre-select the addresses that actually have activity.
      setSelected(Object.fromEntries(discovered.map(d => [d.address, d.active === true])))
    } else {
      setSelected(Object.fromEntries(manual.map(d => [d.address, true])))
    }
  }, [manual, discovered])

  const selectedList = derived.filter(d => selected[d.address])
  const kindInfo = ADDRESS_KINDS.find(k => k.key === kind)

  // Activity comes either from the manual probe or from discovery.
  const activityMap = discovered
    ? Object.fromEntries(discovered.map(d => [d.address, d.active]))
    : activity
  const busy = checking || importing || (discovery && discovery.running)

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

  // BIP44 gap-limit discovery: walk each branch until 20 consecutive unused
  // addresses. Derivation stays local; only addresses are sent for probing.
  const handleDiscover = async () => {
    abortRef.current = false
    setError('')
    setActivity(null)
    setDiscovered(null)
    setDiscovery({ running: true, scanned: 0, used: 0 })

    const branches = includeChange ? [0, 1] : [0]
    const all = []
    let capped = false
    let unchecked = 0
    let failed = false

    try {
      for (const change of branches) {
        const result = await discoverAddresses({
          derive: (start, n) =>
            deriveAddresses(text, kind, n, { change, startIndex: start }),
          probe: (addresses) =>
            window.api.checkAddressActivity({ addresses, family: kindInfo.family }),
          gapLimit: DEFAULT_GAP_LIMIT,
          isAborted: () => abortRef.current,
          onProgress: ({ scanned, used }) =>
            setDiscovery(prev => ({
              running: true,
              scanned: (prev?.base || 0) + scanned,
              used: (prev?.usedBase || 0) + used,
              base: prev?.base || 0,
              usedBase: prev?.usedBase || 0
            }))
        })
        all.push(...result.addresses)
        capped = capped || result.hitCap
        unchecked += result.unchecked
        failed = failed || result.failed
        setDiscovery(prev => ({
          ...prev,
          base: (prev?.base || 0) + result.scanned,
          usedBase: (prev?.usedBase || 0) + result.used.length
        }))
        if (result.failed || abortRef.current) break
      }

      const used = all.filter(a => a.active === true)
      setDiscovered(all)
      setDiscovery({
        running: false,
        scanned: all.length,
        used: used.length,
        summary: failed
          ? 'Discovery stopped: the activity probe is not responding.'
          : `Scanned ${all.length} address${all.length === 1 ? '' : 'es'}, found ${used.length} with activity.` +
            (abortRef.current ? ' Stopped early.' : '') +
            (capped ? ' Reached the safety cap — there may be more.' : '') +
            (unchecked > 0 ? ` ${unchecked} could not be checked.` : '')
      })
    } catch (err) {
      setDiscovery(null)
      setError(err.message || 'Discovery failed')
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
              disabled={busy || derived.length === 0}
              title="Probe the listed addresses for on-chain activity (uses API calls)"
            >
              {checking ? 'Checking…' : 'Check activity'}
            </Button>
            <Button
              variant="primary"
              onClick={handleDiscover}
              disabled={busy}
              title={`Keep deriving until ${DEFAULT_GAP_LIMIT} consecutive addresses are unused (BIP44 gap limit)`}
            >
              Discover used
            </Button>
          </div>
        </div>
      )}

      {info.ok && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={includeChange}
            onChange={(e) => setIncludeChange(e.target.checked)}
            disabled={busy}
          />
          Also discover change addresses (1/i) — doubles the number of lookups
        </label>
      )}

      {discovery && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {discovery.running && <Spinner size={14} />}
          <span>
            {discovery.running
              ? `Discovering… scanned ${discovery.scanned}, found ${discovery.used} with activity`
              : discovery.summary}
          </span>
          {discovery.running && (
            <Button variant="secondary" size="sm" onClick={() => { abortRef.current = true }}>
              Stop
            </Button>
          )}
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
                  {activityMap && <th style={{ width: 90 }}>Activity</th>}
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
                        disabled={busy}
                      />
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.path}</td>
                    <td><span className="address-text">{d.address}</span></td>
                    {activityMap && (
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {activityMap[d.address] === true ? 'Used'
                          : activityMap[d.address] === false ? '—'
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
