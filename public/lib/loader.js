// Bitcoin Library Loader - loads ESM modules and exposes them as globals
// Uses @scure/bip32 which works natively with @noble/secp256k1

async function loadBitcoinLibraries() {
    try {
        console.log('Starting to load Bitcoin libraries...');
        
        // First import buffer for Node.js compatibility
        console.log('Loading buffer...');
        const bufferModule = await import('https://esm.sh/buffer@6.0.3');
        window.Buffer = bufferModule.Buffer;
        console.log('Buffer loaded successfully');

        // Now import Bitcoin libraries
        console.log('Loading bitcoinjs-lib...');
        const bitcoinModule = await import('https://esm.sh/bitcoinjs-lib@6.1.5');
        console.log('bitcoinjs-lib loaded successfully');

        // Import @scure/bip32 - works natively in browser, no WASM issues
        console.log('Loading @scure/bip32...');
        const bip32Module = await import('https://esm.sh/@scure/bip32@1.4.0');
        console.log('@scure/bip32 loaded successfully');
        
        // Create a BIP32 interface compatible with the app
        const HDKey = bip32Module.HDKey;
        
        // Helper to convert fingerprint (number or Uint8Array) to Buffer
        function fingerprintToBuffer(fp) {
            if (typeof fp === 'number') {
                // Convert 4-byte number to buffer (big-endian)
                const buf = Buffer.alloc(4);
                buf.writeUInt32BE(fp, 0);
                return buf;
            }
            return Buffer.from(fp);
        }
        
        // Helper to convert Uint8Array to Buffer safely
        function toBuffer(arr) {
            if (arr instanceof Uint8Array) {
                return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
            }
            return Buffer.from(arr);
        }
        
        // Create interface that mimics bip32 library
        const bip32Interface = {
            fromBase58: (xpub) => {
                const hdkey = HDKey.fromExtendedKey(xpub);
                return {
                    publicKey: toBuffer(hdkey.publicKey),
                    fingerprint: fingerprintToBuffer(hdkey.fingerprint),
                    derive: (index) => {
                        const child = hdkey.deriveChild(index);
                        return {
                            publicKey: toBuffer(child.publicKey),
                            derive: (index2) => {
                                const grandchild = child.deriveChild(index2);
                                return {
                                    publicKey: toBuffer(grandchild.publicKey)
                                };
                            }
                        };
                    }
                };
            }
        };
        
        // Create a mutable object with all bitcoin module exports plus bip32
        const bitcoin = {
            ...bitcoinModule,
            bip32: bip32Interface
        };
        
        window.bitcoinjs = bitcoin;
        window.BIP32Factory = () => bip32Interface;
        window.tinysecp256k1 = { loaded: true }; // Placeholder
        
        console.log('BIP32 interface created successfully');

        // Signal that libraries are loaded
        window.bitcoinLibrariesLoaded = true;
        console.log('All Bitcoin libraries loaded successfully!');

        // Dispatch event to notify app
        window.dispatchEvent(new Event('bitcoinLibrariesReady'));
        
    } catch (error) {
        console.error('Failed to load Bitcoin libraries:', error);
        console.error('Error details:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Start loading
loadBitcoinLibraries();
