import React, { useState } from 'react'

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
          <div className="form-group" style={{ flex: 2 }}>
            <label>Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              disabled={submitting}
            />
          </div>
        )}
        <div className="form-group" style={{ flex: 1 }}>
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            disabled={submitting}
          />
        </div>
        <div className="form-group" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
          </button>
          {onCancel && (
            <button className="btn btn-secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
    </form>
  )
}
