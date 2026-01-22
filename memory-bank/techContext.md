# Technical Context

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite (simple, file-based, perfect for Railway.app)
- **CORS**: Enabled for API access

### Frontend
- **Core**: HTML5, CSS3, Vanilla JavaScript
- **Bitcoin Library**: bitcoinjs-lib (address generation, PSBT handling)
- **HD Keys**: bip32 (derivation path handling)
- **UI Framework**: None initially (keep it simple)

### Deployment
- **Platform**: Railway.app (hobby plan)
- **Build**: Node.js buildpack
- **Environment**: Production

## Dependencies

### Backend (`server/package.json`)
```json
{
  "express": "^4.18.0",
  "cors": "^2.8.5",
  "better-sqlite3": "^9.0.0"
}
```

### Frontend (loaded via CDN or npm)
```json
{
  "bitcoinjs-lib": "^6.1.0",
  "bip32": "^4.0.0",
  "tiny-secp256k1": "^2.2.0"
}
```

## Bitcoin Standards

### BIP84 - Native SegWit (bc1...)
- **Purpose**: 84'
- **Coin Type**: 0' (Bitcoin mainnet)
- **Account**: 0' (default)
- **Change**: 0 (receive), 1 (change)
- **Index**: 0, 1, 2, ...

**Example Path**: m/84'/0'/0'/0/0

### Multisig Address Generation
- P2WSH (Pay-to-Witness-Script-Hash)
- Sorted public keys (BIP67)
- Native segwit addresses (bc1q...)

## Development Setup

### Prerequisites
- Node.js 18+ installed
- npm or yarn
- Git

### Local Development
```bash
npm install
npm run dev  # Runs server with nodemon
```

### Environment Variables (Railway)
- `PORT` - Provided by Railway
- `NODE_ENV=production`

## Database Schema

### xpubs table
```sql
CREATE TABLE xpubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  xpub TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## API Design

### REST Endpoints
- `GET /api/xpubs` - List all xpubs
- `POST /api/xpubs` - Add new xpub
- `PUT /api/xpubs/:id` - Update xpub label
- `DELETE /api/xpubs/:id` - Delete xpub

### Request/Response Format
All endpoints use JSON:
```json
{
  "id": 1,
  "label": "Alice's Ledger",
  "xpub": "xpub6C...",
  "created_at": "2026-01-22T10:00:00Z"
}
```

## Security Considerations
- No authentication initially (future enhancement)
- No private keys ever stored or transmitted
- CORS configured for production domain
- Input validation on xpub format
- SQL injection protection via parameterized queries
