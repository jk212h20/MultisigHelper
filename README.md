# MultisigHelper

A web application to help groups coordinate Bitcoin multisig wallets by sharing extended public keys (xpubs) and collaborating on PSBT (Partially Signed Bitcoin Transaction) signing.

## Features

### 🔑 XPub Management
- Store extended public keys with descriptive labels
- Share xpubs across your group
- Edit labels and manage keys centrally

### 🔧 Multisig Wallet Configuration
- Generate M-of-N multisig wallets (e.g., 2-of-3, 3-of-5)
- Create Bitcoin addresses from selected xpubs
- BIP84 native segwit (bc1...) addresses
- Display full derivation paths for verification
- Export wallet descriptors

### 🤝 PSBT Collaboration
- Upload PSBTs to share with your group
- Track signature progress (e.g., "2 of 3 signed")
- Download PSBTs to sign on hardware wallets
- Upload signed PSBTs to add signatures
- Automatic status updates when fully signed
- Add notes to transactions for context

### 📝 PSBT Verification
- Parse and verify PSBT format
- Display transaction details (inputs, outputs, fees)
- Verify multisig configurations

## Security

⚠️ **This tool NEVER stores or transmits private keys.** All cryptographic operations happen in your browser.

- Only extended public keys (xpubs) are stored on the server
- PSBTs are stored for coordination, but contain no private keys
- Address generation and verification happen client-side
- Always verify addresses on your hardware wallet before sending funds

## Quick Start

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd MultisigHelper

# Install dependencies
npm install

# Start the server
npm start
```

The application will be available at `http://localhost:3001`

### Development

```bash
# Run with auto-restart on file changes
npm run dev
```

## Deployment on Railway.app

1. Push your code to GitHub
2. Create a new project on Railway.app
3. Connect your GitHub repository
4. Railway will automatically detect Node.js and deploy
5. Your app will be live at `your-app.railway.app`

### Railway Configuration

The app automatically uses Railway's provided `PORT` environment variable. SQLite database persists in the deployment.

## Usage Guide

### 1. Add XPubs

Each participant should:
1. Export their xpub from their hardware wallet (BIP84/native segwit)
2. Add it to the app with a descriptive label (e.g., "Alice's Ledger")

### 2. Generate Multisig Addresses

1. Select M-of-N configuration (required signatures / total keys)
2. Choose which xpubs to include in the wallet
3. Enter an address index (start with 0)
4. Click "Generate Address"
5. **Verify the address on each participant's hardware wallet**

### 3. Coordinate PSBT Signing

#### Upload a PSBT
1. Create a transaction in your wallet software
2. Export as PSBT
3. Upload to MultisigHelper with a descriptive name
4. Add notes if needed (e.g., "Payment for office supplies")

#### Sign a PSBT
1. Find the PSBT in the collaboration list
2. Click "Download" to get the current PSBT
3. Sign on your hardware wallet
4. Click "Add Signature" and paste the signed PSBT
5. System automatically updates signature count

#### When Fully Signed
1. Status changes to "✅ Ready"
2. Download the final PSBT
3. Broadcast using your preferred wallet or block explorer

## API Endpoints

### XPubs
- `GET /api/xpubs` - List all xpubs
- `POST /api/xpubs` - Add new xpub
- `PUT /api/xpubs/:id` - Update xpub label
- `DELETE /api/xpubs/:id` - Delete xpub

### PSBTs
- `GET /api/psbts` - List all PSBTs
- `POST /api/psbts` - Upload new PSBT
- `PUT /api/psbts/:id` - Update PSBT with new signatures
- `PATCH /api/psbts/:id/notes` - Update PSBT notes
- `DELETE /api/psbts/:id` - Delete PSBT

## Technology Stack

- **Backend**: Node.js, Express, SQLite
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Bitcoin**: bitcoinjs-lib (address generation, PSBT handling)
- **Deployment**: Railway.app

## Project Structure

```
MultisigHelper/
├── server/
│   ├── index.js           # Express server
│   ├── database.js        # SQLite operations
│   ├── data.db            # SQLite database
│   └── routes/
│       ├── xpubs.js       # XPub API endpoints
│       └── psbts.js       # PSBT API endpoints
├── public/
│   ├── index.html         # Main UI
│   ├── styles.css         # Styling
│   └── app.js             # Frontend logic
├── memory-bank/           # Project documentation
├── package.json
└── README.md
```

## Bitcoin Standards

- **BIP84**: Native segwit derivation (m/84'/0'/0'/0/index)
- **BIP67**: Sorted public keys for multisig
- **P2WSH**: Pay-to-Witness-Script-Hash for multisig addresses
- **PSBT**: BIP174 Partially Signed Bitcoin Transactions

## Future Enhancements

- [ ] User authentication for private groups
- [ ] Email/webhook notifications for new PSBTs/signatures
- [ ] Blockchain integration for auto-broadcast
- [ ] QR code generation for mobile wallet transfer
- [ ] Support for testnet
- [ ] Export/import functionality for xpub sets
- [ ] Address book for frequently used recipients

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.

---

**⚠️ Remember**: Always verify addresses and transactions on your hardware wallet. Never enter private keys or seed phrases anywhere online.
