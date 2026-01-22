# MultisigHelper - Project Brief

## Purpose
A web application to help groups coordinate Bitcoin multisig wallets by sharing extended public keys (xpubs) and working with PSBTs (Partially Signed Bitcoin Transactions).

## Core Requirements

### 1. XPub Management
- Store xpubs with labels on a central server
- CRUD operations: Add, view, edit labels, delete xpubs
- Sync across devices via backend database

### 2. Multisig Wallet Configuration
- Generate m-of-n multisig wallets from selected xpubs
- Support various configurations (2-of-3, 3-of-5, etc.)
- Generate and verify Bitcoin addresses
- Display wallet descriptors for import

### 3. Address Operations
- Generate receive addresses at specific derivation indices
- Verify addresses match expected multisig configuration
- Show full derivation paths (BIP84)

### 4. PSBT Support
- Import PSBTs (paste or file upload)
- Verify PSBTs match known multisig configurations
- Display transaction details (inputs, outputs, amounts)
- Export PSBTs for signing

## Technical Constraints
- Bitcoin mainnet only
- BIP84 (native segwit) derivation standard
- Backend deployed on Railway.app (hobby plan)
- No authentication initially (can add later)

## Success Criteria
- Users can add/manage xpubs with labels
- Users can create multisig wallet configurations
- Generated addresses are accurate and verifiable
- PSBTs can be imported and verified against configurations
- Application is accessible and easy to use
