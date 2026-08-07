import React, { useState } from 'react'
import { Field, Input, Button } from 'evm-ui'
import { detectFamily, SUPPORTED_FAMILIES_LABEL } from '../../../shared/address-validator'

const FAMILY_LABELS = {
  evm: 'EVM',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
  tron: 'Tron',
  cardano: 'Cardano',
  xrp: 'XRP Ledger',
  dogecoin: 'Dogecoin',
  zcash: 'Zcash',
  monero: 'Monero',
  near: 'NEAR'
}

export default function AddressForm({ onSubmit, onCancel, initial }) {
  const [address, setAddress] = useState(initial?.address || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [tags, setTags] = useState((initial?.tags || []).join(', '))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEdit = !!initial

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const trimmed = address.trim()
    if (!isEdit && !trimmed) {
      setError('Address is required')
      return
    }

    if (!isEdit && !detectFamily(trimmed)) {
      setError(`Not a valid address for any supported chain (${SUPPORTED_FAMILIES_LABEL})`)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        address: isEdit ? initial.address : trimmed,
        description: description.trim(),
        tags: tags
      })
      if (!isEdit) {
        setAddress('')
        setDescription('')
        setTags('')
      }
    } catch (err) {
      setError(err.message || 'Failed to save address')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        {!isEdit && (
          <div style={{ flex: 2 }}>
            <Field label="Address" error={error || undefined}>
              <Input
                mono
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Any supported address (0x…, bc1…, addr1…, r…, D…, t1…, 4…, …)"
                disabled={submitting}
                invalid={!!error}
              />
            </Field>
            {!error && detectFamily(address.trim()) && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Detected: {FAMILY_LABELS[detectFamily(address.trim())]}
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={submitting}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Tags">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated, e.g. exchange, defi"
              disabled={submitting}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
          </Button>
          {onCancel && (
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {isEdit && error && <div className="form-error">{error}</div>}
    </form>
  )
}
