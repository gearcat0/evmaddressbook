import { getAddress } from 'ethers'
import { anytypeClient } from './anytype-client'
import { loadAddresses, saveAddresses, loadChains, loadSettings, saveSettings, createBook, loadDeletions, saveDeletions } from './data-store'
import { debug } from './constants'

const TYPE_NAME = 'Address'

const ADDRESS_PROPERTIES = [
  { key: 'evm_address', name: 'Address', format: 'text' },
  { key: 'evm_chains', name: 'Active Chains', format: 'text' },
  { key: 'evm_last_scanned', name: 'Last Scanned', format: 'date' }
]

// A type key is reserved forever once used, even after the type is deleted.
// Using a fixed key therefore collides, and the omit-key fallback derives a
// generic key ("address") that Anytype lets you DUPLICATE and that can end up
// corrupted (createObject 500s). So always create with a fresh unique key.
let typeKeyCounter = 0
function freshTypeKey() {
  typeKeyCounter += 1
  return `evm_address_${Date.now().toString(36)}_${typeKeyCounter}`
}

async function createAddressType(spaceId) {
  const created = await anytypeClient.createType(spaceId, {
    key: freshTypeKey(),
    name: TYPE_NAME,
    plural_name: 'Addresses',
    layout: 'basic',
    properties: ADDRESS_PROPERTIES
  })
  debug('Created Anytype Address type in space', spaceId, created.key)
  return created.key
}

// Resolve the Address type for a space: prefer the key stored in sync state,
// then match a live type by name, else create a fresh one.
async function ensureAddressType(spaceId, state) {
  const types = await anytypeClient.listTypes(spaceId)

  if (state.typeKey && types.some(t => t.key === state.typeKey)) {
    return state.typeKey
  }

  const byName = types.find(t => t.name === TYPE_NAME && t.layout === 'basic')
  if (byName) return byName.key

  return createAddressType(spaceId)
}

function chainsString(entry, chainNameOf) {
  return Object.keys(entry.activeChains || {}).map(chainNameOf).join(', ')
}

function buildProperties(entry, chainsStr) {
  const props = [
    { key: 'evm_address', text: entry.address },
    { key: 'evm_chains', text: chainsStr }
  ]
  if (entry.lastScanned) props.push({ key: 'evm_last_scanned', date: entry.lastScanned })
  return props
}

// Compare dates at second granularity so re-serialization differences (e.g.
// dropped milliseconds) don't look like a change and cause endless re-writes.
function sameDate(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (isNaN(ta) || isNaN(tb)) return a === b
  return Math.floor(ta / 1000) === Math.floor(tb / 1000)
}

function propValue(obj, key) {
  const p = (obj.properties || []).find(p => p.key === key)
  if (!p) return ''
  if (p.text != null) return p.text
  if (p.date != null) return p.date
  return ''
}

function toMember(o) {
  return {
    id: o.id,
    name: o.name || '',
    address: propValue(o, 'evm_address'),
    chains: propValue(o, 'evm_chains'),
    lastScanned: propValue(o, 'evm_last_scanned')
  }
}

// Read the address objects that belong to a collection.
async function fetchRemoteMembers(spaceId, collectionId) {
  const views = await anytypeClient.getListViews(spaceId, collectionId)
  if (views.length === 0) return []
  const objects = await anytypeClient.getListObjects(spaceId, collectionId, views[0].id)
  return objects.map(toMember).filter(m => m.address)
}

// Build a local address entry from a pulled Anytype object.
// The Anytype object always needs a name, so when an entry has no description
// we use the address as the object name. Interpret that back into "no
// description" when reading.
function remoteDescription(member, address) {
  if (member.name && member.name.toLowerCase() !== address.toLowerCase()) return member.name
  return ''
}

function remoteToEntry(member) {
  let address = member.address
  try { address = getAddress(member.address) } catch {}
  const desc = remoteDescription(member, address)
  return {
    address,
    description: desc,
    activeChains: {},
    lastScanned: null,
    anytypeObjectId: member.id,
    anytypeName: desc // baseline: the description as last reconciled with Anytype
  }
}

// Serialize syncBook calls per book so the manual button and the background
// poller (or two quick clicks) can't run the same book concurrently and race
// on loadAddresses/saveAddresses.
const bookLocks = new Map()

// Run fn exclusively for a book, serialized after any in-flight work for it.
// Used by syncBook and by local address mutations so the background poll can't
// race them (e.g. resurrect a just-deleted address or lose an edit).
export function withBookLock(book, fn) {
  const prev = bookLocks.get(book) || Promise.resolve()
  const next = prev.then(() => fn(), () => fn())
  bookLocks.set(book, next.catch(() => {}))
  return next
}

export function syncBook(book) {
  return withBookLock(book, () => doSyncBook(book))
}

// Two-way sync of one address book with its mapped Anytype collection.
// Set membership is merged in both directions (matched on the EVM address):
// addresses only in Anytype are pulled in; addresses only local are pushed up.
// For entries present on both sides the local copy wins, but an empty local
// description is filled from Anytype. Deletions are not propagated either way.
//
// The sync is idempotent: when local and remote already agree it performs no
// writes (no PATCH/POST, no disk save), so it is safe to run on a short poll
// interval and our own writes never retrigger a sync.
async function doSyncBook(book) {
  const settings = loadSettings()
  const mapping = (settings.anytypeSpaces || {})[book]
  if (!mapping || !mapping.id) {
    throw new Error(`No Anytype space selected for "${book}"`)
  }
  const spaceId = mapping.id

  // Sync state (type key, collection id) is owned by the main process and kept
  // separate from the renderer-managed space selection so the two can't clobber
  // each other. Reset it if the book was pointed at a different space.
  const syncStateAll = settings.anytypeSyncState || {}
  const prevState = syncStateAll[book]
  let state = prevState
  if (!state || state.spaceId !== spaceId) state = { spaceId }

  let typeKey = await ensureAddressType(spaceId, state)

  // Create an address object, self-healing if the resolved type is corrupted
  // (some types can return 500 on object creation): make a fresh type and retry.
  let typeHealed = false
  const createAddressObject = async (payload) => {
    try {
      return await anytypeClient.createObject(spaceId, { ...payload, type_key: typeKey })
    } catch (err) {
      if (typeHealed || !(err.status >= 500)) throw err
      debug('createObject failed for type', typeKey, '- creating a fresh type and retrying')
      typeKey = await createAddressType(spaceId)
      typeHealed = true
      return anytypeClient.createObject(spaceId, { ...payload, type_key: typeKey })
    }
  }

  let collectionId = state.collectionId
  if (!collectionId) {
    const collection = await anytypeClient.createObject(spaceId, {
      type_key: 'collection',
      name: book
    })
    collectionId = collection.id
    debug('Created Anytype collection for book', book, collectionId)
  }

  const chains = loadChains()
  const chainNameOf = (id) => {
    const c = chains.find(c => String(c.chainid) === String(id))
    return c ? c.chainname : `Chain ${id}`
  }

  // Propagate local deletions: archive the tombstoned objects remotely, then
  // drop the ones that are gone (or already gone). Keep failures for retry.
  const deletions = loadDeletions()
  const tombstones = deletions[book] || []
  const tombSet = new Set(tombstones)
  let deletedRemote = 0
  if (tombstones.length > 0) {
    const remaining = []
    for (const objId of tombstones) {
      try {
        await anytypeClient.deleteObject(spaceId, objId)
        deletedRemote++
      } catch (err) {
        if (err.status !== 404) { remaining.push(objId); continue }
      }
    }
    if (remaining.length > 0) deletions[book] = remaining
    else delete deletions[book]
    saveDeletions(deletions)
  }

  // Exclude tombstoned objects from the working set so a lingering (not-yet-
  // archived) one is never pulled or reconciled back in.
  const remoteMembers = (await fetchRemoteMembers(spaceId, collectionId))
    .filter(m => !tombSet.has(m.id))
  const remoteByAddr = new Map(remoteMembers.map(m => [m.address.toLowerCase(), m]))
  const remoteById = new Map(remoteMembers.map(m => [m.id, m]))

  const addresses = loadAddresses(book)
  const localByAddr = new Map(addresses.map(a => [a.address.toLowerCase(), a]))

  let localChanged = false

  // PULL: add addresses that exist only in Anytype
  let pulled = 0
  const pulledAddrs = new Set()
  for (const m of remoteMembers) {
    const lc = m.address.toLowerCase()
    if (!localByAddr.has(lc)) {
      const entry = remoteToEntry(m)
      addresses.push(entry)
      localByAddr.set(lc, entry)
      pulledAddrs.add(entry.address.toLowerCase())
      localChanged = true
      pulled++
    }
  }

  // PUSH / UPDATE / LINK the local side up to Anytype
  let created = 0
  let updated = 0
  let deletedLocal = 0
  const newObjectIds = []
  const toDelete = new Set()

  for (const entry of addresses) {
    const lc = entry.address.toLowerCase()
    if (pulledAddrs.has(lc)) continue // just pulled; already identical to remote

    // The matched member is used to reconcile the description, link by address,
    // and decide whether an update is needed.
    let member = entry.anytypeObjectId
      ? remoteById.get(entry.anytypeObjectId)
      : remoteByAddr.get(lc)

    // A previously-synced entry that isn't a current collection member was
    // either deleted remotely or just isn't indexed yet (the collection view is
    // asynchronous). Fetch the object to tell them apart: archived/gone means it
    // was deleted elsewhere -> delete locally; otherwise reconcile and re-add.
    if (!member && entry.anytypeObjectId) {
      const obj = await anytypeClient.getObject(spaceId, entry.anytypeObjectId)
      if (!obj || obj.archived) {
        toDelete.add(entry)
        deletedLocal++
        continue
      }
      member = toMember(obj)
    }

    if (member && !entry.anytypeObjectId) {
      entry.anytypeObjectId = member.id
      localChanged = true
    }

    // Reconcile the description (the only user-editable field) against a stored
    // baseline so each instance only pushes its OWN edits and otherwise adopts
    // edits made elsewhere — rather than always overwriting Anytype.
    //   local edited   (desc != baseline)        -> push (local wins on conflict)
    //   remote edited  (remoteDesc != baseline)  -> pull
    //   neither                                  -> leave as-is
    if (member) {
      const remoteDesc = remoteDescription(member, entry.address)
      const localDesc = entry.description || ''
      // Migrate pre-baseline entries: seed from the local value so an existing
      // divergence is treated as a remote edit (adopted) rather than pushed.
      if (entry.anytypeName == null) entry.anytypeName = localDesc
      const baseline = entry.anytypeName
      const localChangedDesc = localDesc !== baseline
      const remoteChangedDesc = remoteDesc !== baseline
      if (!localChangedDesc && remoteChangedDesc) {
        entry.description = remoteDesc
        entry.anytypeName = remoteDesc
        localChanged = true
      }
    }

    const objectId = entry.anytypeObjectId || (member && member.id) || null
    const chainsStr = chainsString(entry, chainNameOf)
    const name = entry.description || entry.address

    // chains/lastScanned are local-derived scan data: always pushed, never pulled.
    const inSync = member &&
      member.name === name &&
      member.chains === chainsStr &&
      sameDate(member.lastScanned, entry.lastScanned)
    if (inSync) {
      if (entry.anytypeName !== (entry.description || '')) {
        entry.anytypeName = entry.description || ''
        localChanged = true
      }
      // Object exists but isn't a visible member (lag / confirmed via getObject):
      // re-add so it becomes a member and stops needing a per-poll existence check.
      if (objectId && !remoteById.has(objectId)) newObjectIds.push(objectId)
      continue
    }

    const properties = buildProperties(entry, chainsStr)

    if (objectId) {
      try {
        await anytypeClient.updateObject(spaceId, objectId, { name, properties })
        if (entry.anytypeName !== (entry.description || '')) {
          entry.anytypeName = entry.description || ''
          localChanged = true
        }
        // Re-add to the collection if it isn't a visible member (lag / address link).
        if (!remoteById.has(objectId)) newObjectIds.push(objectId)
        updated++
        continue
      } catch (err) {
        if (err.status !== 404) throw err
        // Object was deleted remotely between fetch and update -> delete locally.
        debug('Anytype object gone during update, deleting locally:', objectId)
        toDelete.add(entry)
        deletedLocal++
        continue
      }
    }

    const obj = await createAddressObject({ name, properties })
    entry.anytypeObjectId = obj.id
    entry.anytypeName = entry.description || ''
    newObjectIds.push(obj.id)
    localChanged = true
    created++
  }

  // Apply remote deletions to the local book
  if (toDelete.size > 0) {
    for (let i = addresses.length - 1; i >= 0; i--) {
      if (toDelete.has(addresses[i])) addresses.splice(i, 1)
    }
    localChanged = true
  }

  if (newObjectIds.length > 0) {
    await anytypeClient.addToList(spaceId, collectionId, newObjectIds)
  }

  // Persist only when something actually changed, so idle polls do no disk I/O.
  if (localChanged) saveAddresses(addresses, book)
  const stateChanged = !prevState || prevState.collectionId !== collectionId || prevState.typeKey !== typeKey
  if (stateChanged) {
    syncStateAll[book] = { spaceId, collectionId, typeKey }
    settings.anytypeSyncState = syncStateAll
    saveSettings(settings)
  }

  if (created || updated || pulled || deletedRemote || deletedLocal) {
    debug(`Synced book "${book}": ${created} created, ${updated} updated, ${pulled} pulled, ${deletedRemote} deleted-remote, ${deletedLocal} deleted-local`)
  }
  return {
    book, spaceId, collectionId,
    created, updated, pulled,
    deletedRemote, deletedLocal,
    changed: localChanged,
    total: addresses.length
  }
}

// List the collections available in a space, for the import picker.
export async function listSpaceCollections(spaceId) {
  const objects = await anytypeClient.searchSpace(spaceId, { types: ['collection'] })
  return objects.map(o => ({ id: o.id, name: o.name || '(untitled)' }))
}

// Create a new local address book linked to an existing Anytype collection and
// pull its contents.
export async function importBook({ spaceId, spaceName, collectionId, bookName }) {
  const book = createBook(bookName) // throws if the name is taken/invalid

  const settings = loadSettings()
  const spaces = settings.anytypeSpaces || {}
  spaces[book] = { id: spaceId, name: spaceName || '' }
  settings.anytypeSpaces = spaces
  const syncStateAll = settings.anytypeSyncState || {}
  syncStateAll[book] = { spaceId, collectionId }
  settings.anytypeSyncState = syncStateAll
  saveSettings(settings)

  const result = await syncBook(book)
  return { ...result, book }
}
