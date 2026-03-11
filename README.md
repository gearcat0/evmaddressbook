# EVM Address Book

A desktop application for managing EVM addresses and monitoring their on-chain activity across multiple chains.

## Features

- **Address Management** — Add, edit, and delete Ethereum addresses with descriptions
- **Multi-Chain Scanning** — Detect activity (transactions, internal transactions, token transfers) across all Etherscan-supported chains
- **Address Type Discovery** — Identify whether each address is an EOA, contract, transparent proxy, or Gnosis Safe, with detailed metadata (implementation address, Safe owners/threshold, contract creator, etc.)
- **Contract Storage** — ABI and source code saved locally for verified contracts
- **Chain Management** — View supported chains, edit RPC URLs, auto-fetch from chainlist.org
- **Chain Icons** — Visual chain identifiers with fallback letter icons
- **Dark Theme** — Purpose-built dark UI

## Tech Stack

- **Electron** — Desktop framework
- **React** — UI
- **electron-vite** — Build tooling
- **ethers.js** — ABI decoding for Safe/proxy resolution
- **Etherscan API v2** — Chain activity detection and contract metadata

## Getting Started

### Prerequisites

- Node.js 18+
- An Etherscan API key (free at [etherscan.io](https://etherscan.io/apis))

### Install & Run

```bash
npm install
npm run dev
```

### Build

```bash
npm run build     # compile only
npm run preview   # preview the compiled app
```

### Release Packaging

Build distributable packages with [electron-builder](https://www.electron.build/):

```bash
npm run dist:linux   # AppImage + deb
npm run dist:mac     # dmg + zip
npm run dist:win     # NSIS installer + portable exe
```

Output goes to `release/`. Each platform should be built on its native OS.

### Configuration

The Etherscan API key can be set in the Settings tab or via environment variable:

```bash
ETHERSCAN_API_KEY=your_key npm run dev
```

Other environment variables:

| Variable | Description |
|----------|-------------|
| `ETHERSCAN_API_KEY` | Etherscan API key |
| `EVMADDRESSBOOK_DATADIR` | Custom data directory path |
| `EVMADDRESSBOOKDEBUG=1` | Enable debug logging |

### CLI

```bash
# List saved addresses
npm run build && node out/main/index.js --addresses

# List chains
node out/main/index.js --chains
```

## Data Storage

Data is stored as JSON files in a platform-specific directory:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/evmaddressbook/` |
| Linux | `~/.local/evmaddressbook/` |
| Windows | `%APPDATA%\evmaddressbook\` |

Files:
- `addresses.json` — Saved addresses with chain activity and type info
- `chains.json` — Chain list from Etherscan
- `settings.json` — API key and data directory config
- `icons/chains/` — Downloaded chain icons
- `contracts/{address}/{chainId}/` — Stored ABIs and source code

## Project Structure

```
src/
├── main/                        # Electron main process
│   ├── index.js                 # App entry, window creation
│   ├── ipc-handlers.js          # IPC request handlers
│   ├── chain-scanner.js         # Two-phase chain scanning
│   ├── address-type-resolver.js # EOA/contract/proxy/Safe detection
│   ├── etherscan-client.js      # Rate-limited Etherscan API client
│   ├── icon-fetcher.js          # Chain icon downloader
│   ├── data-store.js            # JSON persistence with atomic writes
│   ├── constants.js             # IPC channels, URLs, defaults
│   └── cli.js                   # CLI interface
├── preload/
│   └── index.js                 # Context bridge for renderer
└── renderer/
    ├── App.jsx                  # Tab-based layout
    ├── main.jsx                 # React entry point
    ├── logo.svg                 # App logo
    ├── components/
    │   ├── TabBar.jsx           # Navigation tabs
    │   ├── ChainIcon.jsx        # Chain icon with fallback
    │   ├── addresses/           # Address list, rows, badges, forms
    │   ├── chains/              # Chain table with editable RPC URLs
    │   └── settings/            # API key and data dir config
    ├── hooks/                   # useAddresses, useChains, useSettings, useSortFilter
    └── styles/index.css         # Dark theme
```

## Address Type Discovery

When scanning, each address on each active chain is classified:

| Type | Details Stored |
|------|---------------|
| **EOA** | `addressType: "eoa"` |
| **Contract** | Contract name, creator, creation tx hash |
| **TransparentUpgradeableProxy** | Implementation address (via EIP-1967 slot) |
| **GnosisSafeProxy** | Version, owners list, threshold |

## License

ISC
