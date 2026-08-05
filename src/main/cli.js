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

// Write a string to stdout, resolving once it has been fully flushed.
//
// console.log()/process.stdout.write() are asynchronous when stdout is a pipe
// or file, and index.js calls process.exit() as soon as a CLI command returns.
// process.exit() terminates the process before large async writes drain,
// truncating the output at the pipe buffer boundary (~64KB). Resolving on the
// write callback (fired after the data reaches the OS) lets the caller return a
// promise so the exit waits for the flush to complete.
function writeStdout(str) {
  return new Promise((resolve) => process.stdout.write(str, () => resolve(true)))
}

// Pretty-print a value as JSON to stdout, flush-safe (see writeStdout).
function printJson(value) {
  return writeStdout(JSON.stringify(value, null, 2) + '\n')
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
    return writeStdout(usageText())
  }

  if (args.includes('--version') || args.includes('-v')) {
    return writeStdout('1.5.1\n')
  }

  if (book !== null && !bookExists(book)) {
    console.error(`Unknown address book: ${book}`)
    process.exitCode = 1
    return true
  }

  if (args.includes('--addresses')) {
    return printJson(loadAddresses(book))
  }

  if (args.includes('--chains')) {
    return printJson(loadChains())
  }

  if (args.includes('--list-books')) {
    return printJson(listBooks())
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
    return writeStdout(fs.readFileSync(abiPath, 'utf-8') + '\n')
  }

  const knownFlags = ['--help', '-h', '--version', '-v', '--addresses', '--chains']
  // Electron/Chromium runtime switches (--no-sandbox, --remote-debugging-port,
  // --inspect, ...) and positional paths reach process.argv when the app is
  // launched by tooling; they are not CLI commands and must not error.
  const isRuntimeSwitch = a => !a.startsWith('--') ||
    /^--(no-sandbox|disable-|enable-|remote-debugging|inspect|force-|log-|user-data-dir|ozone)/.test(a)
  const unknown = args.filter(a => !knownFlags.includes(a) && !isRuntimeSwitch(a))
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown[0]}`)
    process.exitCode = 1
    return writeStdout(usageText())
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

  await printJson(results)
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
  await printJson(result)
  return true
}

function usageText() {
  return `Usage: evmaddressbook [options]

Options:
  --rescan                    Re-scan all addresses in the address book
  --scan <address> [chainId]  Scan address for chain activity and exit
                              (chainId may be numeric or bitcoin|solana|tron;
                              EVM, Bitcoin, Solana, and Tron addresses supported)
  --abi <address> <chainId>   Print contract ABI as JSON and exit (EVM chains only)
  --addresses                 Print all addresses as JSON and exit
  --chains                    Print all chains as JSON and exit
  --list-books                Print all address book names as JSON and exit
  --book <name>               Operate on the named address book (default: Default)
  --version                   Print version and exit
  --help                      Show this help message and exit

Environment variables:
  EVMADDRESSBOOK_DATADIR    Override data directory
  ETHERSCAN_API_KEY         Override Etherscan API key
  ROUTESCAN_API_KEY         Override Routescan API key (optional fallback provider)
  TRONGRID_API_KEY          Override TronGrid API key (Tron scanning)
  EVMADDRESSBOOKDEBUG=1     Enable debug logging
`
}
