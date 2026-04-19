import fs from 'fs'
import path from 'path'
import { AbiCoder } from 'ethers'
import { client } from './etherscan-client'
import { getDataDir } from './data-store'
import { debug } from './constants'

const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

async function withRetry(fn, label) {
  const delays = [1000, 2000, 4000]
  let lastErr
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < delays.length) {
        debug(`${label} failed (attempt ${attempt + 1}/${delays.length + 1}), retrying in ${delays[attempt]}ms: ${err.message}`)
        await new Promise(r => setTimeout(r, delays[attempt]))
      }
    }
  }
  throw lastErr
}

function validateProxyResult(data, method) {
  if (data.error) throw new Error(data.error.message || `${method} RPC error`)
  if (!data.result) return '0x'
  if (typeof data.result === 'string' && !data.result.startsWith('0x')) {
    throw new Error(`${method}: ${data.result.slice(0, 80)}`)
  }
  return data.result
}

function ensureContractDir(address, chainId) {
  const dir = path.join(getDataDir(), 'contracts', address, String(chainId))
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    debug('Failed to write', filePath, err.message)
  }
}

async function getCode(chainId, address) {
  const data = await client.apiCall({
    chainid: chainId,
    module: 'proxy',
    action: 'eth_getCode',
    address,
    tag: 'latest'
  })
  return validateProxyResult(data, 'eth_getCode')
}

async function getSourceCode(chainId, address) {
  const data = await client.apiCall({
    chainid: chainId,
    module: 'contract',
    action: 'getsourcecode',
    address
  })
  if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
    return data.result[0]
  }
  return null
}

async function getContractCreation(chainId, address) {
  const data = await client.apiCall({
    chainid: chainId,
    module: 'contract',
    action: 'getcontractcreation',
    contractaddresses: address
  })
  if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
    return data.result[0]
  }
  return null
}

async function getStorageAt(chainId, address, slot) {
  const data = await client.apiCall({
    chainid: chainId,
    module: 'proxy',
    action: 'eth_getStorageAt',
    address,
    position: slot,
    tag: 'latest'
  })
  return validateProxyResult(data, 'eth_getStorageAt') || '0x0'
}

async function ethCall(chainId, to, callData) {
  const data = await client.apiCall({
    chainid: chainId,
    module: 'proxy',
    action: 'eth_call',
    to,
    data: callData,
    tag: 'latest'
  })
  return validateProxyResult(data, 'eth_call')
}

function decodeAddress(hex) {
  if (!hex || hex === '0x' || hex === '0x0' || hex.length < 66) return null
  const addr = '0x' + hex.slice(-40)
  if (addr === '0x0000000000000000000000000000000000000000') return null
  return addr
}

export async function resolveAddressType(chainId, address) {
  const result = { addressType: null }
  const errors = []

  // Step 1: Check if EOA by getting code
  let code
  try {
    code = await withRetry(() => getCode(chainId, address), `eth_getCode(${chainId})`)
  } catch (err) {
    errors.push(`eth_getCode failed on chain ${chainId}: ${err.message}`)
    debug(`eth_getCode failed for ${address} on chain ${chainId}:`, err.message)
    return { typeInfo: result, errors }
  }

  if (!code || code === '0x' || code === '0x0') {
    result.addressType = 'eoa'
    return { typeInfo: result, errors }
  }

  result.addressType = 'contract'

  // Step 2: Get source code info
  let sourceInfo
  try {
    sourceInfo = await withRetry(() => getSourceCode(chainId, address), `getsourcecode(${chainId})`)
    if (sourceInfo) {
      if (sourceInfo.ContractName) {
        result.contractName = sourceInfo.ContractName
      }

      // Store ABI and source locally
      const dir = ensureContractDir(address, chainId)
      if (sourceInfo.ABI && sourceInfo.ABI !== 'Contract source code not verified') {
        try {
          writeJsonSafe(path.join(dir, 'abi.json'), JSON.parse(sourceInfo.ABI))
        } catch {
          writeJsonSafe(path.join(dir, 'abi.json'), sourceInfo.ABI)
        }
      }
      if (sourceInfo.SourceCode) {
        writeJsonSafe(path.join(dir, 'source.json'), { sourceCode: sourceInfo.SourceCode })
      }
    }
  } catch (err) {
    errors.push(`getsourcecode failed on chain ${chainId}: ${err.message}`)
    debug(`getsourcecode failed for ${address} on chain ${chainId}:`, err.message)
  }

  // Step 3: Get contract creation info
  try {
    const creation = await withRetry(() => getContractCreation(chainId, address), `getcontractcreation(${chainId})`)
    if (creation) {
      if (creation.contractCreator) result.contractCreator = creation.contractCreator
      if (creation.txHash) result.creationTxHash = creation.txHash
    }
  } catch (err) {
    errors.push(`getcontractcreation failed on chain ${chainId}: ${err.message}`)
    debug(`getcontractcreation failed for ${address} on chain ${chainId}:`, err.message)
  }

  // Step 4: If TransparentUpgradeableProxy, resolve implementation
  if (result.contractName === 'TransparentUpgradeableProxy') {
    try {
      // Try Implementation field from getsourcecode first
      if (sourceInfo && sourceInfo.Implementation) {
        result.implementationAddress = sourceInfo.Implementation
      } else {
        // Fall back to EIP-1967 storage slot
        const slotValue = await withRetry(() => getStorageAt(chainId, address, EIP1967_IMPL_SLOT), `eth_getStorageAt(${chainId})`)
        const impl = decodeAddress(slotValue)
        if (impl) result.implementationAddress = impl
      }
    } catch (err) {
      errors.push(`Implementation lookup failed on chain ${chainId}: ${err.message}`)
      debug(`Implementation lookup failed for ${address} on chain ${chainId}:`, err.message)
    }

    // Fetch ABI and source for the implementation contract
    if (result.implementationAddress) {
      try {
        const implSource = await withRetry(() => getSourceCode(chainId, result.implementationAddress), `getsourcecode impl(${chainId})`)
        if (implSource) {
          if (implSource.ContractName) result.implementationName = implSource.ContractName
          const implDir = ensureContractDir(result.implementationAddress, chainId)
          if (implSource.ABI && implSource.ABI !== 'Contract source code not verified') {
            try {
              writeJsonSafe(path.join(implDir, 'abi.json'), JSON.parse(implSource.ABI))
            } catch {
              writeJsonSafe(path.join(implDir, 'abi.json'), implSource.ABI)
            }
          }
          if (implSource.SourceCode) {
            writeJsonSafe(path.join(implDir, 'source.json'), { sourceCode: implSource.SourceCode })
          }
        }
      } catch (err) {
        errors.push(`Implementation getsourcecode failed on chain ${chainId}: ${err.message}`)
        debug(`getsourcecode failed for implementation ${result.implementationAddress} on chain ${chainId}:`, err.message)
      }
    }
  }

  // Step 5: If GnosisSafeProxy or SafeProxy, get Safe details
  if (result.contractName === 'GnosisSafeProxy' || result.contractName === 'SafeProxy') {
    const coder = AbiCoder.defaultAbiCoder()

    // VERSION()
    try {
      await withRetry(async () => {
        const versionResult = await ethCall(chainId, address, '0xffa1ad74')
        if (versionResult && versionResult !== '0x') {
          const [version] = coder.decode(['string'], versionResult)
          result.version = version
        }
      }, `VERSION()(${chainId})`)
    } catch (err) {
      errors.push(`VERSION() failed on chain ${chainId}: ${err.message}`)
      debug(`VERSION() call failed for ${address} on chain ${chainId}:`, err.message)
    }

    // getOwners()
    try {
      await withRetry(async () => {
        const ownersResult = await ethCall(chainId, address, '0xa0e67e2b')
        if (ownersResult && ownersResult !== '0x') {
          const [owners] = coder.decode(['address[]'], ownersResult)
          result.owners = owners.map(o => o.toString())
        }
      }, `getOwners()(${chainId})`)
    } catch (err) {
      errors.push(`getOwners() failed on chain ${chainId}: ${err.message}`)
      debug(`getOwners() call failed for ${address} on chain ${chainId}:`, err.message)
    }

    // getThreshold()
    try {
      await withRetry(async () => {
        const thresholdResult = await ethCall(chainId, address, '0xe75235b8')
        if (thresholdResult && thresholdResult !== '0x') {
          const [threshold] = coder.decode(['uint256'], thresholdResult)
          result.threshold = Number(threshold)
        }
      }, `getThreshold()(${chainId})`)
    } catch (err) {
      errors.push(`getThreshold() failed on chain ${chainId}: ${err.message}`)
      debug(`getThreshold() call failed for ${address} on chain ${chainId}:`, err.message)
    }
  }

  return { typeInfo: result, errors }
}
