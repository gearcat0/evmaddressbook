import { getAddress } from 'ethers'
import { anytypeClient } from './anytype-client'
import { loadAddresses, saveAddresses, loadChains, loadSettings, saveSettings, createBook } from './data-store'
import { debug } from './constants'

const TYPE_NAME = 'Address'
const PREFERRED_TYPE_KEY = 'evm_addr_book'

const ADDRESS_PROPERTIES = [
  { key: 'evm_address', name: 'Address', format: 'text' },
  { key: 'evm_chains', name: 'Active Chains', format: 'text' },
  { key: 'evm_last_scanned', name: 'Last Scanned', format: 'date' }
]

// Resolve the Address type for a space, reusing an existing one where possible.
// Anytype reserves a type key even after the type is deleted, so we never rely
// on a fixed key: prefer the key stored on the book mapping, then match by name,
// and only create as a last resort (falling back to a server-assigned key if our
// preferred key is already taken).
async function ensureAddressType(spaceId, state) {
  const types = await anytypeClient.listTypes(spaceId)

  if (state.typeKey && types.some(t => t.key === state.typeKey)) {
    return state.typeKey
  }

  const byName = types.find(t => t.name === TYPE_NAME && t.layout === 'basic')
  if (byName) return byName.key

  const body = {
    name: TYPE_NAME,
    plural_name: 'Addresses',
    layout: 'basic',
    properties: ADDRESS_PROPERTIES
  }
  let created
  try {
    created = await anytypeClient.createType(spaceId, { ...body, key: PREFERRED_TYPE_KEY })
  } catch (err) {
    if (err.status === 400 && /already exists/i.test(err.message)) {
      // Preferred key is reserved (e.g. from a deleted type) — let Anytype assign one
      created = await anytypeClient.createType(spaceId, body)
    } else {
      throw err
    }
  }
  debug('Created Anytype Address type in space', spaceId, created.key)
  return created.key
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

// Read the address objects that belong to a collection.
async function fetchRemoteMembers(spaceId, collectionId) {
  const views = await anytypeClient.getListViews(spaceId, collectionId)
  if (views.length === 0) return []
  const objects = await anytypeClient.getListObjects(spaceId, collectionId, views[0].id)
  return objects
    .map(o => ({
      id: o.id,
      name: o.name || '',
      address: propValue(o, 'evm_address'),
      chains: propValue(o, 'evm_chains'),
      lastScanned: propValue(o, 'evm_last_scanned')
    }))
    .filter(m => m.address)
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

export function syncBook(book) {
  const prev = bookLocks.get(book) || Promise.resolve()
  const next = prev.then(() => doSyncBook(book), () => doSyncBook(book))
  bookLocks.set(book, next.catch(() => {}))
  return next
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

  const typeKey = await ensureAddressType(spaceId, state)

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

  const remoteMembers = await fetchRemoteMembers(spaceId, collectionId)
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
  const newObjectIds = []

  for (const entry of addresses) {
    const lc = entry.address.toLowerCase()
    if (pulledAddrs.has(lc)) continue // just pulled; already identical to remote

    // The matched member is used to reconcile the description, link by address,
    // and decide whether an update is needed. We must NOT gate the update on it:
    // the collection view is indexed asynchronously and can omit recently-added
    // objects, so an entry with a known object id is updated directly by id.
    const member = entry.anytypeObjectId
      ? remoteById.get(entry.anytypeObjectId)
      : remoteByAddr.get(lc)

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
        debug('Anytype object missing, recreating:', objectId)
        entry.anytypeObjectId = null
        localChanged = true
      }
    }

    const obj = await anytypeClient.createObject(spaceId, { type_key: typeKey, name, properties })
    entry.anytypeObjectId = obj.id
    entry.anytypeName = entry.description || ''
    newObjectIds.push(obj.id)
    localChanged = true
    created++
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

  if (created || updated || pulled) {
    debug(`Synced book "${book}": ${created} created, ${updated} updated, ${pulled} pulled`)
  }
  return { book, spaceId, collectionId, created, updated, pulled, changed: localChanged, total: addresses.length }
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
