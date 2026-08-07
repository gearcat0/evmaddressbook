// Regenerates the packaging icons in build/ from resources/icon.svg.
//
// Run after changing the logo:  node scripts/generate-icons.mjs
//
// Needs `sharp` for SVG rasterization. It ships as a transitive dependency of
// electron-builder; if that ever changes, `npm i -D sharp` first.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const ROOT = path.resolve(import.meta.dirname, '..')
const SVG = path.join(ROOT, 'resources', 'icon.svg')
const OUT = path.join(ROOT, 'build')

// ICNS chunk types keyed by pixel size. The @2x variants share pixel
// dimensions with a smaller logical size, which is why some sizes appear twice.
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16pt @2x
  ['ic12', 64], // 32pt @2x
  ['ic07', 128],
  ['ic13', 256], // 128pt @2x
  ['ic08', 256],
  ['ic14', 512], // 256pt @2x
  ['ic09', 512],
  ['ic10', 1024] // 512pt @2x
]

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function render(size) {
  return sharp(SVG, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
}

function buildIcns(pngBySize) {
  const chunks = ICNS_TYPES.map(([type, size]) => {
    const data = pngBySize.get(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

// PNG-compressed ICO (supported by Windows Vista and later).
function buildIco(pngBySize) {
  const entries = ICO_SIZES.map(size => ({ size, data: pngBySize.get(size) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const dirSize = 16 * entries.length
  let offset = header.length + dirSize
  const dir = []
  for (const entry of entries) {
    const row = Buffer.alloc(16)
    row.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0) // 0 means 256
    row.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1)
    row.writeUInt8(0, 2) // palette
    row.writeUInt8(0, 3) // reserved
    row.writeUInt16LE(1, 4) // colour planes
    row.writeUInt16LE(32, 6) // bits per pixel
    row.writeUInt32LE(entry.data.length, 8)
    row.writeUInt32LE(offset, 12)
    offset += entry.data.length
    dir.push(row)
  }
  return Buffer.concat([header, ...dir, ...entries.map(e => e.data)])
}

const sizes = [...new Set([...ICNS_TYPES.map(([, s]) => s), ...ICO_SIZES, 512])].sort((a, b) => a - b)
const pngBySize = new Map()
for (const size of sizes) pngBySize.set(size, await render(size))

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'icon.icns'), buildIcns(pngBySize))
fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngBySize))
fs.writeFileSync(path.join(OUT, 'icon.png'), pngBySize.get(1024))
// The app window icon (referenced by src/main/index.js) tracks the same source.
fs.writeFileSync(path.join(ROOT, 'resources', 'icon.png'), pngBySize.get(512))

for (const file of ['icon.icns', 'icon.ico', 'icon.png']) {
  console.log(`build/${file}: ${fs.statSync(path.join(OUT, file)).size} bytes`)
}
