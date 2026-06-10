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

function buildProperties(entry, chainNameOf) {
  const chains = Object.keys(entry.activeChains || {}).map(chainNameOf).join(', ')
  const props = [
    { key: 'evm_address', text: entry.address },
    { key: 'evm_chains', text: chains }
  ]
  if (entry.lastScanned) props.push({ key: 'evm_last_scanned', date: entry.lastScanned })
  return props
}

function propText(obj, key) {
  const p = (obj.properties || []).find(p => p.key === key)
  return p ? (p.text || '') : ''
}

// Read the address objects that belong to a collection.
async function fetchRemoteMembers(spaceId, collectionId) {
  const views = await anytypeClient.getListViews(spaceId, collectionId)
  if (views.length === 0) return []
  const objects = await anytypeClient.getListObjects(spaceId, collectionId, views[0].id)
  return objects
    .map(o => ({ id: o.id, name: o.name || '', address: propText(o, 'evm_address') }))
    .filter(m => m.address)
}

// Build a local address entry from a pulled Anytype object.
function remoteToEntry(member) {
  let address = member.address
  try { address = getAddress(member.address) } catch {}
  return {
    address,
    description: member.name || '',
    activeChains: {},
    lastScanned: null,
    anytypeObjectId: member.id
  }
}

// Two-way sync of one address book with its mapped Anytype collection.
// Set membership is merged in both directions (matched on the EVM address):
// addresses only in Anytype are pulled in; addresses only local are pushed up.
// For entries present on both sides the local copy wins, but an empty local
// description is filled from Anytype. Deletions are not propagated either way.
export async function syncBook(book) {
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
  let state = syncStateAll[book]
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

    const remote = entry.anytypeObjectId
      ? remoteById.get(entry.anytypeObjectId)
      : remoteByAddr.get(lc)

    // Fill an empty local description from Anytype before pushing
    if (remote && !entry.description && remote.name) entry.description = remote.name

    const name = entry.description || entry.address
    const properties = buildProperties(entry, chainNameOf)

    if (remote) {
      if (!entry.anytypeObjectId) entry.anytypeObjectId = remote.id
      try {
        await anytypeClient.updateObject(spaceId, entry.anytypeObjectId, { name, properties })
        updated++
        continue
      } catch (err) {
        if (err.status !== 404) throw err
        debug('Anytype object missing, recreating:', entry.anytypeObjectId)
      }
    }

    const obj = await anytypeClient.createObject(spaceId, { type_key: typeKey, name, properties })
    entry.anytypeObjectId = obj.id
    newObjectIds.push(obj.id)
    created++
  }

  if (newObjectIds.length > 0) {
    await anytypeClient.addToList(spaceId, collectionId, newObjectIds)
  }

  // Persist the object ids and the resolved type/collection for next time
  saveAddresses(addresses, book)
  syncStateAll[book] = { spaceId, collectionId, typeKey }
  settings.anytypeSyncState = syncStateAll
  saveSettings(settings)

  debug(`Synced book "${book}": ${created} created, ${updated} updated, ${pulled} pulled`)
  return { book, spaceId, collectionId, created, updated, pulled, total: addresses.length }
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
