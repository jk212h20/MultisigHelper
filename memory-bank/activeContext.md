# Active Context

## Current Work Focus
The app is now fully deployed on Railway with PostgreSQL for persistent shared data storage.

## Recent Changes
- Added PostgreSQL database support for Railway deployment
- Fixed data sharing issue - xpubs and PSBTs now persist and are shared across all users
- Railway CLI used to add PostgreSQL database to the project
- Updated server/database.js to support both PostgreSQL (production) and SQLite (local dev)
- Added pg package to dependencies

## Next Steps
1. Initialize Node.js project with package.json
2. Create backend server with Express and SQLite
3. Implement xpub CRUD API endpoints
4. Build frontend UI for xpub management
5. Add multisig wallet configuration interface
6. Implement address generation using bitcoinjs-lib
7. Add PSBT import and verification features
8. Test all functionality
9. Deploy to Railway.app

## Active Decisions

### Technology Choices
- **Backend**: Node.js + Express + SQLite
  - Simple, proven stack
  - SQLite perfect for this use case
  - Easy deployment on Railway.app

- **Frontend**: Vanilla JavaScript + bitcoinjs-lib
  - No build step needed
  - Direct Bitcoin operations in browser
  - Keep it simple initially

- **Deployment**: Railway.app
  - User has hobby plan
  - Good for Node.js apps
  - Simple deployment process

### Bitcoin Implementation
- Using BIP84 for derivation paths
- P2WSH for multisig addresses
- Native segwit only (bc1...)
- Client-side address generation for security

## Important Patterns

### Security First
- Never store or transmit private keys
- All cryptographic operations in browser
- Validate xpub format before storage
- Clear separation: server stores data, client handles crypto

### User Experience
- Simple, clean interface
- Clear feedback on all operations
- Ability to verify addresses match hardware wallets
- Show full derivation paths for transparency

### Code Organization
```
/server        - Backend code
/public        - Frontend code (served by Express)
/memory-bank   - Project documentation
```

## Learnings & Project Insights

### Multisig Wallet Coordination
The main challenge groups face is ensuring everyone uses the same xpub set in the same order. This app solves that by:
- Central storage of xpubs
- Clear labeling
- Deterministic address generation
- Verification tools

### Bitcoin Libraries
- bitcoinjs-lib handles most Bitcoin operations
- bip32 for HD key derivation
- Need tiny-secp256k1 as peer dependency
- All can run in browser via CDN or bundling

### Railway.app Deployment
- Needs package.json with start script
- Automatically detects Node.js
- Provides PORT environment variable
- SQLite file persists in volume (need to configure)
