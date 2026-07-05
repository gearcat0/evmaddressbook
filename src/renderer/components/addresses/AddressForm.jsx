import React, { useState } from 'react'
import { Field, Input, Button } from 'evm-ui'

export default function AddressForm({ onSubmit, onCancel, initial }) {
  const [address, setAddress] = useState(initial?.address || '')
  const [description, setDescription] = useState(initial?.description || '')
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

    if (!isEdit && !/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setError('Invalid EVM address (must be 0x followed by 40 hex characters)')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        address: isEdit ? initial.address : trimmed,
        description: description.trim()
      })
      if (!isEdit) {
        setAddress('')
        setDescription('')
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
                placeholder="0x..."
                disabled={submitting}
                invalid={!!error}
              />
            </Field>
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
