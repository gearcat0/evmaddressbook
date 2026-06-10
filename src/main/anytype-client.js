import { ANYTYPE_API_URL, ANYTYPE_API_VERSION, debug } from './constants'
import { loadSettings } from './data-store'

function getApiKey() {
  return process.env.ANYTYPE_API_KEY || loadSettings().anytypeApiKey || ''
}

// Wraps the Anytype local API. The Anytype desktop app must be running and
// exposing its local API at ANYTYPE_API_URL.
class AnytypeClient {
  getApiKey() {
    return getApiKey()
  }

  async request(method, path, body) {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('No Anytype API key set. Add one in Settings.')
    }

    const url = `${ANYTYPE_API_URL}${path}`
    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Anytype-Version': ANYTYPE_API_VERSION,
          'Content-Type': 'application/json'
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
    } catch (err) {
      debug('Anytype request failed:', err.message)
      throw new Error(
        'Could not reach Anytype at ' + ANYTYPE_API_URL +
        '. Make sure the Anytype desktop app is running.'
      )
    }

    if (res.status === 401) {
      throw new Error('Anytype rejected the API key (401). Check the key in Settings.')
    }
    if (!res.ok) {
      let detail = ''
      try {
        const data = await res.json()
        detail = data.message || data.error || JSON.stringify(data)
      } catch {}
      const err = new Error(`Anytype API error ${res.status}${detail ? ': ' + detail : ''}`)
      err.status = res.status
      throw err
    }

    if (res.status === 204) return null
    return res.json()
  }

  async listSpaces() {
    const data = await this.request('GET', '/spaces')
    return (data && data.data) || []
  }

  async listTypes(spaceId) {
    const data = await this.request('GET', `/spaces/${spaceId}/types?limit=200`)
    return (data && data.data) || []
  }

  async createType(spaceId, body) {
    const data = await this.request('POST', `/spaces/${spaceId}/types`, body)
    return data && data.type
  }

  async createObject(spaceId, body) {
    const data = await this.request('POST', `/spaces/${spaceId}/objects`, body)
    return data && data.object
  }

  async updateObject(spaceId, objectId, body) {
    const data = await this.request('PATCH', `/spaces/${spaceId}/objects/${objectId}`, body)
    return data && data.object
  }

  async addToList(spaceId, listId, objectIds) {
    return this.request('POST', `/spaces/${spaceId}/lists/${listId}/objects`, { objects: objectIds })
  }
}

export const anytypeClient = new AnytypeClient()
