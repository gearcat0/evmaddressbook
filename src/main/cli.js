import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { loadAddresses, loadChains, getDataDir, bookExists, listBooks } from './data-store'
import { getDefaultDataDir } from './constants'
import { scanAddress } from './chain-scanner'

// Pull "--book <name>" out of the argument list, returning the remaining args.
function extractBook(args) {
  const idx = args.indexOf('--book')
  if (idx === -1) return { args, book: null }
  const name = args[idx + 1]
  if (!name || name.startsWith('--')) {
    return { args, book: null, error: 'Usage: --book <name>' }
  }
  const rest = args.slice(0, idx).concat(args.slice(idx + 2))
  return { args: rest, book: name }
}

export function handleCli(argv) {
  const rawArgs = argv.slice(app.isPackaged ? 1 : 2)

  const { args, book, error: bookError } = extractBook(rawArgs)
  if (bookError) {
    console.error(bookError)
    process.exitCode = 1
    return true
  }

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return true
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('1.2.0')
    return true
  }

  if (book !== null && !bookExists(book)) {
    console.error(`Unknown address book: ${book}`)
    process.exitCode = 1
    return true
  }

  if (args.includes('--addresses')) {
    const addresses = loadAddresses(book)
    console.log(JSON.stringify(addresses, null, 2))
    return true
  }

  if (args.includes('--chains')) {
    const chains = loadChains()
    console.log(JSON.stringify(chains, null, 2))
    return true
  }

  if (args.includes('--list-books')) {
    console.log(JSON.stringify(listBooks(), null, 2))
    return true
  }

  if (args.includes('--rescan')) {
    return runRescan(book)
  }

  if (args.includes('--scan')) {
    const idx = args.indexOf('--scan')
    const address = args[idx + 1]
    const chainId = args[idx + 2]
    if (!address || address.startsWith('--')) {
      console.error('Usage: evmaddressbook --scan <address> [chainId]')
      process.exitCode = 1
      return true
    }
    return runScan(address, chainId && !chainId.startsWith('--') ? chainId : null, book)
  }

  if (args.includes('--abi')) {
    const idx = args.indexOf('--abi')
    const address = args[idx + 1]
    const chainId = args[idx + 2]
    if (!address || !chainId) {
      console.error('Usage: evmaddressbook --abi <address> <chainId>')
      process.exitCode = 1
      return true
    }
    const abiPath = path.join(getDataDir(), 'contracts', address, String(chainId), 'abi.json')
    if (!fs.existsSync(abiPath)) {
      console.error(`No ABI found for ${address} on chain ${chainId}`)
      process.exitCode = 1
      return true
    }
    console.log(fs.readFileSync(abiPath, 'utf-8'))
    return true
  }

  const knownFlags = ['--help', '-h', '--version', '-v', '--addresses', '--chains']
  const unknown = args.filter(a => !knownFlags.includes(a))
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown[0]}`)
    printUsage()
    process.exitCode = 1
    return true
  }

  return false
}

async function runRescan(book) {
  const addresses = loadAddresses(book)
  if (addresses.length === 0) {
    console.error('No addresses in address book')
    process.exitCode = 1
    return true
  }

  const results = {}
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i].address
    console.error(`\nRescan ${i + 1}/${addresses.length}: ${addr}`)
    const sender = (channel, data) => {
      if (channel === 'scan:progress') {
        const phase = data.phase === 'scanning' ? 'Scanning' : 'Discovering'
        console.error(`  ${phase} ${data.chainName} (${data.current}/${data.total})`)
      }
    }
    results[addr] = await scanAddress(addr, sender, null, book)
  }

  console.log(JSON.stringify(results, null, 2))
  return true
}

async function runScan(address, chainId, book) {
  const sender = (channel, data) => {
    if (channel === 'scan:progress') {
      const phase = data.phase === 'scanning' ? 'Scanning' : 'Discovering'
      console.error(`${phase} ${data.chainName} (${data.current}/${data.total})`)
    }
  }

  if (chainId) {
    const chains = loadChains()
    const chain = chains.find(c => String(c.chainid) === String(chainId))
    if (!chain) {
      console.error(`Unknown chain ID: ${chainId}`)
      process.exitCode = 1
      return true
    }
    if (chain.enabled === false) {
      console.error(`Chain ${chainId} (${chain.chainname}) is disabled`)
      process.exitCode = 1
      return true
    }
  }

  const result = await scanAddress(address, sender, chainId ? String(chainId) : null, book)
  console.log(JSON.stringify(result, null, 2))
  return true
}

function printUsage() {
  console.log(`Usage: evmaddressbook [options]

Options:
  --rescan                    Re-scan all addresses in the address book
  --scan <address> [chainId]  Scan address for chain activity and exit
  --abi <address> <chainId>   Print contract ABI as JSON and exit
  --addresses                 Print all addresses as JSON and exit
  --chains                    Print all chains as JSON and exit
  --list-books                Print all address book names as JSON and exit
  --book <name>               Operate on the named address book (default: Default)
  --version                   Print version and exit
  --help                      Show this help message and exit

Environment variables:
  EVMADDRESSBOOK_DATADIR    Override data directory
  ETHERSCAN_API_KEY         Override Etherscan API key
  EVMADDRESSBOOKDEBUG=1     Enable debug logging`)
}
