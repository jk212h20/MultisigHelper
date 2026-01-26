// API Base URL
const API_BASE = window.location.origin;

// Session Management
let currentSessionId = localStorage.getItem('multisig_session') || '0';

// Get session ID for API calls
function getSessionId() {
    return currentSessionId;
}

// Set session ID
function setSessionId(sessionId) {
    currentSessionId = sessionId || '0';
    localStorage.setItem('multisig_session', currentSessionId);
    updateSessionUI();
    // Reload all data with new session
    reloadAllData();
}

// Update session UI
function updateSessionUI() {
    const sessionBar = document.getElementById('session-bar');
    const sessionLabel = document.getElementById('session-label');
    const sessionIcon = document.querySelector('.session-icon');
    const sessionInput = document.getElementById('session-input');
    const setBtn = document.getElementById('session-set-btn');
    const clearBtn = document.getElementById('session-clear-btn');
    
    if (currentSessionId === '0') {
        sessionBar.classList.remove('private');
        sessionIcon.textContent = '🔓';
        sessionLabel.textContent = 'Public Session';
        sessionInput.value = '';
        setBtn.style.display = 'inline-block';
        clearBtn.style.display = 'none';
    } else {
        sessionBar.classList.add('private');
        sessionIcon.textContent = '🔒';
        sessionLabel.textContent = `Private: ${currentSessionId}`;
        sessionInput.value = currentSessionId;
        setBtn.style.display = 'none';
        clearBtn.style.display = 'inline-block';
    }
}

// Reload all data (after session change)
async function reloadAllData() {
    // Clear selection state
    selectedXpubIds.clear();
    await loadXpubs();
    await loadPsbts();
    await loadDescriptors();
}

// Helper function to add session header to fetch options
function withSession(options = {}) {
    return {
        ...options,
        headers: {
            ...options.headers,
            'X-Session-Id': getSessionId()
        }
    };
}

// Bitcoin library reference
let bitcoin, BIP32;
let librariesInitialized = false;

// Initialize Bitcoin libraries (loaded from ESM loader)
function initializeBitcoinLibraries() {
    try {
        // Check if libraries are loaded from ESM loader
        if (!window.bitcoinjs) {
            console.log('Waiting for Bitcoin libraries to load...');
            return false;
        }
        
        bitcoin = window.bitcoinjs;

        // Initialize BIP32 with ecc
        if (window.tinysecp256k1 && window.BIP32Factory) {
            const ecc = window.tinysecp256k1;
            BIP32 = window.BIP32Factory(ecc);
            bitcoin.bip32 = BIP32;
        }
        
        librariesInitialized = true;
        console.log('Bitcoin libraries initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize Bitcoin libraries:', error);
        return false;
    }
}

// Wait for Bitcoin libraries to be ready
function waitForBitcoinLibraries() {
    return new Promise((resolve) => {
        if (window.bitcoinLibrariesLoaded) {
            resolve(initializeBitcoinLibraries());
        } else {
            window.addEventListener('bitcoinLibrariesReady', () => {
                resolve(initializeBitcoinLibraries());
            });
            // Fallback timeout check
            setTimeout(() => {
                if (!librariesInitialized && window.bitcoinjs) {
                    resolve(initializeBitcoinLibraries());
                }
            }, 3000);
        }
    });
}

// Global state
let allXpubs = [];
let allPsbts = [];
let allDescriptors = [];
let expandedPsbtId = null; // Track which PSBT is expanded

// DOM Elements
const xpubLabelInput = document.getElementById('xpub-label');
const xpubInput = document.getElementById('xpub-input');
const addXpubBtn = document.getElementById('add-xpub-btn');
const xpubSelectionDiv = document.getElementById('xpub-selection');
const mValueInput = document.getElementById('m-value');
const nValueInput = document.getElementById('n-value');
const addressIndexInput = document.getElementById('address-index');
const generateAddressBtn = document.getElementById('generate-address-btn');
const addressOutput = document.getElementById('address-output');

// PSBT Collaboration Elements
const psbtNameInput = document.getElementById('psbt-name');
const psbtFileInput = document.getElementById('psbt-file');
const uploadPsbtBtn = document.getElementById('upload-psbt-btn');
const psbtUploadOutput = document.getElementById('psbt-upload-output');
const psbtListDiv = document.getElementById('psbt-list');

// Store uploaded file data
let uploadedPsbtData = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing...');
    
    // Load data immediately (doesn't need Bitcoin libraries)
    loadXpubs();
    loadPsbts();
    loadDescriptors();
    setupEventListeners();
    
    // Wait for Bitcoin libraries to load (async from ESM)
    await waitForBitcoinLibraries();
    
    // Re-render PSBTs now that Bitcoin libraries are loaded (for signer status)
    if (allPsbts.length > 0) {
        console.log('Re-rendering PSBTs with signer status...');
        displayPsbts();
    }
    
    // Generate QR in background when available
    setTimeout(() => {
        if (typeof QRCode !== 'undefined') {
            generateHeaderQRCode();
        }
    }, 100);
});

// Generate QR code in header
function generateHeaderQRCode() {
    const qrContainer = document.getElementById('header-qrcode');
    if (qrContainer && typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: window.location.origin,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}

// Event Listeners
function setupEventListeners() {
    addXpubBtn.addEventListener('click', addXpub);
    generateAddressBtn.addEventListener('click', generateAddress);
    uploadPsbtBtn.addEventListener('click', uploadPsbt);
    
    // Handle .psbt file upload
    if (psbtFileInput) {
        psbtFileInput.addEventListener('change', handlePsbtFileUpload);
    }
    
    // Constrain M value to valid range (1 to N)
    mValueInput.addEventListener('change', () => {
        const n = parseInt(nValueInput.value) || 0;
        let m = parseInt(mValueInput.value) || 1;
        
        // Clamp M between 1 and N
        if (m < 1) m = 1;
        if (n > 0 && m > n) m = n;
        
        mValueInput.value = m;
    });
    
    // Session controls
    const sessionInput = document.getElementById('session-input');
    const sessionSetBtn = document.getElementById('session-set-btn');
    const sessionClearBtn = document.getElementById('session-clear-btn');
    
    if (sessionSetBtn) {
        sessionSetBtn.addEventListener('click', () => {
            const newSession = sessionInput.value.trim();
            if (newSession) {
                setSessionId(newSession);
                showToast('Session Changed', `Now using private session: ${newSession}`, 'success');
            }
        });
    }
    
    if (sessionClearBtn) {
        sessionClearBtn.addEventListener('click', () => {
            setSessionId('0');
            showToast('Session Cleared', 'Switched to public session', 'info');
        });
    }
    
    // Allow Enter key to set session
    if (sessionInput) {
        sessionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const newSession = sessionInput.value.trim();
                if (newSession) {
                    setSessionId(newSession);
                    showToast('Session Changed', `Now using private session: ${newSession}`, 'success');
                }
            }
        });
    }
    
    // Initialize session UI on load
    updateSessionUI();
}

// Handle .psbt file upload
function handlePsbtFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        uploadedPsbtData = null;
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const content = e.target.result;
        
        // Check if content is binary (raw PSBT) or text (base64/hex)
        if (content instanceof ArrayBuffer) {
            // Convert binary to base64
            const bytes = new Uint8Array(content);
            const binary = String.fromCharCode.apply(null, bytes);
            uploadedPsbtData = btoa(binary);
        } else {
            // Text content - use as-is
            uploadedPsbtData = content.trim();
        }
        
        // Auto-fill name from filename if empty
        if (!psbtNameInput.value.trim()) {
            const filename = file.name.replace(/\.psbt$/i, '').replace(/[_-]/g, ' ');
            psbtNameInput.value = filename;
        }
        
        // Auto-validate the uploaded PSBT
        autoValidateUploadedPsbt(file.name);
    };
    
    reader.onerror = function() {
        uploadedPsbtData = null;
        psbtUploadOutput.className = 'output error';
        psbtUploadOutput.innerHTML = '<p class="error-message">Error reading file</p>';
    };
    
    // Try to read as binary first for raw PSBT files
    if (file.name.endsWith('.psbt')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

// XPub Management Functions
async function loadXpubs() {
    console.log('Loading xpubs from:', `${API_BASE}/api/xpubs`);
    try {
        const response = await fetch(`${API_BASE}/api/xpubs`, withSession());
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error:', errorText);
            throw new Error(`Failed to load xpubs: ${response.status}`);
        }
        
        allXpubs = await response.json();
        console.log('Loaded xpubs:', allXpubs.length);
        updateXpubSelection();
        updateAutoLabelPlaceholder(); // Update auto-generated label hint
    } catch (error) {
        console.error('Error in loadXpubs:', error);
        xpubSelectionDiv.innerHTML = `<p class="error-message">Error loading xpubs: ${error.message}</p>`;
    }
}

// Track selected xpub IDs
let selectedXpubIds = new Set();

function updateXpubSelection() {
    if (allXpubs.length === 0) {
        xpubSelectionDiv.innerHTML = '<p class="xpub-empty-message">No keys added yet. Add an xpub above to get started.</p>';
        updateMNValues(); // Update button state
        return;
    }

    // Abbreviate xpub: first 8 chars + ... + last 8 chars
    const abbreviateXpub = (xpub) => {
        if (xpub.length <= 20) return xpub;
        return xpub.substring(0, 8) + '...' + xpub.substring(xpub.length - 8);
    };

    xpubSelectionDiv.innerHTML = `
        <div class="xpub-cards-grid">
            ${allXpubs.map(xpub => {
                const isSelected = selectedXpubIds.has(xpub.id);
                return `
                    <div class="xpub-card ${isSelected ? 'selected' : ''}" 
                         data-xpub-id="${xpub.id}" 
                         data-xpub="${escapeHtml(xpub.xpub)}"
                         onclick="toggleXpubCard(${xpub.id})">
                        <div class="xpub-card-label">${escapeHtml(xpub.label)}</div>
                        <div class="xpub-card-key">${abbreviateXpub(xpub.xpub)}</div>
                        <div class="xpub-card-actions">
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); editXpub(${xpub.id})">Edit</button>
                            <button class="btn btn-danger" onclick="event.stopPropagation(); deleteXpub(${xpub.id})">Delete</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    // Update button state
    updateMNValues();
}

// Toggle xpub card selection and update N value
function toggleXpubCard(id) {
    if (selectedXpubIds.has(id)) {
        selectedXpubIds.delete(id);
    } else {
        selectedXpubIds.add(id);
    }
    
    // Update card visual state
    const card = document.querySelector(`.xpub-card[data-xpub-id="${id}"]`);
    if (card) {
        card.classList.toggle('selected', selectedXpubIds.has(id));
    }
    
    // Update M/N values based on selection
    updateMNValues();
}

// Update M and N values based on selected keys
function updateMNValues() {
    const selectedCount = selectedXpubIds.size;
    
    // N is always pinned to selection count
    nValueInput.value = selectedCount;
    
    // Update M's max to match N
    mValueInput.max = selectedCount > 0 ? selectedCount : 1;
    mValueInput.min = selectedCount > 0 ? 1 : 1;
    
    // Ensure M is within valid range
    const currentM = parseInt(mValueInput.value) || 1;
    if (selectedCount > 0) {
        if (currentM > selectedCount) {
            mValueInput.value = selectedCount;
        } else if (currentM < 1) {
            mValueInput.value = 1;
        }
    } else {
        mValueInput.value = 1;
    }
    
    // Enable/disable generate button based on selection
    if (generateAddressBtn) {
        if (selectedCount >= 2) {
            generateAddressBtn.disabled = false;
            generateAddressBtn.classList.remove('btn-disabled');
        } else {
            generateAddressBtn.disabled = true;
            generateAddressBtn.classList.add('btn-disabled');
        }
    }
}

// Get selected xpubs for multisig generation
function getSelectedXpubs() {
    return allXpubs
        .filter(x => selectedXpubIds.has(x.id))
        .map(x => x.xpub);
}

async function addXpub() {
    let label = xpubLabelInput.value.trim();
    const xpub = xpubInput.value.trim();

    // Auto-generate label if empty
    if (!label) {
        label = `Key #${allXpubs.length + 1}`;
    }

    if (!xpub) {
        showToast('Missing Input', 'Please enter an xpub', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/xpubs`, withSession({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, xpub })
        }));

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add xpub');
        }

        xpubLabelInput.value = '';
        xpubInput.value = '';
        await loadXpubs();
        showToast('XPub Added', `"${label}" has been added successfully`, 'success');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function editXpub(id) {
    const xpub = allXpubs.find(x => x.id === id);
    if (!xpub) return;

    const newLabel = prompt('Enter new label:', xpub.label);
    if (!newLabel || newLabel === xpub.label) return;

    try {
        const response = await fetch(`${API_BASE}/api/xpubs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newLabel })
        });

        if (!response.ok) throw new Error('Failed to update xpub');

        await loadXpubs();
        showToast('XPub Updated', `Label changed to "${newLabel}"`, 'success');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function deleteXpub(id) {
    if (!confirm('Are you sure you want to delete this xpub?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/xpubs/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete xpub');

        await loadXpubs();
        showToast('XPub Deleted', 'Key has been removed', 'success');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Multisig Address Generation
function generateAddress() {
    try {
        // Initialize libraries if not done yet
        if (!bitcoin) {
            initializeBitcoinLibraries();
        }
        
        if (!bitcoin) {
            throw new Error('Bitcoin libraries not loaded. Please refresh the page.');
        }
        
        // Get selected xpubs from card selection
        const selectedXpubs = getSelectedXpubs();

        const m = parseInt(mValueInput.value);
        const n = parseInt(nValueInput.value);
        const index = addressIndexInput ? parseInt(addressIndexInput.value) : 0;

        // Validation
        if (selectedXpubs.length !== n) {
            throw new Error(`Please select exactly ${n} xpubs`);
        }

        if (m > n) {
            throw new Error('M cannot be greater than N');
        }

        if (m < 1 || n < 2) {
            throw new Error('Invalid M-of-N values');
        }

        // Derive child public keys at the specified path
        // BIP84: m/84'/0'/0'/0/index
        const derivationPath = `0/0/${index}`; // Relative path from account level
        const pubkeys = selectedXpubs.map(xpubStr => {
            try {
                const node = bitcoin.bip32.fromBase58(xpubStr);
                // Derive the child key
                const child = node.derive(0).derive(index);
                return child.publicKey;
            } catch (e) {
                throw new Error(`Invalid xpub format: ${e.message}`);
            }
        });

        // Sort pubkeys (BIP67)
        const sortedPubkeys = pubkeys.slice().sort(Buffer.compare);

        // Create P2WSH multisig
        const p2ms = bitcoin.payments.p2ms({
            m: m,
            pubkeys: sortedPubkeys,
            network: bitcoin.networks.bitcoin
        });

        const p2wsh = bitcoin.payments.p2wsh({
            redeem: p2ms,
            network: bitcoin.networks.bitcoin
        });

        // Display results
        displayAddressResult(p2wsh.address, m, n, index, selectedXpubs, sortedPubkeys);

    } catch (error) {
        addressOutput.className = 'output error';
        addressOutput.innerHTML = `<p class="error-message">Error: ${escapeHtml(error.message)}</p>`;
    }
}

function displayAddressResult(address, m, n, index, xpubs, pubkeys) {
    // Generate wallet descriptor with fingerprints
    const descriptor = generateWalletDescriptor(m, xpubs);
    const descriptorQRId = 'descriptor-qr-' + Date.now();
    const addressQRId = 'address-qr-' + Date.now();
    
    // Generate gradient from descriptor for visual identification
    const gradient = generateGradientFromHash(descriptor);
    const fingerprint = generatePsbtFingerprint(descriptor);
    
    // Generate first receive address (index 0)
    const firstAddress = generateMultisigAddress(m, xpubs, 0);
    
    // Get key labels from stored xpubs
    const keyLabels = xpubs.map((xpubStr, i) => {
        const stored = allXpubs.find(x => x.xpub === xpubStr);
        return stored ? stored.label : `Key ${i + 1}`;
    });
    
    addressOutput.className = 'output';
    addressOutput.innerHTML = `
        <div class="descriptor-card" style="background: ${gradient.gradient}; border-radius: 12px; padding: 20px; margin-bottom: 15px;">
            <div class="descriptor-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div>
                    <h3 style="margin: 0; color: #333;">📜 Wallet Descriptor</h3>
                    <div style="font-size: 14px; color: #666; margin-top: 4px;">
                        <span style="font-weight: 600;">${m}-of-${n} Multisig</span>
                        <span style="margin: 0 8px;">•</span>
                        <span>Native Segwit (P2WSH)</span>
                    </div>
                </div>
                <span class="psbt-fingerprint" style="background: rgba(0,0,0,0.1); padding: 4px 10px; border-radius: 12px; font-family: monospace; font-size: 12px;">${fingerprint}</span>
            </div>
            
            <div style="background: rgba(255,255,255,0.8); border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Descriptor:</div>
                <div class="descriptor-value" id="descriptor-text" style="font-family: monospace; font-size: 11px; word-break: break-all; line-height: 1.5; color: #333;">${escapeHtml(descriptor)}</div>
            </div>
            
            <div style="background: rgba(255,255,255,0.8); border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">🔑 Included Keys (${n}):</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${keyLabels.map(label => `
                        <span style="background: #e9ecef; padding: 4px 10px; border-radius: 12px; font-size: 12px; color: #495057;">
                            ${escapeHtml(label)}
                        </span>
                    `).join('')}
                </div>
            </div>
            
            ${firstAddress ? `
            <div style="background: rgba(46, 125, 50, 0.1); border: 1px solid rgba(46, 125, 50, 0.3); border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 12px; color: #2e7d32; margin-bottom: 8px; font-weight: 600;">💰 First Receive Address (Index 0):</div>
                <div style="font-family: monospace; font-size: 13px; word-break: break-all; color: #1b5e20; background: rgba(255,255,255,0.5); padding: 10px; border-radius: 4px;">${firstAddress}</div>
                <div style="margin-top: 10px; display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${firstAddress}', 'Address')">📋 Copy Address</button>
                    <button class="btn btn-secondary btn-sm" onclick="toggleAddressQR('${addressQRId}', '${firstAddress}')">📱 Address QR</button>
                </div>
                <div id="${addressQRId}" style="display: none; margin-top: 15px; text-align: center; background: white; padding: 15px; border-radius: 8px;"></div>
            </div>
            ` : ''}
            
            <div class="descriptor-actions" style="display: flex; flex-wrap: wrap; gap: 8px;">
                <button class="btn btn-primary" onclick="copyDescriptor()">📋 Copy Descriptor</button>
                <button class="btn btn-info" onclick="downloadDescriptor()">📥 Download</button>
                <button class="btn btn-success" onclick="saveDescriptorToServer()">💾 Save to Server</button>
                <button class="btn btn-secondary" onclick="toggleDescriptorQR('${descriptorQRId}')">📱 QR Code</button>
            </div>
            
            <div id="${descriptorQRId}" class="descriptor-qr" style="display: none; margin-top: 15px; text-align: center; background: white; padding: 20px; border-radius: 8px;"></div>
        </div>
        
        <p style="color: #666; font-size: 14px; background: #f8f9fa; padding: 12px; border-radius: 8px;">
            ℹ️ <strong>Next step:</strong> Import this descriptor into Sparrow Wallet, Bitcoin Core, or other compatible software to manage your multisig wallet. Send funds to the address above to fund the wallet.
        </p>
    `;
    
    // Store descriptor and address for later use
    window.currentDescriptor = descriptor;
    window.currentDescriptorQRId = descriptorQRId;
    window.currentDescriptorM = m;
    window.currentDescriptorN = n;
    window.currentDescriptorXpubs = xpubs;
    window.currentFirstAddress = firstAddress;
}

// Generate multisig address for a specific index
function generateMultisigAddress(m, xpubs, index) {
    try {
        const pubkeys = xpubs.map(xpubStr => {
            const node = bitcoin.bip32.fromBase58(xpubStr);
            const child = node.derive(0).derive(index);
            return child.publicKey;
        });
        
        const sortedPubkeys = pubkeys.slice().sort(Buffer.compare);
        
        const p2ms = bitcoin.payments.p2ms({
            m: m,
            pubkeys: sortedPubkeys,
            network: bitcoin.networks.bitcoin
        });
        
        const p2wsh = bitcoin.payments.p2wsh({
            redeem: p2ms,
            network: bitcoin.networks.bitcoin
        });
        
        return p2wsh.address;
    } catch (e) {
        console.error('Error generating address:', e);
        return null;
    }
}

// Download descriptor as a file
function downloadDescriptor() {
    const descriptor = window.currentDescriptor;
    const m = window.currentDescriptorM;
    const n = window.currentDescriptorN;
    const firstAddress = window.currentFirstAddress;
    
    // Create a nicely formatted file
    const content = `# Multisig Wallet Descriptor
# Configuration: ${m}-of-${n}
# Type: Native Segwit (P2WSH)
# Generated: ${new Date().toISOString()}

# Wallet Descriptor (import this into Sparrow Wallet or Bitcoin Core):
${descriptor}

# First Receive Address (Index 0):
${firstAddress || 'N/A'}

# Instructions:
# 1. Open Sparrow Wallet (or similar software)
# 2. Create New Wallet → Import External → Descriptor
# 3. Paste the descriptor above
# 4. The wallet will generate addresses matching this multisig configuration
`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multisig_${m}of${n}_descriptor.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Downloaded', 'Descriptor file saved', 'success');
}

// Copy any text to clipboard with custom message
function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied', `${label} copied to clipboard`, 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied', `${label} copied to clipboard`, 'success');
    });
}

// Toggle address QR code
function toggleAddressQR(qrId, address) {
    const qrContainer = document.getElementById(qrId);
    if (qrContainer.style.display === 'none') {
        qrContainer.style.display = 'block';
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: address,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        qrContainer.style.display = 'none';
    }
}

// Generate wallet descriptor with fingerprints (no checksum - Sparrow calculates it)
// Uses BIP48 derivation path for multisig: m/48'/0'/0'/2' where 2' = P2WSH script type
function generateWalletDescriptor(m, xpubs) {
    try {
        const descriptorParts = xpubs.map(xpubStr => {
            const node = bitcoin.bip32.fromBase58(xpubStr);
            const fingerprint = node.fingerprint.toString('hex');
            // BIP48: 48h = multisig, 0h = mainnet, 0h = account, 2h = P2WSH script type
            return `[${fingerprint}/48h/0h/0h/2h]${xpubStr}/0/*`;
        });
        
        // Return without checksum - wallet software will calculate the correct one
        return `wsh(sortedmulti(${m},${descriptorParts.join(',')}))`;
    } catch (e) {
        return `wsh(sortedmulti(${m},${xpubs.map(x => x + '/0/*').join(',')}))`;
    }
}

// Copy descriptor to clipboard
function copyDescriptor() {
    const text = window.currentDescriptor;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied', 'Descriptor copied to clipboard', 'success');
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied', 'Descriptor copied to clipboard', 'success');
    });
}

// Toggle descriptor QR code
function toggleDescriptorQR(qrId) {
    const qrContainer = document.getElementById(qrId);
    if (qrContainer.style.display === 'none') {
        qrContainer.style.display = 'block';
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: window.currentDescriptor,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        qrContainer.style.display = 'none';
    }
}

// Parse PSBT and return details
function parsePsbtDetails(psbt) {
    // Get inputs from PSBT data directly
    const inputs = psbt.data.inputs.map((input, i) => {
        // Get txid/vout from global tx
        const globalInput = psbt.txInputs[i];
        let txid = 'Unknown';
        let vout = 0;
        if (globalInput) {
            txid = Buffer.from(globalInput.hash).reverse().toString('hex');
            vout = globalInput.index;
        }
        return {
            txid: txid,
            vout: vout,
            value: input.witnessUtxo ? input.witnessUtxo.value : 'Unknown'
        };
    });

    // Get outputs from global tx
    const outputs = psbt.txOutputs.map((output, i) => {
        let address = 'Unknown';
        try {
            address = bitcoin.address.fromOutputScript(output.script, bitcoin.networks.bitcoin);
        } catch (e) {
            // Could not decode address
        }
        return {
            address,
            value: output.value
        };
    });

    const totalInput = inputs.reduce((sum, inp) => {
        return sum + (typeof inp.value === 'number' ? inp.value : 0);
    }, 0);

    const totalOutput = outputs.reduce((sum, out) => sum + out.value, 0);
    const fee = totalInput - totalOutput;
    
    // Count signatures and determine M-of-N
    const sigInfo = getSignatureInfo(psbt);

    return { inputs, outputs, totalInput, totalOutput, fee, sigInfo };
}

// Get signature information from PSBT
function getSignatureInfo(psbt) {
    let maxSigs = 0;
    let mRequired = 2; // Default
    let nTotal = 2;    // Default
    let signerStatus = []; // Track which keys have signed
    
    psbt.data.inputs.forEach((input, inputIndex) => {
        // Count partial signatures
        if (input.partialSig && input.partialSig.length > 0) {
            maxSigs = Math.max(maxSigs, input.partialSig.length);
        }
        
        // Try to extract M-of-N and pubkeys from witness script
        if (input.witnessScript) {
            try {
                const decompiled = bitcoin.script.decompile(input.witnessScript);
                
                if (decompiled && decompiled.length >= 4) {
                    // Handle both raw opcode numbers (OP_1=81 to OP_16=96) and encoded numbers
                    const decodeScriptNumber = (val) => {
                        if (typeof val === 'number') {
                            // Raw opcode: OP_1 (81) through OP_16 (96) encode 1-16
                            if (val >= 81 && val <= 96) return val - 80;
                            // OP_0 = 0
                            if (val === 0) return 0;
                            return val;
                        } else if (val && val.length !== undefined) {
                            // Buffer/Uint8Array - use standard decoding
                            try {
                                return bitcoin.script.number.decode(val);
                            } catch (e) {
                                return null;
                            }
                        }
                        return null;
                    };
                    
                    const m = decodeScriptNumber(decompiled[0]);
                    const n = decodeScriptNumber(decompiled[decompiled.length - 2]);
                    
                    if (m > 0 && n > 0) {
                        mRequired = m;
                        nTotal = n;
                        
                        // Extract pubkeys from witness script (only on first input to avoid duplicates)
                        if (inputIndex === 0) {
                            // Pubkeys are between M and N in the decompiled script
                            const pubkeys = [];
                            for (let i = 1; i < decompiled.length - 2; i++) {
                                const element = decompiled[i];
                                // Accept any array-like object with pubkey length
                                const isArrayLike = element && typeof element === 'object' && typeof element.length === 'number';
                                const isPubkey = isArrayLike && (element.length === 33 || element.length === 65);
                                if (isPubkey) {
                                    pubkeys.push(Buffer.from(element));
                                }
                            }
                            
                            // Get signed pubkey hashes
                            const signedPubkeys = new Set();
                            if (input.partialSig) {
                                input.partialSig.forEach(sig => {
                                    signedPubkeys.add(sig.pubkey.toString('hex'));
                                });
                            }
                            
                            // Build signer status for each pubkey
                            signerStatus = pubkeys.map(pubkey => {
                                const pubkeyHex = pubkey.toString('hex');
                                const hasSigned = signedPubkeys.has(pubkeyHex);
                                const matchedXpub = matchPubkeyToXpub(pubkey);
                                
                                return {
                                    pubkey: pubkeyHex,
                                    pubkeyShort: pubkeyHex.substring(0, 8) + '...' + pubkeyHex.substring(pubkeyHex.length - 8),
                                    hasSigned: hasSigned,
                                    label: matchedXpub ? matchedXpub.label : null,
                                    xpubId: matchedXpub ? matchedXpub.id : null
                                };
                            });
                            console.log('SignerStatus built:', signerStatus.length, 'signers:', signerStatus.map(s => ({short: s.pubkeyShort, signed: s.hasSigned})));
                        }
                    }
                }
            } catch (e) {
                // Couldn't parse witness script
            }
        }
    });
    
    const percentage = mRequired > 0 ? Math.min(100, (maxSigs / mRequired) * 100) : 0;
    
    return {
        signatures: maxSigs,
        required: mRequired,
        total: nTotal,
        percentage: percentage,
        isComplete: maxSigs >= mRequired,
        signerStatus: signerStatus
    };
}

// Match a pubkey from PSBT to stored xpubs
function matchPubkeyToXpub(targetPubkey) {
    if (!bitcoin || !allXpubs || allXpubs.length === 0) return null;
    
    const targetPubkeyHex = targetPubkey.toString('hex');
    
    // Try to derive pubkeys from each stored xpub and match
    for (const xpubData of allXpubs) {
        try {
            const node = bitcoin.bip32.fromBase58(xpubData.xpub);
            
            // Try common derivation paths (0/0, 0/1, 0/2, etc.) for receive addresses
            // and (1/0, 1/1, etc.) for change addresses
            for (let change = 0; change <= 1; change++) {
                for (let index = 0; index < 100; index++) {
                    try {
                        const child = node.derive(change).derive(index);
                        const derivedPubkeyHex = child.publicKey.toString('hex');
                        
                        if (derivedPubkeyHex === targetPubkeyHex) {
                            return {
                                id: xpubData.id,
                                label: xpubData.label,
                                xpub: xpubData.xpub,
                                derivationPath: `${change}/${index}`
                            };
                        }
                    } catch (e) {
                        // Continue trying other indices
                    }
                }
            }
        } catch (e) {
            // Invalid xpub, skip
            continue;
        }
    }
    
    return null;
}

// PSBT Collaboration Functions
async function loadPsbts() {
    try {
        const response = await fetch(`${API_BASE}/api/psbts`, withSession());
        if (!response.ok) throw new Error('Failed to load PSBTs');
        
        allPsbts = await response.json();
        displayPsbts();
        
        // Initialize confirmation tracking for any broadcast PSBTs
        initializeConfirmationTracking();
    } catch (error) {
        psbtListDiv.innerHTML = `<p class="error-message">Error loading PSBTs: ${error.message}</p>`;
    }
}

function displayPsbts() {
    if (allPsbts.length === 0) {
        psbtListDiv.innerHTML = '<p class="info">No PSBTs uploaded yet. Upload your first PSBT above.</p>';
        return;
    }

    // Auto-expand the first (newest) PSBT
    if (expandedPsbtId === null && allPsbts.length > 0) {
        expandedPsbtId = allPsbts[0].id;
    }

    psbtListDiv.innerHTML = allPsbts.map((psbt, index) => {
        const progressPercent = (psbt.signatures_count / psbt.m_required) * 100;
        const isReady = psbt.status === 'ready';
        const isExpanded = expandedPsbtId === psbt.id;
        
        // Generate unique gradient and fingerprint
        const gradient = generateGradientFromHash(psbt.psbt_data);
        const fingerprint = generatePsbtFingerprint(psbt.psbt_data);
        const timestamp = formatTimestamp(psbt.created_at);
        
        // Get signer status - use database metadata as fallback
        let signerStatusHtml = '';
        let sigInfo = null;
        
        // Try to get detailed signer info from PSBT parsing
        if (bitcoin) {
            try {
                const parsedPsbt = bitcoin.Psbt.fromBase64(psbt.psbt_data);
                sigInfo = getSignatureInfo(parsedPsbt);
            } catch (e) {
                console.log('Error parsing PSBT for signer status:', e.message || e);
            }
        }
        
        // Build signer status HTML
        console.log('UI check for PSBT:', psbt.name, '- sigInfo:', sigInfo ? 'exists' : 'null', 'signerStatus length:', sigInfo?.signerStatus?.length);
        if (sigInfo && sigInfo.signerStatus && sigInfo.signerStatus.length > 0) {
            // Log each signer's details
            sigInfo.signerStatus.forEach((s, i) => {
                console.log(`  Signer ${i}: hasSigned=${s.hasSigned}, label="${s.label}", pubkeyShort="${s.pubkeyShort}"`);
            });
            // Detailed signer info available - show actual key names/pubkeys
            signerStatusHtml = `
                <div class="signer-status" style="margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 6px;">
                    <strong style="font-size: 12px; color: #555;">🔑 Signers:</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                        ${sigInfo.signerStatus.map(signer => `
                            <span class="signer-badge ${signer.hasSigned ? 'signed' : 'unsigned'}" 
                                  style="display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 12px; font-size: 11px; ${signer.hasSigned ? 'background: #d4edda; color: #155724;' : 'background: #fff3cd; color: #856404;'}">
                                ${signer.hasSigned ? '✅' : '⏳'}
                                ${signer.label ? escapeHtml(signer.label) : signer.pubkeyShort}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
            console.log('Generated signerStatusHtml length:', signerStatusHtml.length);
        } else {
            // Fallback: show generic signed/unsigned badges
            // Use sigInfo if parsing succeeded, otherwise use database metadata
            const signed = sigInfo ? sigInfo.signatures : (psbt.signatures_count || 0);
            const total = sigInfo ? sigInfo.total : (psbt.n_total || 2);
            const unsigned = Math.max(0, total - signed);
            
            if (total > 0) {
                signerStatusHtml = `
                    <div class="signer-status" style="margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 6px;">
                        <strong style="font-size: 12px; color: #555;">🔑 Signers (${total} keys):</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                            ${Array(signed).fill(0).map((_, i) => `
                                <span style="display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 12px; font-size: 11px; background: #d4edda; color: #155724;">
                                    ✅ Signed
                                </span>
                            `).join('')}
                            ${Array(unsigned).fill(0).map((_, i) => `
                                <span style="display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 12px; font-size: 11px; background: #fff3cd; color: #856404;">
                                    ⏳ Needs signature
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }
        
        return `
            <div class="psbt-item status-${psbt.status} ${isExpanded ? 'expanded' : ''}" 
                 data-psbt-id="${psbt.id}"
                 style="background: ${gradient.gradient};">
                <div class="psbt-header" onclick="togglePsbtCard(${psbt.id})">
                    <div class="psbt-header-left">
                        <span class="psbt-expand-icon">▶</span>
                        <div class="psbt-title">
                            <div class="psbt-name">
                                ${escapeHtml(psbt.name)}
                                <span class="psbt-fingerprint">${fingerprint}</span>
                            </div>
                            <div class="psbt-meta">
                                <span>${psbt.m_required}-of-${psbt.n_total} Multisig</span>
                                <span class="separator">•</span>
                                <span class="psbt-timestamp" title="${timestamp.exact}">
                                    <span class="psbt-timestamp-exact">${timestamp.exact}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="psbt-header-right">
                        <span class="psbt-sig-badge ${isReady ? 'complete' : 'pending'}">
                            ${psbt.signatures_count}/${psbt.m_required} ✍️
                        </span>
                        ${getBroadcastStatusBadge(psbt)}
                    </div>
                </div>
                
                <div class="psbt-content">
                    <div class="psbt-progress">
                        <strong>Signatures:</strong> ${psbt.signatures_count} of ${psbt.m_required} required
                        <div class="psbt-progress-bar">
                            <div class="psbt-progress-fill ${isReady ? 'complete' : ''}" 
                                 style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                    
                    ${signerStatusHtml}
                    
                    ${psbt.notes ? `<div class="psbt-notes">${escapeHtml(psbt.notes)}</div>` : ''}
                    
                    <div class="psbt-actions">
                        ${isReady && !psbt.txid ? `
                        <button class="btn btn-success broadcast-btn" onclick="event.stopPropagation(); broadcastTransaction(${psbt.id})">
                            📡 Broadcast
                        </button>
                        ` : ''}
                        ${psbt.txid ? `
                        <a href="https://mempool.space/tx/${psbt.txid}" target="_blank" class="btn btn-secondary">
                            🔍 View TX
                        </a>
                        ` : ''}
                        <button class="btn btn-info" onclick="event.stopPropagation(); downloadPsbt(${psbt.id})">📥 Download</button>
                        <button class="btn btn-info" onclick="event.stopPropagation(); togglePsbtQR(${psbt.id}, '${escapeHtml(psbt.psbt_data)}')">📱 QR Code</button>
                        <button class="btn btn-secondary" onclick="event.stopPropagation(); viewPsbtDetails(${psbt.id})">👁️ Details</button>
                        <button class="btn btn-danger" onclick="event.stopPropagation(); deletePsbt(${psbt.id})">🗑️ Delete</button>
                    </div>
                    <div id="psbt-qr-${psbt.id}" class="psbt-qr-container" style="display: none; margin-top: 15px; text-align: center; padding: 20px; background: white; border-radius: 8px;"></div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle PSBT card expand/collapse
function togglePsbtCard(id) {
    const wasExpanded = expandedPsbtId === id;
    expandedPsbtId = wasExpanded ? null : id;
    
    // Update all cards
    document.querySelectorAll('.psbt-item').forEach(item => {
        const itemId = parseInt(item.dataset.psbtId);
        if (itemId === id && !wasExpanded) {
            item.classList.add('expanded');
        } else {
            item.classList.remove('expanded');
        }
    });
}

async function uploadPsbt() {
    const name = psbtNameInput.value.trim();
    const psbtString = uploadedPsbtData;

    if (!name || !psbtString) {
        psbtUploadOutput.className = 'output error';
        psbtUploadOutput.innerHTML = '<p class="error-message">Please select a file and enter a name</p>';
        return;
    }

    try {
        // Initialize libraries if not done yet
        if (!bitcoin) {
            initializeBitcoinLibraries();
        }
        
        if (!bitcoin) {
            throw new Error('Bitcoin libraries not loaded. Please refresh the page.');
        }
        
        // Parse PSBT to extract info
        let psbt;
        try {
            psbt = bitcoin.Psbt.fromBase64(psbtString);
        } catch (e) {
            try {
                psbt = bitcoin.Psbt.fromHex(psbtString);
            } catch (e2) {
                throw new Error('Invalid PSBT format. Use base64 or hex encoding.');
            }
        }

        // Get signature info (includes M-of-N from PSBT)
        const sigInfo = getSignatureInfo(psbt);
        let signaturesCount = sigInfo.signatures;
        let mRequired = sigInfo.required;
        let nTotal = sigInfo.total;

        // === AUTO-MERGE: Check if this PSBT matches any existing one ===
        const uploadedFingerprint = generatePsbtFingerprint(psbt.toBase64());
        const matchingPsbt = findMatchingPsbt(psbt);
        
        if (matchingPsbt) {
            // Found a matching PSBT - try to merge signatures
            console.log(`Found matching PSBT: ${matchingPsbt.name} (id: ${matchingPsbt.id})`);
            
            try {
                const existingPsbt = bitcoin.Psbt.fromBase64(matchingPsbt.psbt_data);
                const oldSigCount = countPsbtSignatures(existingPsbt);
                
                // Combine signatures
                existingPsbt.combine(psbt);
                const newSigCount = countPsbtSignatures(existingPsbt);
                
                if (newSigCount > oldSigCount) {
                    // Update the existing PSBT with merged signatures
                    const updateResponse = await fetch(`${API_BASE}/api/psbts/${matchingPsbt.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            psbt_data: existingPsbt.toBase64(),
                            signatures_count: newSigCount
                        })
                    });
                    
                    if (updateResponse.ok) {
                        // Clear form
                        psbtNameInput.value = '';
                        uploadedPsbtData = null;
                        if (psbtFileInput) psbtFileInput.value = '';
                        
                        // Show success toast
                        showToast(
                            'Signatures Merged! ✨',
                            `Merged with "${matchingPsbt.name}" (${oldSigCount} → ${newSigCount} signatures)`,
                            'success'
                        );
                        
                        // Show inline success
                        const fingerprint = generatePsbtFingerprint(matchingPsbt.psbt_data);
                        psbtUploadOutput.className = 'output success';
                        psbtUploadOutput.innerHTML = `
                            <p class="success-message">✨ Signatures automatically merged!</p>
                            <p>Matched with: <strong>${escapeHtml(matchingPsbt.name)}</strong> <span class="psbt-fingerprint">${fingerprint}</span></p>
                            <p>Signatures: ${oldSigCount} → ${newSigCount} of ${mRequired}</p>
                        `;
                        
                        // Expand the merged PSBT
                        expandedPsbtId = matchingPsbt.id;
                        
                        // Reload list
                        await loadPsbts();
                        
                        // Clear success message after 5 seconds
                        setTimeout(() => {
                            psbtUploadOutput.innerHTML = '';
                            psbtUploadOutput.className = 'output';
                        }, 5000);
                        
                        return; // Done - don't create a new PSBT
                    }
                } else {
                    // Same number of signatures - maybe a duplicate
                    showToast(
                        'No New Signatures',
                        `This PSBT matches "${matchingPsbt.name}" but has no new signatures`,
                        'warning'
                    );
                }
            } catch (mergeError) {
                console.log('Auto-merge failed, creating new PSBT:', mergeError.message);
                // Continue to create a new PSBT
            }
        }

        // Upload as new PSBT
        const response = await fetch(`${API_BASE}/api/psbts`, withSession({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                psbt_data: psbt.toBase64(),
                m_required: mRequired,
                n_total: nTotal,
                signatures_count: signaturesCount,
                notes: null
            })
        }));

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to upload PSBT');
        }

        // Clear form
        psbtNameInput.value = '';
        uploadedPsbtData = null;
        if (psbtFileInput) psbtFileInput.value = '';
        
        // Show success
        const newFingerprint = generatePsbtFingerprint(psbt.toBase64());
        psbtUploadOutput.className = 'output success';
        psbtUploadOutput.innerHTML = `
            <p class="success-message">✅ PSBT uploaded successfully!</p>
            <p>Fingerprint: <span class="psbt-fingerprint">${newFingerprint}</span></p>
            <p>Signatures: ${signaturesCount} of ${mRequired}</p>
        `;

        showToast('PSBT Uploaded', `"${name}" has been added`, 'success');

        // Reload list and expand the new one
        expandedPsbtId = null; // Will auto-expand newest
        await loadPsbts();
        
        // Clear success message after 3 seconds
        setTimeout(() => {
            psbtUploadOutput.innerHTML = '';
            psbtUploadOutput.className = 'output';
        }, 3000);

    } catch (error) {
        psbtUploadOutput.className = 'output error';
        psbtUploadOutput.innerHTML = `<p class="error-message">Error: ${escapeHtml(error.message)}</p>`;
    }
}

// Find a matching PSBT based on transaction structure (same inputs/outputs)
function findMatchingPsbt(newPsbt) {
    if (!allPsbts || allPsbts.length === 0) return null;
    if (!bitcoin) return null;
    
    // Get the unsigned transaction ID from the new PSBT
    const newTxInputs = newPsbt.txInputs.map(inp => 
        Buffer.from(inp.hash).reverse().toString('hex') + ':' + inp.index
    ).sort().join(',');
    
    for (const existingPsbtData of allPsbts) {
        try {
            const existingPsbt = bitcoin.Psbt.fromBase64(existingPsbtData.psbt_data);
            const existingTxInputs = existingPsbt.txInputs.map(inp => 
                Buffer.from(inp.hash).reverse().toString('hex') + ':' + inp.index
            ).sort().join(',');
            
            // If inputs match, these are the same transaction
            if (newTxInputs === existingTxInputs) {
                return existingPsbtData;
            }
        } catch (e) {
            // Skip invalid PSBTs
            continue;
        }
    }
    
    return null;
}

function countPsbtSignatures(psbt) {
    let sigCount = 0;
    psbt.data.inputs.forEach(input => {
        if (input.partialSig && input.partialSig.length > 0) {
            sigCount = Math.max(sigCount, input.partialSig.length);
        }
    });
    return sigCount;
}

function extractMultisigInfo(witnessScript) {
    try {
        // Decode the witness script to get M and N
        const decompiled = bitcoin.script.decompile(witnessScript);
        if (decompiled && decompiled.length >= 4) {
            const m = bitcoin.script.number.decode(decompiled[0]);
            const n = bitcoin.script.number.decode(decompiled[decompiled.length - 2]);
            return { m, n };
        }
    } catch (e) {
        console.error('Failed to extract multisig info:', e);
    }
    return null;
}

async function downloadPsbt(id) {
    try {
        const response = await fetch(`${API_BASE}/api/psbts/${id}`);
        if (!response.ok) throw new Error('Failed to fetch PSBT');
        
        const psbt = await response.json();
        
        // Create download link
        const blob = new Blob([psbt.psbt_data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${psbt.name.replace(/[^a-z0-9]/gi, '_')}.psbt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Downloaded', `${psbt.name}.psbt saved`, 'success');
    } catch (error) {
        showToast('Download Failed', error.message, 'error');
    }
}

async function updatePsbtSignatures(id) {
    // Show a modal/dialog for better UX instead of prompt
    const newPsbtString = await showAddSignatureModal(id);
    if (!newPsbtString) return;

    try {
        // Initialize libraries if not done yet
        if (!bitcoin) {
            initializeBitcoinLibraries();
        }
        
        if (!bitcoin) {
            throw new Error('Bitcoin libraries not loaded. Please refresh the page.');
        }
        
        // Fetch the existing PSBT from server
        const existingResponse = await fetch(`${API_BASE}/api/psbts/${id}`);
        if (!existingResponse.ok) throw new Error('Failed to fetch existing PSBT');
        const existingPsbtData = await existingResponse.json();
        
        // Parse the existing PSBT
        let existingPsbt;
        try {
            existingPsbt = bitcoin.Psbt.fromBase64(existingPsbtData.psbt_data);
        } catch (e) {
            throw new Error('Failed to parse existing PSBT');
        }
        
        // Parse the new PSBT
        let newPsbt;
        try {
            newPsbt = bitcoin.Psbt.fromBase64(newPsbtString.trim());
        } catch (e) {
            try {
                newPsbt = bitcoin.Psbt.fromHex(newPsbtString.trim());
            } catch (e2) {
                throw new Error('Invalid PSBT format. Use base64 or hex encoding.');
            }
        }

        // Try to combine/merge the PSBTs
        let combinedPsbt;
        try {
            // Clone the existing PSBT and combine with the new one
            combinedPsbt = bitcoin.Psbt.fromBase64(existingPsbtData.psbt_data);
            combinedPsbt.combine(newPsbt);
            console.log('PSBTs merged successfully using combine()');
        } catch (combineError) {
            console.log('Combine failed, using new PSBT directly:', combineError.message);
            // If combine fails (e.g., different transactions), just use the new PSBT
            combinedPsbt = newPsbt;
        }

        // Count signatures in the combined PSBT
        const signaturesCount = countPsbtSignatures(combinedPsbt);
        const oldSigCount = existingPsbtData.signatures_count || 0;

        // Update on server
        const response = await fetch(`${API_BASE}/api/psbts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                psbt_data: combinedPsbt.toBase64(),
                signatures_count: signaturesCount
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update PSBT');
        }

        await loadPsbts();
        
        // Show success message with signature count change
        if (signaturesCount > oldSigCount) {
            showToast('Signatures Added', `${oldSigCount} → ${signaturesCount} signatures`, 'success');
        } else if (signaturesCount === oldSigCount) {
            showToast('No New Signatures', `PSBT updated but signature count unchanged (${signaturesCount})`, 'warning');
        } else {
            showToast('PSBT Updated', `Now has ${signaturesCount} signatures`, 'success');
        }
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Show modal for adding signature with better UX
function showAddSignatureModal(id) {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3>✍️ Add Signature to PSBT</h3>
                <p style="margin-bottom: 15px; color: #666;">
                    Paste the signed PSBT below. If it contains new signatures, they will be merged with the existing ones.
                </p>
                
                <div class="form-group">
                    <label>Upload .psbt file:</label>
                    <input type="file" id="modal-psbt-file" accept=".psbt,.txt" style="margin-bottom: 10px;">
                </div>
                
                <div class="form-group">
                    <label>Or paste PSBT (Base64 or Hex):</label>
                    <textarea id="modal-psbt-input" placeholder="Paste signed PSBT here..." rows="6" style="width: 100%; font-family: monospace; font-size: 12px;"></textarea>
                </div>
                
                <div id="modal-validation" style="margin: 10px 0; padding: 10px; border-radius: 4px; display: none;"></div>
                
                <div class="modal-buttons" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
                    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
                    <button class="btn btn-success" id="modal-submit" disabled>Merge Signatures</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const fileInput = document.getElementById('modal-psbt-file');
        const textInput = document.getElementById('modal-psbt-input');
        const validation = document.getElementById('modal-validation');
        const submitBtn = document.getElementById('modal-submit');
        const cancelBtn = document.getElementById('modal-cancel');
        
        // Handle file upload
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                if (content instanceof ArrayBuffer) {
                    const bytes = new Uint8Array(content);
                    const binary = String.fromCharCode.apply(null, bytes);
                    textInput.value = btoa(binary);
                } else {
                    textInput.value = content.trim();
                }
                validateModalPsbt(textInput.value, validation, submitBtn);
            };
            
            if (file.name.endsWith('.psbt')) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }
        });
        
        // Validate on text input change
        textInput.addEventListener('input', () => {
            validateModalPsbt(textInput.value.trim(), validation, submitBtn);
        });
        
        // Cancel button
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(null);
        });
        
        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(null);
            }
        });
        
        // Submit button
        submitBtn.addEventListener('click', () => {
            const psbtValue = textInput.value.trim();
            document.body.removeChild(overlay);
            resolve(psbtValue);
        });
    });
}

// Validate PSBT in modal
function validateModalPsbt(psbtString, validationEl, submitBtn) {
    if (!psbtString) {
        validationEl.style.display = 'none';
        submitBtn.disabled = true;
        return;
    }
    
    try {
        if (!bitcoin) {
            initializeBitcoinLibraries();
        }
        
        let psbt;
        try {
            psbt = bitcoin.Psbt.fromBase64(psbtString);
        } catch (e) {
            psbt = bitcoin.Psbt.fromHex(psbtString);
        }
        
        const sigInfo = getSignatureInfo(psbt);
        
        validationEl.style.display = 'block';
        validationEl.style.background = '#d4edda';
        validationEl.style.color = '#155724';
        validationEl.innerHTML = `
            <strong>✅ Valid PSBT</strong><br>
            Signatures found: ${sigInfo.signatures} of ${sigInfo.required} required
        `;
        submitBtn.disabled = false;
        
    } catch (error) {
        validationEl.style.display = 'block';
        validationEl.style.background = '#f8d7da';
        validationEl.style.color = '#721c24';
        validationEl.innerHTML = `<strong>❌ Invalid PSBT:</strong> ${error.message}`;
        submitBtn.disabled = true;
    }
}

async function viewPsbtDetails(id) {
    try {
        const response = await fetch(`${API_BASE}/api/psbts/${id}`);
        if (!response.ok) throw new Error('Failed to fetch PSBT');
        
        const psbtData = await response.json();
        
        // Initialize libraries if not done yet
        if (!bitcoin) {
            initializeBitcoinLibraries();
        }
        
        if (!bitcoin) {
            throw new Error('Bitcoin libraries not loaded. Please refresh the page.');
        }
        
        // Parse PSBT
        let psbt;
        try {
            psbt = bitcoin.Psbt.fromBase64(psbtData.psbt_data);
        } catch (e) {
            try {
                psbt = bitcoin.Psbt.fromHex(psbtData.psbt_data);
            } catch (e2) {
                throw new Error('Invalid PSBT format');
            }
        }
        
        // Get parsed details
        const details = parsePsbtDetails(psbt);
        
        // Show details in modal
        showPsbtDetailsModal(psbtData.name, details);
        
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Show PSBT details in a modal
function showPsbtDetailsModal(name, details) {
    const { inputs, outputs, totalInput, totalOutput, fee, sigInfo } = details;
    
    // Build signer status HTML if available
    let signerStatusHtml = '';
    if (sigInfo.signerStatus && sigInfo.signerStatus.length > 0) {
        signerStatusHtml = `
            <div style="margin-top: 15px;">
                <strong style="font-size: 13px;">🔑 Signers:</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                    ${sigInfo.signerStatus.map(signer => `
                        <span style="display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 16px; font-size: 12px; ${signer.hasSigned ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 'background: #fff3cd; color: #856404; border: 1px solid #ffeeba;'}">
                            ${signer.hasSigned ? '✅' : '⏳'}
                            <span style="margin-left: 4px; font-weight: 500;">${signer.label ? escapeHtml(signer.label) : 'Unknown Key'}</span>
                            ${!signer.label ? `<span style="margin-left: 4px; font-size: 10px; opacity: 0.7;">(${signer.pubkeyShort})</span>` : ''}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h3>📋 PSBT Details: ${escapeHtml(name)}</h3>
            
            <div class="psbt-details" style="margin-top: 15px;">
                <!-- Signature Progress Section -->
                <div class="tx-info signature-section" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="margin-bottom: 10px;">🔏 Signature Status</h4>
                    <div class="signature-progress">
                        <div class="sig-count" style="font-size: 24px; margin-bottom: 10px;">
                            <span class="sig-current">${sigInfo.signatures}</span>
                            <span class="sig-separator">/</span>
                            <span class="sig-required">${sigInfo.required}</span>
                            <span class="sig-label" style="font-size: 14px;">signatures</span>
                        </div>
                        <div class="sig-progress-bar">
                            <div class="sig-progress-fill ${sigInfo.isComplete ? 'complete' : ''}" 
                                 style="width: ${sigInfo.percentage}%"></div>
                        </div>
                        <div class="sig-status ${sigInfo.isComplete ? 'ready' : 'pending'}" style="margin-top: 8px;">
                            ${sigInfo.isComplete 
                                ? '✅ Ready to broadcast' 
                                : `⏳ Needs ${sigInfo.required - sigInfo.signatures} more signature${sigInfo.required - sigInfo.signatures > 1 ? 's' : ''}`}
                        </div>
                        ${signerStatusHtml}
                    </div>
                </div>

                <div class="tx-info" style="margin-bottom: 15px;">
                    <h4 style="margin-bottom: 8px;">Inputs (${inputs.length}):</h4>
                    ${inputs.map((inp, i) => `
                        <div class="tx-item" style="padding: 8px; background: #fff; border-radius: 4px; margin-bottom: 5px; font-size: 12px; word-break: break-all;">
                            <strong>#${i}:</strong> ${inp.txid}:${inp.vout}<br>
                            <strong>Value:</strong> ${formatSatoshis(inp.value)}
                        </div>
                    `).join('')}
                </div>

                <div class="tx-info" style="margin-bottom: 15px;">
                    <h4 style="margin-bottom: 8px;">Outputs (${outputs.length}):</h4>
                    ${outputs.map((out, i) => `
                        <div class="tx-item" style="padding: 8px; background: #fff; border-radius: 4px; margin-bottom: 5px; font-size: 12px; word-break: break-all;">
                            <strong>#${i}:</strong> ${out.address}<br>
                            <strong>Value:</strong> ${formatSatoshis(out.value)}
                        </div>
                    `).join('')}
                </div>

                <div class="tx-info" style="padding: 15px; background: #e8f5e9; border-radius: 8px;">
                    <h4 style="margin-bottom: 8px;">Summary:</h4>
                    <div class="tx-item">
                        <strong>Total Input:</strong> ${formatSatoshis(totalInput)}<br>
                        <strong>Total Output:</strong> ${formatSatoshis(totalOutput)}<br>
                        <strong>Fee:</strong> ${formatSatoshis(fee)} (${fee > 0 && totalInput > 0 ? ((fee / totalInput) * 100).toFixed(2) : 0}%)
                    </div>
                </div>
            </div>

            <p style="margin-top: 15px; color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; font-size: 14px;">
                ⚠️ Verify all details carefully before signing this transaction!
            </p>
            
            <div style="display: flex; justify-content: flex-end; margin-top: 15px;">
                <button class="btn btn-primary" id="modal-close">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close button
    document.getElementById('modal-close').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
}

async function deletePsbt(id) {
    if (!confirm('Are you sure you want to delete this PSBT?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/psbts/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete PSBT');

        await loadPsbts();
        showToast('PSBT Deleted', 'Transaction has been removed', 'success');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Toggle PSBT QR code
function togglePsbtQR(id, psbtData) {
    const qrContainer = document.getElementById(`psbt-qr-${id}`);
    if (qrContainer.style.display === 'none') {
        qrContainer.style.display = 'block';
        qrContainer.innerHTML = '<p style="margin-bottom: 15px; color: #666;">Scan this QR code with your hardware wallet or mobile signer</p>';
        const qrDiv = document.createElement('div');
        qrContainer.appendChild(qrDiv);
        new QRCode(qrDiv, {
            text: psbtData,
            width: 300,
            height: 300,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L // Low error correction for max data
        });
    } else {
        qrContainer.style.display = 'none';
    }
}

// Auto-validate PSBT after file upload
function autoValidateUploadedPsbt(filename) {
    try {
        // Initialize libraries if not done yet
        if (!bitcoin) {
            initializeBitcoinLibraries();
        }
        
        if (!bitcoin) {
            psbtUploadOutput.className = 'output success';
            psbtUploadOutput.innerHTML = `<p class="success-message">✅ File loaded: ${escapeHtml(filename)}</p><p class="info">Libraries loading... validation pending</p>`;
            return;
        }
        
        const psbtString = uploadedPsbtData;
        if (!psbtString) return;
        
        // Try to parse PSBT
        let psbt;
        try {
            psbt = bitcoin.Psbt.fromBase64(psbtString);
        } catch (e) {
            try {
                psbt = bitcoin.Psbt.fromHex(psbtString);
            } catch (e2) {
                psbtUploadOutput.className = 'output error';
                psbtUploadOutput.innerHTML = `<p class="error-message">❌ Invalid PSBT file: ${escapeHtml(filename)}</p>`;
                return;
            }
        }
        
        // Get signature info
        const sigInfo = getSignatureInfo(psbt);
        const inputCount = psbt.data.inputs.length;
        const outputCount = psbt.txOutputs.length;
        
        // Calculate total amounts
        let totalInput = 0;
        psbt.data.inputs.forEach(input => {
            if (input.witnessUtxo) {
                totalInput += input.witnessUtxo.value;
            }
        });
        
        let totalOutput = 0;
        psbt.txOutputs.forEach(output => {
            totalOutput += output.value;
        });
        
        const fee = totalInput - totalOutput;
        
        // Build signer status HTML for upload validation
        let signerStatusHtml = '';
        if (sigInfo.signerStatus && sigInfo.signerStatus.length > 0) {
            // Detailed signer info available
            signerStatusHtml = `
                <div style="margin-top: 15px; padding: 12px; background: rgba(255,255,255,0.5); border-radius: 8px;">
                    <strong style="font-size: 13px; color: #555;">🔑 Signers:</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${sigInfo.signerStatus.map(signer => `
                            <span style="display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 16px; font-size: 12px; ${signer.hasSigned ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 'background: #fff3cd; color: #856404; border: 1px solid #ffeeba;'}">
                                ${signer.hasSigned ? '✅' : '⏳'}
                                <span style="margin-left: 4px; font-weight: 500;">${signer.label ? escapeHtml(signer.label) : signer.pubkeyShort}</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            // Fallback: show generic signed/unsigned badges
            const signed = sigInfo.signatures;
            const unsigned = Math.max(0, sigInfo.total - signed);
            if (sigInfo.total > 0) {
                signerStatusHtml = `
                    <div style="margin-top: 15px; padding: 12px; background: rgba(255,255,255,0.5); border-radius: 8px;">
                        <strong style="font-size: 13px; color: #555;">🔑 Signers (${sigInfo.total} keys):</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                            ${Array(signed).fill(0).map((_, i) => `
                                <span style="display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 16px; font-size: 12px; background: #d4edda; color: #155724; border: 1px solid #c3e6cb;">
                                    ✅ <span style="margin-left: 4px; font-weight: 500;">Signed</span>
                                </span>
                            `).join('')}
                            ${Array(unsigned).fill(0).map((_, i) => `
                                <span style="display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 16px; font-size: 12px; background: #fff3cd; color: #856404; border: 1px solid #ffeeba;">
                                    ⏳ <span style="margin-left: 4px; font-weight: 500;">Needs signature</span>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }
        
        // Display validation result with signature progress
        psbtUploadOutput.className = 'output success';
        psbtUploadOutput.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0;">✅ Valid PSBT: ${escapeHtml(filename)}</h4>
                <span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">PREVIEW</span>
            </div>
            
            <div class="signature-progress" style="margin: 15px 0;">
                <div class="sig-count" style="font-size: 24px;">
                    <span class="sig-current">${sigInfo.signatures}</span>
                    <span class="sig-separator">/</span>
                    <span class="sig-required">${sigInfo.required}</span>
                    <span class="sig-label" style="font-size: 14px;">signatures</span>
                </div>
                <div class="sig-progress-bar">
                    <div class="sig-progress-fill ${sigInfo.isComplete ? 'complete' : ''}" 
                         style="width: ${sigInfo.percentage}%"></div>
                </div>
                <div class="sig-status ${sigInfo.isComplete ? 'ready' : 'pending'}" style="font-size: 14px;">
                    ${sigInfo.isComplete 
                        ? '✅ Ready to broadcast' 
                        : `⏳ Needs ${sigInfo.required - sigInfo.signatures} more signature${sigInfo.required - sigInfo.signatures > 1 ? 's' : ''}`}
                </div>
            </div>
            
            ${signerStatusHtml}
            
            <div style="font-size: 14px; color: #666; margin-top: 10px;">
                <strong>Transaction:</strong> ${inputCount} input(s) → ${outputCount} output(s)<br>
                <strong>Total:</strong> ${formatSatoshis(totalInput)}<br>
                <strong>Fee:</strong> ${formatSatoshis(fee)}
            </div>
        `;
        
    } catch (error) {
        psbtUploadOutput.className = 'output error';
        psbtUploadOutput.innerHTML = `<p class="error-message">Error validating PSBT: ${escapeHtml(error.message)}</p>`;
    }
}

// Utility Functions
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function formatSatoshis(sats) {
    if (typeof sats !== 'number') return 'Unknown';
    const btc = sats / 100000000;
    return `${sats.toLocaleString()} sats (${btc.toFixed(8)} BTC)`;
}

// Generate unique gradient colors from a string hash
function generateGradientFromHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    // Generate two soft pastel colors
    const hue1 = Math.abs(hash % 360);
    const hue2 = (hue1 + 40 + Math.abs((hash >> 8) % 40)) % 360;
    
    return {
        color1: `hsl(${hue1}, 70%, 95%)`,
        color2: `hsl(${hue2}, 60%, 92%)`,
        gradient: `linear-gradient(135deg, hsl(${hue1}, 70%, 95%) 0%, hsl(${hue2}, 60%, 92%) 100%)`
    };
}

// Generate a short fingerprint from PSBT data
function generatePsbtFingerprint(psbtData) {
    let hash = 0;
    const str = psbtData.substring(0, 100);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 6).toLowerCase();
}

// Format timestamp with exact time and relative time
function formatTimestamp(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // Exact time
    const exactTime = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    // Relative time
    let relative;
    if (diff < 60000) {
        relative = 'just now';
    } else if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        relative = `${mins} min${mins > 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        relative = `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        const days = Math.floor(diff / 86400000);
        relative = `${days} day${days > 1 ? 's' : ''} ago`;
    }
    
    return { exact: exactTime, relative };
}

// Toast notification system
function showToast(title, message, type = 'info') {
    // Create container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const icons = {
        success: '✅',
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close">×</button>
    `;
    
    container.appendChild(toast);
    
    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.animation = 'toastSlideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// ==================== DESCRIPTOR MANAGEMENT ====================

// Load saved descriptors from server
async function loadDescriptors() {
    try {
        const response = await fetch(`${API_BASE}/api/descriptors`, withSession());
        if (!response.ok) throw new Error('Failed to load descriptors');
        
        allDescriptors = await response.json();
        displayDescriptors();
    } catch (error) {
        console.error('Error loading descriptors:', error);
    }
}

// Save current descriptor to server
async function saveDescriptorToServer() {
    const descriptor = window.currentDescriptor;
    const m = window.currentDescriptorM;
    const n = window.currentDescriptorN;
    const firstAddress = window.currentFirstAddress;
    
    if (!descriptor) {
        showToast('Error', 'No descriptor to save', 'error');
        return;
    }
    
    // Generate a name
    const name = `${m}-of-${n} Multisig Wallet`;
    
    try {
        const response = await fetch(`${API_BASE}/api/descriptors`, withSession({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                descriptor,
                m_required: m,
                n_total: n,
                first_address: firstAddress
            })
        }));
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save descriptor');
        }
        
        showToast('Saved', 'Descriptor saved to server for sharing', 'success');
        await loadDescriptors();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Display saved descriptors
function displayDescriptors() {
    const descriptorListDiv = document.getElementById('descriptor-list');
    if (!descriptorListDiv) return;
    
    if (allDescriptors.length === 0) {
        descriptorListDiv.innerHTML = '<p class="info">No saved descriptors yet. Generate a descriptor above and click "Save to Server" to share it.</p>';
        return;
    }
    
    descriptorListDiv.innerHTML = allDescriptors.map(desc => {
        const gradient = generateGradientFromHash(desc.descriptor);
        const fingerprint = generatePsbtFingerprint(desc.descriptor);
        const timestamp = formatTimestamp(desc.created_at);
        
        return `
            <div class="descriptor-item" style="background: ${gradient.gradient}; border-radius: 12px; padding: 15px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <h4 style="margin: 0; color: #333;">📜 ${escapeHtml(desc.name)}</h4>
                        <div style="font-size: 12px; color: #666; margin-top: 4px;">
                            ${desc.m_required}-of-${desc.n_total} Multisig • ${timestamp.exact}
                        </div>
                    </div>
                    <span class="psbt-fingerprint" style="background: rgba(0,0,0,0.1); padding: 4px 10px; border-radius: 12px; font-family: monospace; font-size: 12px;">${fingerprint}</span>
                </div>
                
                ${desc.first_address ? `
                <div style="background: rgba(46, 125, 50, 0.1); border: 1px solid rgba(46, 125, 50, 0.3); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                    <div style="font-size: 11px; color: #2e7d32; font-weight: 600;">💰 First Receive Address:</div>
                    <div style="font-family: monospace; font-size: 12px; color: #1b5e20; word-break: break-all;">${desc.first_address}</div>
                </div>
                ` : ''}
                
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    <button class="btn btn-primary btn-sm" onclick="copyDescriptorById(${desc.id})">📋 Copy</button>
                    <button class="btn btn-info btn-sm" onclick="downloadDescriptorById(${desc.id})">📥 Download</button>
                    ${desc.first_address ? `<button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${desc.first_address}', 'Address')">📋 Copy Address</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteDescriptor(${desc.id})">🗑️ Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Copy descriptor by ID
function copyDescriptorById(id) {
    const desc = allDescriptors.find(d => d.id === id);
    if (desc) {
        copyToClipboard(desc.descriptor, 'Descriptor');
    }
}

// Download descriptor by ID
function downloadDescriptorById(id) {
    const desc = allDescriptors.find(d => d.id === id);
    if (!desc) return;
    
    const content = `# Multisig Wallet Descriptor
# Configuration: ${desc.m_required}-of-${desc.n_total}
# Type: Native Segwit (P2WSH)
# Generated: ${desc.created_at}

# Wallet Descriptor (import this into Sparrow Wallet or Bitcoin Core):
${desc.descriptor}

# First Receive Address (Index 0):
${desc.first_address || 'N/A'}

# Instructions:
# 1. Open Sparrow Wallet (or similar software)
# 2. Create New Wallet → Import External → Descriptor
# 3. Paste the descriptor above
# 4. The wallet will generate addresses matching this multisig configuration
`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multisig_${desc.m_required}of${desc.n_total}_descriptor.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Downloaded', 'Descriptor file saved', 'success');
}

// Delete descriptor
async function deleteDescriptor(id) {
    if (!confirm('Are you sure you want to delete this saved descriptor?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/descriptors/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete descriptor');
        
        await loadDescriptors();
        showToast('Deleted', 'Descriptor has been removed', 'success');
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

// Update auto-generated label placeholder
function updateAutoLabelPlaceholder() {
    const nextNum = allXpubs.length + 1;
    const placeholder = `Key #${nextNum}`;
    xpubLabelInput.placeholder = placeholder;
    
    // Update hint visibility
    const hint = document.getElementById('auto-label-hint');
    if (hint) {
        hint.textContent = `(will use "${placeholder}" if empty)`;
    }
}

// ==================== BROADCAST FUNCTIONALITY ====================

// Broadcast endpoints configuration
const BROADCAST_ENDPOINTS = [
    {
        name: 'Blockstream',
        url: 'https://blockstream.info/api/tx',
        method: 'POST',
        contentType: 'text/plain',
        formatBody: (hex) => hex,
        parseResponse: (text) => text.trim(), // Returns txid
        explorerUrl: (txid) => `https://blockstream.info/tx/${txid}`
    },
    {
        name: 'Mempool.space',
        url: 'https://mempool.space/api/tx',
        method: 'POST',
        contentType: 'text/plain',
        formatBody: (hex) => hex,
        parseResponse: (text) => text.trim(), // Returns txid
        explorerUrl: (txid) => `https://mempool.space/tx/${txid}`
    }
];

// Verification endpoints (we check these AFTER broadcasting to confirm propagation)
const VERIFY_ENDPOINTS = [
    {
        name: 'Blockstream',
        checkUrl: (txid) => `https://blockstream.info/api/tx/${txid}`,
        parseExists: (response) => response.ok
    },
    {
        name: 'Mempool.space',
        checkUrl: (txid) => `https://mempool.space/api/tx/${txid}`,
        parseExists: (response) => response.ok
    },
    {
        name: 'Blockchain.info',
        checkUrl: (txid) => `https://blockchain.info/rawtx/${txid}?cors=true`,
        parseExists: (response) => response.ok
    }
];

// Finalize a PSBT and extract the raw transaction hex
function finalizePsbt(psbtData) {
    try {
        const psbt = bitcoin.Psbt.fromBase64(psbtData);
        
        // Check if already finalized
        let needsFinalize = false;
        for (const input of psbt.data.inputs) {
            if (!input.finalScriptSig && !input.finalScriptWitness) {
                needsFinalize = true;
                break;
            }
        }
        
        if (needsFinalize) {
            psbt.finalizeAllInputs();
        }
        
        const tx = psbt.extractTransaction();
        return {
            success: true,
            hex: tx.toHex(),
            txid: tx.getId()
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Broadcast transaction to a single endpoint
async function broadcastToEndpoint(endpoint, txHex) {
    try {
        const response = await fetch(endpoint.url, {
            method: endpoint.method,
            headers: {
                'Content-Type': endpoint.contentType
            },
            body: endpoint.formatBody(txHex)
        });
        
        if (response.ok) {
            const text = await response.text();
            const txid = endpoint.parseResponse(text);
            return {
                success: true,
                endpoint: endpoint.name,
                txid: txid,
                explorerUrl: endpoint.explorerUrl(txid)
            };
        } else {
            const errorText = await response.text();
            return {
                success: false,
                endpoint: endpoint.name,
                error: errorText || `HTTP ${response.status}`
            };
        }
    } catch (error) {
        return {
            success: false,
            endpoint: endpoint.name,
            error: error.message
        };
    }
}

// Verify transaction exists on an endpoint (to confirm propagation)
async function verifyOnEndpoint(verifyEndpoint, txid, broadcastedTo) {
    // Skip if we directly broadcast to this endpoint
    if (broadcastedTo.includes(verifyEndpoint.name)) {
        return {
            endpoint: verifyEndpoint.name,
            status: 'skipped',
            reason: 'Direct broadcast target'
        };
    }
    
    try {
        const response = await fetch(verifyEndpoint.checkUrl(txid), {
            method: 'GET'
        });
        
        const exists = verifyEndpoint.parseExists(response);
        return {
            endpoint: verifyEndpoint.name,
            status: exists ? 'confirmed' : 'not_found',
            independent: true // This is an independent verification
        };
    } catch (error) {
        return {
            endpoint: verifyEndpoint.name,
            status: 'error',
            error: error.message
        };
    }
}

// Main broadcast function with verification
async function broadcastTransaction(psbtId) {
    const psbtData = allPsbts.find(p => p.id === psbtId);
    if (!psbtData) {
        showToast('Error', 'PSBT not found', 'error');
        return;
    }
    
    // Show broadcast modal
    const modal = showBroadcastModal(psbtData);
    const statusContainer = modal.querySelector('#broadcast-status');
    const resultContainer = modal.querySelector('#broadcast-result');
    
    // Step 1: Finalize PSBT
    updateBroadcastStatus(statusContainer, 'finalize', 'pending', 'Finalizing PSBT...');
    
    const finalizeResult = finalizePsbt(psbtData.psbt_data);
    if (!finalizeResult.success) {
        updateBroadcastStatus(statusContainer, 'finalize', 'error', `Failed: ${finalizeResult.error}`);
        return;
    }
    
    updateBroadcastStatus(statusContainer, 'finalize', 'success', `Finalized! TxID: ${finalizeResult.txid.substring(0, 16)}...`);
    
    const txHex = finalizeResult.hex;
    const txid = finalizeResult.txid;
    
    // Step 2: Broadcast to all endpoints in parallel
    updateBroadcastStatus(statusContainer, 'broadcast', 'pending', 'Broadcasting to network...');
    
    const broadcastPromises = BROADCAST_ENDPOINTS.map(endpoint => 
        broadcastToEndpoint(endpoint, txHex)
    );
    
    const broadcastResults = await Promise.all(broadcastPromises);
    
    // Track which endpoints accepted the broadcast
    const successfulBroadcasts = broadcastResults.filter(r => r.success);
    const failedBroadcasts = broadcastResults.filter(r => !r.success);
    
    // Update broadcast status for each endpoint
    broadcastResults.forEach(result => {
        const statusClass = result.success ? 'success' : 'error';
        const icon = result.success ? '✅' : '❌';
        const message = result.success 
            ? `Accepted` 
            : `Failed: ${result.error.substring(0, 50)}`;
        
        addEndpointStatus(statusContainer, 'broadcast', result.endpoint, statusClass, `${icon} ${message}`);
    });
    
    if (successfulBroadcasts.length === 0) {
        updateBroadcastStatus(statusContainer, 'broadcast', 'error', 'All broadcasts failed!');
        showBroadcastResult(resultContainer, false, 'Transaction broadcast failed. Please try again later.');
        return;
    }
    
    updateBroadcastStatus(statusContainer, 'broadcast', 'success', 
        `Sent to ${successfulBroadcasts.length}/${BROADCAST_ENDPOINTS.length} endpoints`);
    
    // Step 3: Wait and verify propagation on INDEPENDENT endpoints
    updateBroadcastStatus(statusContainer, 'verify', 'pending', 'Verifying network propagation...');
    
    // Wait a few seconds for propagation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const broadcastedToNames = successfulBroadcasts.map(r => r.endpoint);
    const verifyPromises = VERIFY_ENDPOINTS.map(endpoint =>
        verifyOnEndpoint(endpoint, txid, broadcastedToNames)
    );
    
    const verifyResults = await Promise.all(verifyPromises);
    
    // Check for independent confirmations
    const independentConfirmations = verifyResults.filter(r => 
        r.status === 'confirmed' && r.independent
    );
    
    // Update verify status for each endpoint
    verifyResults.forEach(result => {
        if (result.status === 'skipped') return; // Don't show skipped endpoints
        
        const statusClass = result.status === 'confirmed' ? 'success' : 'warning';
        const icon = result.status === 'confirmed' ? '🌐' : '⏳';
        const message = result.status === 'confirmed' 
            ? 'Confirmed on network!' 
            : 'Not seen yet';
        
        addEndpointStatus(statusContainer, 'verify', result.endpoint, statusClass, `${icon} ${message}`);
    });
    
    // Final result
    if (independentConfirmations.length > 0) {
        updateBroadcastStatus(statusContainer, 'verify', 'success', 
            `✨ Independently confirmed on ${independentConfirmations.length} service(s)!`);
        showBroadcastResult(resultContainer, true, txid, successfulBroadcasts[0].explorerUrl);
        
        // Update PSBT status in database
        await updatePsbtBroadcastStatus(psbtId, txid);
    } else if (successfulBroadcasts.length > 0) {
        updateBroadcastStatus(statusContainer, 'verify', 'warning', 
            'Broadcast accepted, waiting for network propagation...');
        showBroadcastResult(resultContainer, true, txid, successfulBroadcasts[0].explorerUrl, true);
        
        // Still update status - it was accepted
        await updatePsbtBroadcastStatus(psbtId, txid);
    }
}

// Update PSBT status after broadcast
async function updatePsbtBroadcastStatus(psbtId, txid) {
    try {
        await fetch(`${API_BASE}/api/psbts/${psbtId}/broadcast`, withSession({
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                txid: txid,
                status: 'broadcast',
                confirmations: 0
            })
        }));
        await loadPsbts();
        
        // Start confirmation tracking for this transaction
        startConfirmationTracking(psbtId, txid);
    } catch (error) {
        console.error('Failed to update PSBT status:', error);
    }
}

// ==================== CONFIRMATION TRACKING ====================

// Store active polling timers
const confirmationPollers = new Map();

// Check transaction confirmations from blockchain API
async function checkConfirmations(txid) {
    try {
        // Try Blockstream API first
        const response = await fetch(`https://blockstream.info/api/tx/${txid}`);
        if (response.ok) {
            const txData = await response.json();
            
            // If tx has block_height, it's confirmed - need to get current block height
            if (txData.status && txData.status.confirmed) {
                const blockHeightResponse = await fetch('https://blockstream.info/api/blocks/tip/height');
                if (blockHeightResponse.ok) {
                    const currentHeight = await blockHeightResponse.text();
                    const confirmations = parseInt(currentHeight) - txData.status.block_height + 1;
                    return { confirmations: Math.max(0, confirmations), confirmed: true };
                }
            }
            return { confirmations: 0, confirmed: false };
        }
        
        // Fallback to mempool.space
        const mempoolResponse = await fetch(`https://mempool.space/api/tx/${txid}`);
        if (mempoolResponse.ok) {
            const txData = await mempoolResponse.json();
            if (txData.status && txData.status.confirmed) {
                const blockHeightResponse = await fetch('https://mempool.space/api/blocks/tip/height');
                if (blockHeightResponse.ok) {
                    const currentHeight = await blockHeightResponse.text();
                    const confirmations = parseInt(currentHeight) - txData.status.block_height + 1;
                    return { confirmations: Math.max(0, confirmations), confirmed: true };
                }
            }
            return { confirmations: 0, confirmed: false };
        }
        
        return null; // Couldn't check
    } catch (error) {
        console.error('Error checking confirmations:', error);
        return null;
    }
}

// Start tracking confirmations for a transaction
function startConfirmationTracking(psbtId, txid) {
    // Clear any existing poller for this PSBT
    if (confirmationPollers.has(psbtId)) {
        clearTimeout(confirmationPollers.get(psbtId));
    }
    
    // Start the polling
    pollConfirmations(psbtId, txid, 0);
}

// Poll for confirmations
async function pollConfirmations(psbtId, txid, currentConfirmations) {
    const result = await checkConfirmations(txid);
    
    if (result !== null) {
        const newConfirmations = result.confirmations;
        
        // Update if confirmations changed
        if (newConfirmations !== currentConfirmations) {
            let newStatus;
            if (newConfirmations === 0) {
                newStatus = 'broadcast';
            } else if (newConfirmations >= 6) {
                newStatus = 'final';
            } else {
                newStatus = `confirmed_${newConfirmations}`;
            }
            
            // Update on server
            try {
                await fetch(`${API_BASE}/api/psbts/${psbtId}/broadcast`, withSession({
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        txid: txid,
                        status: newStatus,
                        confirmations: newConfirmations
                    })
                }));
                
                // Reload PSBTs to update UI
                await loadPsbts();
                
                // Show notification on milestones
                if (newConfirmations === 1) {
                    showToast('First Confirmation! 🎉', `Transaction ${txid.substring(0, 8)}... has 1 confirmation`, 'success');
                } else if (newConfirmations === 6) {
                    showToast('Transaction Final! ✅', `Transaction ${txid.substring(0, 8)}... has 6+ confirmations`, 'success');
                }
            } catch (error) {
                console.error('Error updating confirmation status:', error);
            }
        }
        
        // If we've reached 6+ confirmations, stop polling
        if (newConfirmations >= 6) {
            confirmationPollers.delete(psbtId);
            return;
        }
        
        // Schedule next poll
        // Unconfirmed: check every 5 seconds
        // 1-5 confirmations: check every 20 seconds
        const pollInterval = newConfirmations === 0 ? 5000 : 20000;
        
        const timerId = setTimeout(() => {
            pollConfirmations(psbtId, txid, newConfirmations);
        }, pollInterval);
        
        confirmationPollers.set(psbtId, timerId);
    } else {
        // If check failed, retry in 10 seconds
        const timerId = setTimeout(() => {
            pollConfirmations(psbtId, txid, currentConfirmations);
        }, 10000);
        
        confirmationPollers.set(psbtId, timerId);
    }
}

// Initialize confirmation tracking for any broadcast PSBTs on page load
function initializeConfirmationTracking() {
    allPsbts.forEach(psbt => {
        // Track any broadcast transaction that isn't final
        if (psbt.txid && psbt.status && 
            (psbt.status === 'broadcast' || psbt.status.startsWith('confirmed_')) && 
            psbt.status !== 'final') {
            startConfirmationTracking(psbt.id, psbt.txid);
        }
        
        // Check if "ready" PSBTs without txid might already be on chain (broadcast externally)
        if (psbt.status === 'ready' && !psbt.txid) {
            checkIfAlreadyBroadcast(psbt);
        }
    });
}

// Check if a "ready" PSBT was already broadcast externally
async function checkIfAlreadyBroadcast(psbt) {
    if (!bitcoin) {
        console.log(`checkIfAlreadyBroadcast: Bitcoin libraries not loaded yet for "${psbt.name}"`);
        return false;
    }
    
    try {
        // Compute the txid by finalizing the PSBT (without actually broadcasting)
        console.log(`checkIfAlreadyBroadcast: Attempting to finalize PSBT "${psbt.name}"...`);
        const result = finalizePsbt(psbt.psbt_data);
        if (!result.success) {
            console.log(`checkIfAlreadyBroadcast: Failed to finalize "${psbt.name}": ${result.error}`);
            return false;
        }
        
        const txid = result.txid;
        console.log(`checkIfAlreadyBroadcast: PSBT "${psbt.name}" would have txid: ${txid}`);
        console.log(`checkIfAlreadyBroadcast: Checking blockchain APIs...`);
        
        // Check if this txid exists on the blockchain
        const confirmResult = await checkConfirmations(txid);
        
        console.log(`checkIfAlreadyBroadcast: API result for "${psbt.name}":`, confirmResult);
        
        if (confirmResult !== null) {
            // Transaction exists on chain or in mempool!
            const confs = confirmResult.confirmations;
            let newStatus;
            if (confs === 0) {
                newStatus = 'broadcast';
            } else if (confs >= 6) {
                newStatus = 'final';
            } else {
                newStatus = `confirmed_${confs}`;
            }
            
            console.log(`checkIfAlreadyBroadcast: Found! "${psbt.name}" is on chain. Status: ${newStatus}, Confirmations: ${confs}`);
            
            // Update the database
            const updateResponse = await fetch(`${API_BASE}/api/psbts/${psbt.id}/broadcast`, withSession({
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txid: txid,
                    status: newStatus,
                    confirmations: confs
                })
            }));
            
            console.log(`checkIfAlreadyBroadcast: Database update response:`, updateResponse.status);
            
            if (updateResponse.ok) {
                showToast('Transaction Found! 🔍', 
                    `"${psbt.name}" was already broadcast (${confs} confirmations)`, 
                    'info');
                
                // Reload PSBTs to update UI (don't await to avoid recursion issues)
                setTimeout(() => loadPsbts(), 100);
                return true; // Signal that we found and updated
            }
        } else {
            console.log(`checkIfAlreadyBroadcast: "${psbt.name}" (txid: ${txid.substring(0, 12)}...) NOT found on blockchain`);
        }
    } catch (error) {
        console.error(`checkIfAlreadyBroadcast: Error for "${psbt.name}":`, error);
    }
    return false;
}

// Show broadcast confirmation modal
function showBroadcastModal(psbtData) {
    // Parse PSBT to show summary
    let summary = { inputs: 0, outputs: 0, totalOutput: 0, fee: 0 };
    try {
        const psbt = bitcoin.Psbt.fromBase64(psbtData.psbt_data);
        const details = parsePsbtDetails(psbt);
        summary = {
            inputs: details.inputs.length,
            outputs: details.outputs.length,
            totalOutput: details.totalOutput,
            fee: details.fee
        };
    } catch (e) {
        console.error('Failed to parse PSBT for summary:', e);
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'broadcast-modal';
    overlay.innerHTML = `
        <div class="modal-content broadcast-modal">
            <h3>📡 Broadcast Transaction</h3>
            
            <div class="broadcast-summary">
                <h4>Transaction Summary</h4>
                <div class="summary-grid">
                    <div class="summary-item">
                        <span class="summary-label">Name:</span>
                        <span class="summary-value">${escapeHtml(psbtData.name)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Inputs:</span>
                        <span class="summary-value">${summary.inputs}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Outputs:</span>
                        <span class="summary-value">${summary.outputs}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Amount:</span>
                        <span class="summary-value">${formatSatoshis(summary.totalOutput)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Fee:</span>
                        <span class="summary-value">${formatSatoshis(summary.fee)}</span>
                    </div>
                </div>
            </div>
            
            <div class="broadcast-status-container" id="broadcast-status">
                <div class="status-step" data-step="finalize">
                    <span class="status-icon">⏳</span>
                    <span class="status-text">Waiting to start...</span>
                </div>
            </div>
            
            <div class="broadcast-result" id="broadcast-result" style="display: none;"></div>
            
            <div class="broadcast-warning">
                ⚠️ <strong>Warning:</strong> Broadcasting is irreversible! Make sure you've verified the transaction details.
            </div>
            
            <div class="modal-buttons">
                <button class="btn btn-secondary" id="broadcast-cancel">Cancel</button>
                <button class="btn btn-success" id="broadcast-confirm">📡 Broadcast Now</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const cancelBtn = overlay.querySelector('#broadcast-cancel');
    const confirmBtn = overlay.querySelector('#broadcast-confirm');
    
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Broadcasting...';
        cancelBtn.style.display = 'none';
        
        // Remove the warning during broadcast
        overlay.querySelector('.broadcast-warning').style.display = 'none';
        
        // The actual broadcast will update the status container
        await executeBroadcast(psbtData, overlay);
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay && !confirmBtn.disabled) {
            document.body.removeChild(overlay);
        }
    });
    
    return overlay;
}

// Execute the broadcast (called after confirmation)
async function executeBroadcast(psbtData, modal) {
    const statusContainer = modal.querySelector('#broadcast-status');
    const resultContainer = modal.querySelector('#broadcast-result');
    
    // Step 1: Finalize PSBT
    updateBroadcastStatus(statusContainer, 'finalize', 'pending', 'Finalizing PSBT...');
    
    await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX
    
    const finalizeResult = finalizePsbt(psbtData.psbt_data);
    if (!finalizeResult.success) {
        updateBroadcastStatus(statusContainer, 'finalize', 'error', `Failed: ${finalizeResult.error}`);
        showBroadcastResult(resultContainer, false, `Finalization failed: ${finalizeResult.error}`);
        return;
    }
    
    updateBroadcastStatus(statusContainer, 'finalize', 'success', 
        `Finalized! TxID: ${finalizeResult.txid.substring(0, 12)}...`);
    
    const txHex = finalizeResult.hex;
    const txid = finalizeResult.txid;
    
    // Step 2: Broadcast to all endpoints
    addStatusStep(statusContainer, 'broadcast', 'pending', 'Broadcasting to network...');
    
    const broadcastPromises = BROADCAST_ENDPOINTS.map(endpoint => 
        broadcastToEndpoint(endpoint, txHex)
    );
    
    const broadcastResults = await Promise.all(broadcastPromises);
    
    const successfulBroadcasts = broadcastResults.filter(r => r.success);
    const failedBroadcasts = broadcastResults.filter(r => !r.success);
    
    // Show individual endpoint results
    broadcastResults.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        const message = result.success 
            ? 'Accepted' 
            : `Failed: ${result.error.substring(0, 40)}...`;
        addEndpointStatus(statusContainer, result.endpoint, result.success ? 'success' : 'error', 
            `${icon} ${result.endpoint}: ${message}`);
    });
    
    if (successfulBroadcasts.length === 0) {
        // Check if the error indicates the transaction is already in the blockchain
        const alreadyBroadcastErrors = ['already in block chain', 'Transaction already in block chain', 
            'txn-already-in-mempool', 'txn-mempool-conflict', 'already exists', 'already known'];
        
        const isAlreadyBroadcast = failedBroadcasts.some(r => 
            alreadyBroadcastErrors.some(errText => r.error.toLowerCase().includes(errText.toLowerCase()))
        );
        
        if (isAlreadyBroadcast) {
            updateBroadcastStatus(statusContainer, 'broadcast', 'warning', 'Transaction already broadcast!');
            addStatusStep(statusContainer, 'verify', 'pending', 'Checking transaction status...');
            
            // Check if the transaction exists on chain
            const result = await checkConfirmations(txid);
            if (result !== null) {
                const confs = result.confirmations;
                let newStatus = confs === 0 ? 'broadcast' : (confs >= 6 ? 'final' : `confirmed_${confs}`);
                
                updateBroadcastStatus(statusContainer, 'verify', 'success', 
                    confs === 0 ? 'Found in mempool!' : `Found on chain with ${confs} confirmation(s)!`);
                showBroadcastResult(resultContainer, true, txid, `https://mempool.space/tx/${txid}`, false);
                
                // Update the database
                await updatePsbtBroadcastStatus(psbtData.id, txid);
                showToast('Transaction Found! 🔍', confs === 0 ? 'Transaction is in the mempool' : `Transaction has ${confs} confirmation(s)`, 'success');
            } else {
                updateBroadcastStatus(statusContainer, 'verify', 'warning', 'Could not verify transaction status');
                showBroadcastResult(resultContainer, true, txid, `https://mempool.space/tx/${txid}`, true);
                await updatePsbtBroadcastStatus(psbtData.id, txid);
            }
            return;
        }
        
        updateBroadcastStatus(statusContainer, 'broadcast', 'error', 'All broadcasts failed!');
        showBroadcastResult(resultContainer, false, 'Transaction rejected by all endpoints. The transaction may be invalid.');
        return;
    }
    
    updateBroadcastStatus(statusContainer, 'broadcast', 'success', 
        `Accepted by ${successfulBroadcasts.length}/${BROADCAST_ENDPOINTS.length} endpoints`);
    
    // Step 3: Verify propagation
    addStatusStep(statusContainer, 'verify', 'pending', 'Verifying network propagation (3s)...');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const broadcastedToNames = successfulBroadcasts.map(r => r.endpoint);
    const verifyPromises = VERIFY_ENDPOINTS.map(endpoint =>
        verifyOnEndpoint(endpoint, txid, broadcastedToNames)
    );
    
    const verifyResults = await Promise.all(verifyPromises);
    
    const independentConfirmations = verifyResults.filter(r => 
        r.status === 'confirmed' && r.independent
    );
    
    // Show verification results
    verifyResults.forEach(result => {
        if (result.status === 'skipped') return;
        
        const icon = result.status === 'confirmed' ? '🌐' : '⏳';
        const statusText = result.status === 'confirmed' 
            ? 'Seen on network!' 
            : 'Not propagated yet';
        addEndpointStatus(statusContainer, result.endpoint, 
            result.status === 'confirmed' ? 'success' : 'warning',
            `${icon} ${result.endpoint}: ${statusText}`);
    });
    
    // Final result
    if (independentConfirmations.length > 0) {
        updateBroadcastStatus(statusContainer, 'verify', 'success', 
            `✨ Confirmed on ${independentConfirmations.length} independent service(s)!`);
        showBroadcastResult(resultContainer, true, txid, successfulBroadcasts[0].explorerUrl);
        
        await updatePsbtBroadcastStatus(psbtData.id, txid);
        showToast('Broadcast Success! 🎉', 'Transaction confirmed on the network', 'success');
    } else {
        updateBroadcastStatus(statusContainer, 'verify', 'warning', 
            'Accepted but not yet seen on independent services');
        showBroadcastResult(resultContainer, true, txid, successfulBroadcasts[0].explorerUrl, true);
        
        await updatePsbtBroadcastStatus(psbtData.id, txid);
        showToast('Broadcast Sent', 'Transaction accepted, propagating...', 'info');
    }
}

// Helper: Update a status step
function updateBroadcastStatus(container, step, status, message) {
    let stepEl = container.querySelector(`[data-step="${step}"]`);
    if (!stepEl) {
        stepEl = document.createElement('div');
        stepEl.className = 'status-step';
        stepEl.dataset.step = step;
        container.appendChild(stepEl);
    }
    
    const icons = {
        pending: '⏳',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    
    stepEl.className = `status-step ${status}`;
    stepEl.innerHTML = `
        <span class="status-icon">${icons[status] || '•'}</span>
        <span class="status-text">${message}</span>
    `;
}

// Helper: Add a new status step
function addStatusStep(container, step, status, message) {
    const stepEl = document.createElement('div');
    stepEl.className = `status-step ${status}`;
    stepEl.dataset.step = step;
    
    const icons = {
        pending: '⏳',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    
    stepEl.innerHTML = `
        <span class="status-icon">${icons[status] || '•'}</span>
        <span class="status-text">${message}</span>
    `;
    container.appendChild(stepEl);
}

// Helper: Add endpoint-specific status
function addEndpointStatus(container, endpoint, status, message) {
    const endpointEl = document.createElement('div');
    endpointEl.className = `endpoint-status ${status}`;
    endpointEl.innerHTML = `<span class="endpoint-message">${message}</span>`;
    container.appendChild(endpointEl);
}

// Helper: Show final broadcast result
function showBroadcastResult(container, success, txidOrError, explorerUrl = null, pending = false) {
    container.style.display = 'block';
    
    if (success) {
        container.className = 'broadcast-result success';
        container.innerHTML = `
            <div class="result-header">
                ${pending ? '⏳' : '🎉'} ${pending ? 'Transaction Sent!' : 'Transaction Broadcast Successfully!'}
            </div>
            <div class="result-txid">
                <label>Transaction ID:</label>
                <code>${txidOrError}</code>
                <button class="btn btn-sm btn-secondary" onclick="copyToClipboard('${txidOrError}', 'TxID')">📋</button>
            </div>
            ${explorerUrl ? `
            <div class="result-explorer">
                <a href="${explorerUrl}" target="_blank" class="btn btn-primary">
                    🔍 View on Block Explorer
                </a>
            </div>
            ` : ''}
            ${pending ? `
            <div class="result-note">
                Transaction was accepted but not yet confirmed on independent services. 
                This is normal - check the explorer in a few minutes.
            </div>
            ` : ''}
            <button class="btn btn-secondary" onclick="closeBroadcastModal()" style="margin-top: 15px;">Close</button>
        `;
    } else {
        container.className = 'broadcast-result error';
        container.innerHTML = `
            <div class="result-header">❌ Broadcast Failed</div>
            <div class="result-error">${escapeHtml(txidOrError)}</div>
            <button class="btn btn-secondary" onclick="closeBroadcastModal()" style="margin-top: 15px;">Close</button>
        `;
    }
}

// Close broadcast modal
function closeBroadcastModal() {
    const modal = document.getElementById('broadcast-modal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

// Get broadcast status badge HTML based on PSBT status
function getBroadcastStatusBadge(psbt) {
    const status = psbt.status;
    const confirmations = psbt.confirmations || 0;
    const isReady = status === 'ready';
    
    // Status mapping
    if (status === 'broadcast') {
        return `<span class="psbt-status broadcast">📡 Broadcast (Unconfirmed)</span>`;
    } else if (status && status.startsWith('confirmed_')) {
        const confs = parseInt(status.split('_')[1]) || confirmations;
        return `<span class="psbt-status confirming">🟡 ${confs}/6 Confirmations</span>`;
    } else if (status === 'final') {
        return `<span class="psbt-status final">✅ Final (6+ confs)</span>`;
    } else if (isReady) {
        return `<span class="psbt-status ready">✅ Ready</span>`;
    } else {
        return `<span class="psbt-status pending">⏳ Pending</span>`;
    }
}

// Check if PSBT is ready for broadcast (has all required signatures)
function isPsbtReadyForBroadcast(psbtData) {
    if (!bitcoin) return false;
    
    try {
        const psbt = bitcoin.Psbt.fromBase64(psbtData);
        const sigInfo = getSignatureInfo(psbt);
        return sigInfo.isComplete;
    } catch (e) {
        return false;
    }
}

// Export functions to global scope for onclick handlers
// (Required because app.js is loaded as a module)
window.editXpub = editXpub;
window.deleteXpub = deleteXpub;
window.toggleXpubCard = toggleXpubCard;
window.downloadPsbt = downloadPsbt;
window.togglePsbtQR = togglePsbtQR;
window.togglePsbtCard = togglePsbtCard;
window.updatePsbtSignatures = updatePsbtSignatures;
window.viewPsbtDetails = viewPsbtDetails;
window.deletePsbt = deletePsbt;
window.copyDescriptor = copyDescriptor;
window.toggleDescriptorQR = toggleDescriptorQR;
window.downloadDescriptor = downloadDescriptor;
window.copyToClipboard = copyToClipboard;
window.toggleAddressQR = toggleAddressQR;
window.saveDescriptorToServer = saveDescriptorToServer;
window.copyDescriptorById = copyDescriptorById;
window.downloadDescriptorById = downloadDescriptorById;
window.deleteDescriptor = deleteDescriptor;
window.broadcastTransaction = broadcastTransaction;
window.closeBroadcastModal = closeBroadcastModal;
