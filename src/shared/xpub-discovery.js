// BIP44 gap-limit discovery.
//
// Walks a derivation branch in batches, probing each address for on-chain
// activity, and stops once `gapLimit` consecutive addresses come back unused.
// Kept free of ethers/IPC so it can be unit-tested with fake callbacks.

export const DEFAULT_GAP_LIMIT = 20
export const DEFAULT_MAX_ADDRESSES = 200
const BATCH_SIZE = 20

// derive(startIndex, count) -> [{index, path, address}]           (synchronous)
// probe(addresses)          -> [{address, active: bool|null}]     (async)
//   active === null means "could not check"; treated as unused for gap
//   counting but reported separately so the caller can warn.
export async function discoverAddresses({
  derive,
  probe,
  gapLimit = DEFAULT_GAP_LIMIT,
  maxAddresses = DEFAULT_MAX_ADDRESSES,
  onProgress,
  isAborted
}) {
  const results = []
  let consecutiveUnused = 0
  let unchecked = 0
  let index = 0
  let aborted = false
  let hitCap = false

  while (index < maxAddresses) {
    if (isAborted && isAborted()) {
      aborted = true
      break
    }

    const batch = derive(index, Math.min(BATCH_SIZE, maxAddresses - index))
    if (batch.length === 0) break

    const probed = await probe(batch.map(b => b.address))
    const activityOf = new Map(probed.map(p => [p.address, p.active]))

    // Every address in a batch that fails to answer means we are flying blind;
    // stopping is safer than silently truncating the discovery.
    if (probed.length > 0 && probed.every(p => p.active === null)) {
      return {
        addresses: results,
        used: results.filter(r => r.active === true),
        scanned: index,
        unchecked: unchecked + probed.length,
        aborted: false,
        hitCap: false,
        failed: true
      }
    }

    for (const item of batch) {
      const active = activityOf.has(item.address) ? activityOf.get(item.address) : null
      results.push({ ...item, active })
      if (active === true) {
        consecutiveUnused = 0
      } else {
        if (active === null) unchecked++
        consecutiveUnused++
      }
    }

    index += batch.length
    if (onProgress) {
      onProgress({
        scanned: index,
        used: results.filter(r => r.active === true).length,
        consecutiveUnused
      })
    }

    if (consecutiveUnused >= gapLimit) break
  }

  if (index >= maxAddresses && consecutiveUnused < gapLimit) hitCap = true

  return {
    addresses: results,
    used: results.filter(r => r.active === true),
    scanned: index,
    unchecked,
    aborted,
    hitCap,
    failed: false
  }
}
