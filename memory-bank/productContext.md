# Product Context

## Problem Statement
Groups managing Bitcoin multisig wallets face coordination challenges:
- Sharing extended public keys securely among participants
- Verifying everyone is using the correct xpubs
- Generating and verifying addresses consistently
- Working with PSBTs across different wallet software

## Solution
A centralized web application that:
- Stores all participants' xpubs in one place
- Provides tools to generate and verify multisig addresses
- Helps validate PSBTs against known wallet configurations
- Ensures all participants work with the same key set

## User Experience Goals

### Primary Users
Groups of 2-10 people coordinating Bitcoin multisig wallets (friends, families, organizations)

### User Flows

#### 1. Initial Setup
1. Each participant generates their xpub from their hardware wallet
2. Group accesses the MultisigHelper app
3. Each participant adds their xpub with a label (e.g., "Alice's Ledger")
4. Group verifies all xpubs are correctly entered

#### 2. Creating a Multisig Wallet
1. Select m-of-n configuration (e.g., 2-of-3)
2. Choose which xpubs to include
3. Generate first receive address
4. Each participant verifies the address on their device
5. Save/export wallet descriptor

#### 3. Receiving Funds
1. Select wallet configuration
2. Generate address at next unused index
3. Verify address matches on all devices
4. Share address with sender

#### 4. Verifying a Transaction
1. Import PSBT
2. System verifies it matches a known configuration
3. Display transaction details
4. Participants can sign with their devices

## Design Principles
- **Transparency**: All operations should be visible and verifiable
- **Simplicity**: Clear, straightforward interface
- **Safety**: Prevent common mistakes in multisig coordination
- **No Private Keys**: Application never handles private keys, only xpubs
