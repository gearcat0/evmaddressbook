import { describe, it, expect } from 'vitest'
import { normalizeTags } from '../src/shared/tags'

describe('normalizeTags', () => {
  it('parses a comma-separated string', () => {
    expect(normalizeTags('exchange, cold storage,defi')).toEqual(['exchange', 'cold storage', 'defi'])
  })

  it('accepts an array', () => {
    expect(normalizeTags([' exchange ', 'defi'])).toEqual(['exchange', 'defi'])
  })

  it('drops empties and whitespace-only entries', () => {
    expect(normalizeTags('a,, ,b,')).toEqual(['a', 'b'])
  })

  it('dedupes case-insensitively, first spelling wins', () => {
    expect(normalizeTags('Exchange,exchange,EXCHANGE,defi')).toEqual(['Exchange', 'defi'])
  })

  it('returns [] for null/undefined/empty', () => {
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags('')).toEqual([])
    expect(normalizeTags([])).toEqual([])
  })
})
