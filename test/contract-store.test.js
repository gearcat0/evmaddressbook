import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTempDataDir, removeDataDir } from './helpers'

vi.mock('../src/main/providers/provider-registry', () => ({
  providers: { getSourceCode: vi.fn() }
}))

import { providers } from '../src/main/providers/provider-registry'
import { findContractAddressDir, contractDir, readAbiText } from '../src/main/contract-store'
import { refreshAbi } from '../src/main/address-type-resolver'

const CHECKSUM = '0xF977814e90dA44bFA03b6295A0616a897441aceC'
const LOWER = CHECKSUM.toLowerCase()
const ABI = [{ type: 'function', name: 'foo', inputs: [], outputs: [] }]

let dir
const storeAbi = (address, chainId, abi) => {
  const d = path.join(dir, 'contracts', address, String(chainId))
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'abi.json'), JSON.stringify(abi))
}

beforeEach(() => { dir = useTempDataDir({ 'settings.json': {} }) })
afterEach(() => { removeDataDir(dir); vi.clearAllMocks() })

describe('contract store lookups', () => {
  it('finds a checksummed contract folder from a lowercase address', () => {
    storeAbi(CHECKSUM, 1, ABI)
    expect(findContractAddressDir(LOWER)).toBe(path.join(dir, 'contracts', CHECKSUM))
    expect(JSON.parse(readAbiText(LOWER, 1))).toEqual(ABI)
    expect(JSON.parse(readAbiText(CHECKSUM, '1'))).toEqual(ABI)
  })

  it('returns null when nothing is stored', () => {
    expect(findContractAddressDir(CHECKSUM)).toBeNull()
    expect(readAbiText(CHECKSUM, 1)).toBeNull()
  })

  it('reuses the existing folder instead of creating a differently-cased one', () => {
    storeAbi(CHECKSUM, 1, ABI)
    const d = contractDir(LOWER, 10, { create: true })
    expect(d).toBe(path.join(dir, 'contracts', CHECKSUM, '10'))
    expect(fs.readdirSync(path.join(dir, 'contracts'))).toEqual([CHECKSUM])
  })
})

describe('refreshAbi', () => {
  it('re-fetches and stores the verified ABI, replacing a stale one', async () => {
    storeAbi(CHECKSUM, 1, [{ type: 'function', name: 'old', inputs: [], outputs: [] }])
    providers.getSourceCode.mockResolvedValue({ ABI: JSON.stringify(ABI), ContractName: 'Foo', SourceCode: 'contract Foo {}' })
    const text = await refreshAbi('1', LOWER)
    expect(JSON.parse(text)).toEqual(ABI)
    expect(providers.getSourceCode).toHaveBeenCalledWith('1', LOWER)
    expect(JSON.parse(readAbiText(CHECKSUM, 1))).toEqual(ABI)
    expect(fs.readdirSync(path.join(dir, 'contracts'))).toEqual([CHECKSUM])
  })

  it('throws for unverified contracts and leaves stored data alone', async () => {
    storeAbi(CHECKSUM, 1, ABI)
    providers.getSourceCode.mockResolvedValue({ ABI: 'Contract source code not verified' })
    await expect(refreshAbi('1', CHECKSUM)).rejects.toThrow(/No verified ABI/)
    expect(JSON.parse(readAbiText(CHECKSUM, 1))).toEqual(ABI)
  })

  it('surfaces explorer errors', async () => {
    providers.getSourceCode.mockRejectedValue(new Error('rate limited'))
    await expect(refreshAbi('1', CHECKSUM)).rejects.toThrow(/rate limited/)
  })
})
