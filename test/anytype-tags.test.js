import { describe, it, expect } from 'vitest'
import { reconcileTags, tagsString } from '../src/main/anytype-sync'

function entryWith(tags, baseline) {
  const e = { address: '0xabc', tags }
  if (baseline !== undefined) e.anytypeTags = baseline
  return e
}

describe('tagsString', () => {
  it('joins tags and treats missing as empty', () => {
    expect(tagsString(['a', 'b'])).toBe('a, b')
    expect(tagsString(undefined)).toBe('')
    expect(tagsString([])).toBe('')
  })
})

describe('reconcileTags', () => {
  it('adopts remote edits when local is untouched', () => {
    const e = entryWith(['exchange'], 'exchange')
    expect(reconcileTags(e, 'exchange, defi')).toBe(true)
    expect(e.tags).toEqual(['exchange', 'defi'])
    expect(e.anytypeTags).toBe('exchange, defi')
  })

  it('keeps local edits (they win and get pushed later)', () => {
    const e = entryWith(['exchange', 'new-local-tag'], 'exchange')
    expect(reconcileTags(e, 'exchange, remote-tag')).toBe(false)
    expect(e.tags).toEqual(['exchange', 'new-local-tag'])
  })

  it('never wipes local tags on an empty remote value (pre-tags objects)', () => {
    const e = entryWith(['exchange'], 'exchange')
    expect(reconcileTags(e, '')).toBe(false)
    expect(e.tags).toEqual(['exchange'])
  })

  it('seeds the baseline on first contact so divergence reads as remote edit', () => {
    const e = entryWith(['local-only']) // no baseline yet
    expect(reconcileTags(e, 'remote-a, remote-b')).toBe(true)
    expect(e.tags).toEqual(['remote-a', 'remote-b'])
    expect(e.anytypeTags).toBe('remote-a, remote-b')
  })

  it('is idempotent across formatting differences in the remote text', () => {
    const e = entryWith(['a', 'b'], 'a, b')
    // remote spelled without spaces: semantically identical, no churn
    expect(reconcileTags(e, 'a,b')).toBe(false)
    expect(e.tags).toEqual(['a', 'b'])
    // and repeated calls stay stable after an adopt
    const e2 = entryWith([], '')
    expect(reconcileTags(e2, 'x, y')).toBe(true)
    expect(reconcileTags(e2, 'x, y')).toBe(false)
    expect(reconcileTags(e2, 'x,y')).toBe(false)
  })

  it('pulls tags onto an entry that has none', () => {
    const e = entryWith([], '')
    expect(reconcileTags(e, 'cold storage')).toBe(true)
    expect(e.tags).toEqual(['cold storage'])
  })
})
