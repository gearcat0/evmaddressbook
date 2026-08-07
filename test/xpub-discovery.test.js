import { describe, it, expect, vi } from 'vitest'
import { discoverAddresses, DEFAULT_GAP_LIMIT } from '../src/shared/xpub-discovery'

// Fake derivation: address strings are just "addr-<i>".
const derive = (start, count) =>
  Array.from({ length: count }, (_, k) => ({
    index: start + k,
    path: `0/${start + k}`,
    address: `addr-${start + k}`
  }))

// Builds a probe that reports the given indexes as used.
function probeWithUsed(usedIndexes, { failIndexes = [] } = {}) {
  const used = new Set(usedIndexes)
  const failed = new Set(failIndexes)
  return async (addresses) => addresses.map(address => {
    const i = Number(address.split('-')[1])
    if (failed.has(i)) return { address, active: null }
    return { address, active: used.has(i) }
  })
}

describe('discoverAddresses', () => {
  it('stops after gapLimit consecutive unused addresses on an empty account', async () => {
    const probe = vi.fn(probeWithUsed([]))
    const result = await discoverAddresses({ derive, probe, gapLimit: 20 })

    expect(result.used).toEqual([])
    expect(result.scanned).toBe(20) // exactly the gap limit, no further work
    expect(result.hitCap).toBe(false)
    expect(result.aborted).toBe(false)
  })

  it('keeps going while addresses are used, then stops one gap later', async () => {
    // used at 0..4 and 25; the run of unused from 26 ends discovery at 46
    const result = await discoverAddresses({
      derive, probe: probeWithUsed([0, 1, 2, 3, 4, 25]), gapLimit: 20
    })

    expect(result.used.map(u => u.index)).toEqual([0, 1, 2, 3, 4, 25])
    expect(result.scanned).toBe(60) // batches of 20: the gap completes mid-batch
    expect(result.addresses).toHaveLength(60)
  })

  it('does not stop early when a used address appears within the gap window', async () => {
    const result = await discoverAddresses({
      derive, probe: probeWithUsed([0, 19, 38]), gapLimit: 20
    })
    expect(result.used.map(u => u.index)).toEqual([0, 19, 38])
  })

  it('respects a smaller gap limit', async () => {
    const result = await discoverAddresses({ derive, probe: probeWithUsed([]), gapLimit: 5 })
    expect(result.scanned).toBe(20) // first batch is 20; gap satisfied within it
    expect(result.used).toEqual([])
  })

  it('honours maxAddresses and reports hitting the cap', async () => {
    // every address used -> discovery can never satisfy the gap
    const probe = probeWithUsed(Array.from({ length: 500 }, (_, i) => i))
    const result = await discoverAddresses({ derive, probe, maxAddresses: 60 })

    expect(result.scanned).toBe(60)
    expect(result.used).toHaveLength(60)
    expect(result.hitCap).toBe(true)
  })

  it('reports progress as it goes', async () => {
    const onProgress = vi.fn()
    await discoverAddresses({ derive, probe: probeWithUsed([0]), gapLimit: 20, onProgress })

    expect(onProgress).toHaveBeenCalled()
    const last = onProgress.mock.calls.at(-1)[0]
    expect(last).toMatchObject({ scanned: expect.any(Number), used: 1 })
  })

  it('stops when aborted and says so', async () => {
    let calls = 0
    const isAborted = () => ++calls > 2 // allow two batches, then abort
    const probe = probeWithUsed(Array.from({ length: 500 }, (_, i) => i))
    const result = await discoverAddresses({ derive, probe, isAborted, maxAddresses: 500 })

    expect(result.aborted).toBe(true)
    expect(result.scanned).toBeLessThan(500)
  })

  it('counts unreachable probes as unused but reports them', async () => {
    const result = await discoverAddresses({
      derive, probe: probeWithUsed([0], { failIndexes: [5, 6] }), gapLimit: 20
    })
    expect(result.unchecked).toBe(2)
    expect(result.failed).toBe(false)
    expect(result.addresses.find(a => a.index === 5).active).toBeNull()
  })

  it('bails out when an entire batch is unreachable rather than truncating', async () => {
    const probe = async (addresses) => addresses.map(address => ({ address, active: null }))
    const result = await discoverAddresses({ derive, probe })

    expect(result.failed).toBe(true)
    expect(result.used).toEqual([])
  })

  it('defaults to the BIP44 gap limit of 20', () => {
    expect(DEFAULT_GAP_LIMIT).toBe(20)
  })
})
