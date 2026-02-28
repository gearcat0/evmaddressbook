import fs from 'fs'
import path from 'path'
import { CHAINLIST_RPCS_URL, ICON_METADATA_BASE_URL, IPFS_GATEWAY, debug } from './constants'
import { getDataDir } from './data-store'

function getIconsDir() {
  return path.join(getDataDir(), 'icons', 'chains')
}

export function getIconPath(chainId) {
  const iconsDir = getIconsDir()
  const chainPath = path.join(iconsDir, `${chainId}.png`)
  if (fs.existsSync(chainPath)) return chainPath
  const defaultPath = path.join(iconsDir, 'default.png')
  if (fs.existsSync(defaultPath)) return defaultPath
  return null
}

export function generateCheckerboardPng() {
  const width = 32
  const height = 32
  const squareSize = 4

  // Build raw RGBA pixel data
  const rawData = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isLight = ((Math.floor(x / squareSize) + Math.floor(y / squareSize)) % 2) === 0
      const grey = isLight ? 180 : 140
      const offset = (y * width + x) * 4
      rawData[offset] = grey
      rawData[offset + 1] = grey
      rawData[offset + 2] = grey
      rawData[offset + 3] = 255
    }
  }

  // Build PNG file manually (no dependencies)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function crc32(buf) {
    let crc = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i]
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  function makeChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crcInput = Buffer.concat([typeBytes, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcInput))
    return Buffer.concat([len, typeBytes, data, crc])
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT chunk - raw pixel data with filter bytes
  const filteredData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    filteredData[y * (1 + width * 4)] = 0 // filter: none
    rawData.copy(filteredData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }

  // Compress with zlib
  const zlib = require('zlib')
  const compressed = zlib.deflateSync(filteredData)

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    iend
  ])
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) return null
  return response.json()
}

async function downloadImage(url, destPath) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) return false
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(destPath, buffer)
  return true
}

export async function fetchAndStoreIcons(chains) {
  const iconsDir = getIconsDir()
  fs.mkdirSync(iconsDir, { recursive: true })

  // Ensure default.png exists
  const defaultPath = path.join(iconsDir, 'default.png')
  if (!fs.existsSync(defaultPath)) {
    fs.writeFileSync(defaultPath, generateCheckerboardPng())
    debug('Generated default checkerboard icon')
  }

  // Fetch rpcs.json to get chainId → icon name mapping
  let rpcsData
  try {
    rpcsData = await fetchJson(CHAINLIST_RPCS_URL)
  } catch (err) {
    debug('Failed to fetch rpcs.json:', err.message)
    return
  }

  if (!rpcsData || !Array.isArray(rpcsData)) {
    debug('rpcs.json returned invalid data')
    return
  }

  // Build chainId → icon name map
  const iconNameMap = {}
  for (const entry of rpcsData) {
    if (entry.chainId && entry.icon) {
      const iconName = typeof entry.icon === 'string' ? entry.icon : entry.icon?.url
      if (iconName) iconNameMap[entry.chainId] = iconName
    }
  }

  const chainIds = chains.map(c => c.chainid || c.chainId)

  for (const chainId of chainIds) {
    const destPath = path.join(iconsDir, `${chainId}.png`)

    // Skip if already downloaded
    if (fs.existsSync(destPath)) continue

    const iconName = iconNameMap[chainId]
    if (!iconName) {
      // No icon available — use default
      fs.copyFileSync(defaultPath, destPath)
      debug(`No icon mapping for chain ${chainId}, using default`)
      continue
    }

    try {
      // Fetch icon metadata to get IPFS CID
      const metaUrl = `${ICON_METADATA_BASE_URL}/${iconName}.json`
      const meta = await fetchJson(metaUrl)

      if (!meta || !Array.isArray(meta) || meta.length === 0) {
        fs.copyFileSync(defaultPath, destPath)
        debug(`No icon metadata for ${iconName} (chain ${chainId})`)
        continue
      }

      const ipfsUrl = meta[0]?.url
      if (!ipfsUrl || !ipfsUrl.startsWith('ipfs://')) {
        fs.copyFileSync(defaultPath, destPath)
        debug(`Invalid IPFS URL for ${iconName}`)
        continue
      }

      const cid = ipfsUrl.replace('ipfs://', '').replace(/^\//, '')
      const downloadUrl = `${IPFS_GATEWAY}/${cid}`

      const ok = await downloadImage(downloadUrl, destPath)
      if (!ok) {
        fs.copyFileSync(defaultPath, destPath)
        debug(`Failed to download icon for chain ${chainId}`)
      } else {
        debug(`Downloaded icon for chain ${chainId} (${iconName})`)
      }
    } catch (err) {
      fs.copyFileSync(defaultPath, destPath)
      debug(`Error fetching icon for chain ${chainId}:`, err.message)
    }
  }

  debug('Icon fetch complete')
}
