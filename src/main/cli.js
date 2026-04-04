import { app } from 'electron'
import { loadAddresses, loadChains, loadSettings } from './data-store'
import { getDefaultDataDir } from './constants'

export function handleCli(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2)

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return true
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('1.0.1')
    return true
  }

  if (args.includes('--addresses')) {
    const addresses = loadAddresses()
    console.log(JSON.stringify(addresses, null, 2))
    return true
  }

  if (args.includes('--chains')) {
    const chains = loadChains()
    console.log(JSON.stringify(chains, null, 2))
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

function printUsage() {
  console.log(`Usage: evmaddressbook [options]

Options:
  --addresses    Print all addresses as JSON and exit
  --chains       Print all chains as JSON and exit
  --version      Print version and exit
  --help         Show this help message and exit

Environment variables:
  EVMADDRESSBOOK_DATADIR    Override data directory
  ETHERSCAN_API_KEY         Override Etherscan API key
  EVMADDRESSBOOKDEBUG=1     Enable debug logging`)
}
