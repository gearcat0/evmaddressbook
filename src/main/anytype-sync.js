import { anytypeClient } from './anytype-client'
import { loadAddresses, saveAddresses, loadChains, loadSettings, saveSettings } from './data-store'
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

// Push-only sync of one address book into its mapped Anytype space.
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

  const addresses = loadAddresses(book)
  let created = 0
  let updated = 0
  const newObjectIds = []

  for (const entry of addresses) {
    const name = entry.description || entry.address
    const properties = buildProperties(entry, chainNameOf)

    if (entry.anytypeObjectId) {
      try {
        await anytypeClient.updateObject(spaceId, entry.anytypeObjectId, { name, properties })
        updated++
        continue
      } catch (err) {
        if (err.status !== 404) throw err
        // Object was deleted in Anytype — fall through and recreate
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

  debug(`Synced book "${book}": ${created} created, ${updated} updated`)
  return { book, spaceId, collectionId, created, updated, total: addresses.length }
}
