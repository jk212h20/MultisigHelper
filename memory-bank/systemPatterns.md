# System Patterns

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Browser (Frontend)                │
│  ┌──────────────────────────────────────┐  │
│  │   HTML/CSS/JavaScript UI             │  │
│  │  - XPub Management                   │  │
│  │  - Multisig Configuration            │  │
│  │  - Address Generation (client-side)  │  │
│  │  - PSBT Verification (client-side)   │  │
│  └──────────────────────────────────────┘  │
│              ↓ HTTP/JSON ↑                  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      Railway.app Backend (Node.js)          │
│  ┌──────────────────────────────────────┐  │
│  │   Express API Server                 │  │
│  │  - CORS middleware                   │  │
│  │  - XPub CRUD routes                  │  │
│  │  - Static file serving               │  │
│  └──────────────────────────────────────┘  │
│              ↓          ↑                   │
│  ┌──────────────────────────────────────┐  │
│  │   SQLite Database                    │  │
│  │  - xpubs table                       │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Client-Side Bitcoin Operations
**Decision**: Perform all Bitcoin cryptographic operations in the browser

**Rationale**:
- No private keys on server (security)
- Reduces server load
- Works offline once xpubs are loaded
- Users can verify operations locally

**Implementation**:
- bitcoinjs-lib runs in browser
- Server only stores xpubs
- Address generation happens client-side

### 2. Simple REST API
**Decision**: Traditional REST endpoints vs GraphQL or WebSockets

**Rationale**:
- Simple use case doesn't need real-time updates
- Easy to understand and maintain
- Standard HTTP caching works well
- Minimal dependencies

### 3. SQLite Database
**Decision**: SQLite vs PostgreSQL

**Rationale**:
- Simple data model (one table initially)
- File-based, easy backup
- Zero configuration
- Railway.app supports it well
- Can migrate to PostgreSQL later if needed

### 4. No Framework Frontend
**Decision**: Vanilla JS vs React/Vue/Svelte

**Rationale**:
- Application is relatively simple
- Avoid build step complexity
- Faster initial load
- Easier to understand for contributors
- Can add framework later if needed

## Component Relationships

### Backend Components

```
server/index.js (entry point)
    ↓
    ├─→ database.js (DB initialization & operations)
    │       └─→ SQLite file (data.db)
    │
    └─→ routes/xpubs.js (API routes)
            ├─→ GET /api/xpubs
            ├─→ POST /api/xpubs
            ├─→ PUT /api/xpubs/:id
            └─→ DELETE /api/xpubs/:id
```

### Frontend Components

```
index.html
    ↓
    ├─→ styles.css (styling)
    │
    └─→ app.js (logic)
            ├─→ API Client (fetch xpubs from backend)
            ├─→ XPub Manager (add/edit/delete UI)
            ├─→ Multisig Builder (configure m-of-n)
            ├─→ Address Generator (derive addresses)
            └─→ PSBT Handler (import/verify PSBTs)
```

## Critical Implementation Paths

### Address Generation Flow
```
1. User selects m-of-n (e.g., 2-of-3)
2. User selects 3 xpubs from list
3. User enters derivation index (e.g., 0)
4. For each xpub:
   - Derive child key at m/84'/0'/0'/0/0
5. Sort public keys (BIP67)
6. Create P2WSH multisig script
7. Generate bc1q... address
8. Display address + derivation paths
```

### PSBT Verification Flow
```
1. User imports PSBT (base64 or hex)
2. Parse PSBT with bitcoinjs-lib
3. Extract input scripts
4. Compare against stored multisig configs
5. Display matching configuration
6. Show transaction details:
   - Inputs (addresses, amounts)
   - Outputs (addresses, amounts)
   - Fee
7. Allow export for signing
```

## Data Flow Patterns

### XPub Management
```
Add XPub:
Browser → POST /api/xpubs {label, xpub} → Server validates → SQLite insert → Return new record

List XPubs:
Browser → GET /api/xpubs → Server queries → SQLite select → Return array

Update Label:
Browser → PUT /api/xpubs/:id {label} → Server validates → SQLite update → Return updated record

Delete XPub:
Browser → DELETE /api/xpubs/:id → Server deletes → SQLite delete → Return success
```

### Address Generation (Client-Only)
```
1. Load xpubs from localStorage cache (or fetch from API)
2. User configures multisig
3. JavaScript derives addresses locally
4. Display results (no server communication)
```

## Error Handling Strategy

### Backend
- Validate xpub format before storing
- Return proper HTTP status codes (200, 201, 400, 404, 500)
- Log errors to console
- Return JSON error messages

### Frontend
- Validate user inputs before API calls
- Show user-friendly error messages
- Graceful degradation if API unavailable
- Validate Bitcoin addresses before display
