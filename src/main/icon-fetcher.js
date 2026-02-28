import fs from 'fs'
import path from 'path'
import { CHAINLIST_RPCS_URL, ICON_METADATA_BASE_URL, IPFS_GATEWAY, debug } from './constants'
import { getDataDir } from './data-store'

function getIconsDir() {
  return path.join(getDataDir(), 'icons', 'chains')
}

export function getIconPath(chainId) {
  const iconsDir = getIconsDir()
  for (const ext of ['.png', '.svg']) {
    const p = path.join(iconsDir, `${chainId}${ext}`)
    if (fs.existsSync(p)) return p
  }
  const defaultPath = path.join(iconsDir, 'default.png')
  if (fs.existsSync(defaultPath)) return defaultPath
  return null
}

// 5x7 bitmap font for A-Z and 0-9 (each row is 5 bits wide, MSB = left)
const FONT = {
  A: [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  B: [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  C: [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  D: [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
  E: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  F: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  G: [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0E],
  H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  M: [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  P: [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  Q: [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  R: [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  S: [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E],
  T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
  X: [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
  '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C]
}

export function generateCheckerboardPng(letter) {
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

  // Draw letter if provided
  const glyph = letter ? FONT[letter.toUpperCase()] : null
  if (glyph) {
    const scale = 3
    const glyphW = 5 * scale  // 15px
    const glyphH = 7 * scale  // 21px
    const ox = Math.floor((width - glyphW) / 2)
    const oy = Math.floor((height - glyphH) / 2)
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row] & (0x10 >> col)) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = ox + col * scale + sx
              const py = oy + row * scale + sy
              const offset = (py * width + px) * 4
              rawData[offset] = 255
              rawData[offset + 1] = 255
              rawData[offset + 2] = 255
              rawData[offset + 3] = 255
            }
          }
        }
      }
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

function detectImageType(buffer) {
  if (buffer.length < 4) return null
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png'
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg'
  // SVG: look for <svg or <?xml in first 256 bytes
  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf-8')
  if (head.includes('<svg') || (head.includes('<?xml') && head.includes('<svg'))) return 'svg'
  return null
}

async function downloadImage(url, destDir, chainId) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) return false
  const buffer = Buffer.from(await response.arrayBuffer())
  const type = detectImageType(buffer)
  if (!type) {
    debug(`Rejected non-image content for chain ${chainId} (${buffer.subarray(0, 20).toString('utf-8').trim()})`)
    return false
  }
  const ext = type === 'svg' ? '.svg' : '.png'
  fs.writeFileSync(path.join(destDir, `${chainId}${ext}`), buffer)
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

  // Build chainId → chain name map for letter fallbacks
  const chainNameMap = {}
  for (const c of chains) {
    const id = c.chainid || c.chainId
    const name = c.chainname || c.chainName || ''
    if (id && name) chainNameMap[id] = name
  }

  function writeLetterFallback(chainId) {
    const name = chainNameMap[chainId] || ''
    const letter = name.charAt(0) || null
    const destPath = path.join(iconsDir, `${chainId}.png`)
    fs.writeFileSync(destPath, generateCheckerboardPng(letter))
  }

  const chainIds = chains.map(c => c.chainid || c.chainId)

  for (const chainId of chainIds) {
    // Skip if already downloaded (check both extensions)
    if (fs.existsSync(path.join(iconsDir, `${chainId}.png`)) ||
        fs.existsSync(path.join(iconsDir, `${chainId}.svg`))) continue

    const iconName = iconNameMap[chainId]
    if (!iconName) {
      writeLetterFallback(chainId)
      debug(`No icon mapping for chain ${chainId}, using letter fallback`)
      continue
    }

    try {
      // Fetch icon metadata to get IPFS CID
      const metaUrl = `${ICON_METADATA_BASE_URL}/${iconName}.json`
      const meta = await fetchJson(metaUrl)

      if (!meta || !Array.isArray(meta) || meta.length === 0) {
        writeLetterFallback(chainId)
        debug(`No icon metadata for ${iconName} (chain ${chainId})`)
        continue
      }

      const ipfsUrl = meta[0]?.url
      if (!ipfsUrl || !ipfsUrl.startsWith('ipfs://')) {
        writeLetterFallback(chainId)
        debug(`Invalid IPFS URL for ${iconName}`)
        continue
      }

      const cid = ipfsUrl.replace('ipfs://', '').replace(/^\//, '')
      const downloadUrl = `${IPFS_GATEWAY}/${cid}`

      const ok = await downloadImage(downloadUrl, iconsDir, chainId)
      if (!ok) {
        writeLetterFallback(chainId)
        debug(`Failed to download icon for chain ${chainId}`)
      } else {
        debug(`Downloaded icon for chain ${chainId} (${iconName})`)
      }
    } catch (err) {
      writeLetterFallback(chainId)
      debug(`Error fetching icon for chain ${chainId}:`, err.message)
    }
  }

  debug('Icon fetch complete')
}
