import fs from 'fs'
import path from 'path'
import { AbiCoder } from 'ethers'
import { providers } from './providers/provider-registry'
import { debug } from './constants'
import { contractDir, readAbiText } from './contract-store'

const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'


function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    debug('Failed to write', filePath, err.message)
  }
}

function storeContractArtifacts(address, chainId, sourceInfo) {
  const dir = contractDir(address, chainId, { create: true })
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

// Re-fetch one contract's verified source/ABI from the explorer for one chain
// and store it, regardless of scan state. Returns the stored ABI text; throws
// with the reason when there is nothing to store (unverified, not a contract,
// explorer error).
export async function refreshAbi(chainId, address) {
  const sourceInfo = await providers.getSourceCode(chainId, address)
  if (!sourceInfo || !sourceInfo.ABI || sourceInfo.ABI === 'Contract source code not verified') {
    throw new Error(`No verified ABI for ${address} on chain ${chainId}`)
  }
  storeContractArtifacts(address, chainId, sourceInfo)
  const text = readAbiText(address, chainId)
  if (!text) throw new Error(`Could not store the ABI for ${address} on chain ${chainId}`)
  return text
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
    code = await providers.getCode(chainId, address)
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
    sourceInfo = await providers.getSourceCode(chainId, address)
    if (sourceInfo) {
      if (sourceInfo.ContractName) {
        result.contractName = sourceInfo.ContractName
      }
      storeContractArtifacts(address, chainId, sourceInfo)
    }
  } catch (err) {
    errors.push(`getsourcecode failed on chain ${chainId}: ${err.message}`)
    debug(`getsourcecode failed for ${address} on chain ${chainId}:`, err.message)
  }

  // Step 3: Get contract creation info
  try {
    const creation = await providers.getContractCreation(chainId, address)
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
        const slotValue = await providers.getStorageAt(chainId, address, EIP1967_IMPL_SLOT)
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
        const implSource = await providers.getSourceCode(chainId, result.implementationAddress)
        if (implSource) {
          if (implSource.ContractName) result.implementationName = implSource.ContractName
          storeContractArtifacts(result.implementationAddress, chainId, implSource)
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
      const versionResult = await providers.ethCall(chainId, address, '0xffa1ad74')
      if (versionResult && versionResult !== '0x') {
        const [version] = coder.decode(['string'], versionResult)
        result.version = version
      }
    } catch (err) {
      errors.push(`VERSION() failed on chain ${chainId}: ${err.message}`)
      debug(`VERSION() call failed for ${address} on chain ${chainId}:`, err.message)
    }

    // getOwners()
    try {
      const ownersResult = await providers.ethCall(chainId, address, '0xa0e67e2b')
      if (ownersResult && ownersResult !== '0x') {
        const [owners] = coder.decode(['address[]'], ownersResult)
        result.owners = owners.map(o => o.toString())
      }
    } catch (err) {
      errors.push(`getOwners() failed on chain ${chainId}: ${err.message}`)
      debug(`getOwners() call failed for ${address} on chain ${chainId}:`, err.message)
    }

    // getThreshold()
    try {
      const thresholdResult = await providers.ethCall(chainId, address, '0xe75235b8')
      if (thresholdResult && thresholdResult !== '0x') {
        const [threshold] = coder.decode(['uint256'], thresholdResult)
        result.threshold = Number(threshold)
      }
    } catch (err) {
      errors.push(`getThreshold() failed on chain ${chainId}: ${err.message}`)
      debug(`getThreshold() call failed for ${address} on chain ${chainId}:`, err.message)
    }
  }

  return { typeInfo: result, errors }
}
