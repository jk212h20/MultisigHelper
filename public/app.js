// API Base URL
const API_BASE = window.location.origin;

// Bitcoin library reference
const bitcoin = window.bitcoinjs;

// Initialize BIP32 with tiny-secp256k1
const ecc = window.tinysecp256k1;
const BIP32 = window.BIP32Factory(ecc);

// Attach to bitcoin object for compatibility
bitcoin.bip32 = BIP32;

// Global state
let allXpubs = [];
let allPsbts = [];

// DOM Elements
const xpubLabelInput = document.getElementById('xpub-label');
const xpubInput = document.getElementById('xpub-input');
const addXpubBtn = document.getElementById('add-xpub-btn');
const xpubListDiv = document.getElementById('xpub-list');
const xpubSelectionDiv = document.getElementById('xpub-selection');
const mValueInput = document.getElementById('m-value');
const nValueInput = document.getElementById('n-value');
const addressIndexInput = document.getElementById('address-index');
const generateAddressBtn = document.getElementById('generate-address-btn');
const addressOutput = document.getElementById('address-output');
const psbtInput = document.getElementById('psbt-input');
const verifyPsbtBtn = document.getElementById('verify-psbt-btn');
const psbtOutput = document.getElementById('psbt-output');

// PSBT Collaboration Elements
const psbtNameInput = document.getElementById('psbt-name');
const psbtUploadInput = document.getElementById('psbt-upload-input');
const psbtNotesInput = document.getElementById('psbt-notes');
const uploadPsbtBtn = document.getElementById('upload-psbt-btn');
const psbtUploadOutput = document.getElementById('psbt-upload-output');
const psbtListDiv = document.getElementById('psbt-list');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadXpubs();
    loadPsbts();
    setupEventListeners();
    generateHeaderQRCode();
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
    verifyPsbtBtn.addEventListener('click', verifyPsbt);
    uploadPsbtBtn.addEventListener('click', uploadPsbt);
    
    // Update N value when M changes
    mValueInput.addEventListener('change', () => {
        if (parseInt(mValueInput.value) > parseInt(nValueInput.value)) {
            nValueInput.value = mValueInput.value;
        }
    });
}

// XPub Management Functions
async function loadXpubs() {
    try {
        const response = await fetch(`${API_BASE}/api/xpubs`);
        if (!response.ok) throw new Error('Failed to load xpubs');
        
        allXpubs = await response.json();
        displayXpubs();
        updateXpubSelection();
    } catch (error) {
        xpubListDiv.innerHTML = `<p class="error-message">Error loading xpubs: ${error.message}</p>`;
    }
}

function displayXpubs() {
    if (allXpubs.length === 0) {
        xpubListDiv.innerHTML = '<p class="info">No xpubs added yet. Add your first xpub above.</p>';
        return;
    }

    xpubListDiv.innerHTML = allXpubs.map(xpub => `
        <div class="xpub-item">
            <div class="xpub-info">
                <div class="xpub-label">${escapeHtml(xpub.label)}</div>
                <div class="xpub-key">${escapeHtml(xpub.xpub)}</div>
            </div>
            <div class="xpub-actions">
                <button class="btn btn-secondary" onclick="editXpub(${xpub.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteXpub(${xpub.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

function updateXpubSelection() {
    if (allXpubs.length === 0) {
        xpubSelectionDiv.innerHTML = '<p class="info">Add xpubs above to create a multisig wallet</p>';
        return;
    }

    xpubSelectionDiv.innerHTML = allXpubs.map(xpub => `
        <div class="xpub-checkbox">
            <input type="checkbox" id="select-${xpub.id}" value="${xpub.id}" data-xpub="${escapeHtml(xpub.xpub)}">
            <label for="select-${xpub.id}">${escapeHtml(xpub.label)}</label>
        </div>
    `).join('');
}

async function addXpub() {
    const label = xpubLabelInput.value.trim();
    const xpub = xpubInput.value.trim();

    if (!label || !xpub) {
        alert('Please enter both label and xpub');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/xpubs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, xpub })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add xpub');
        }

        xpubLabelInput.value = '';
        xpubInput.value = '';
        await loadXpubs();
        alert('XPub added successfully!');
    } catch (error) {
        alert(`Error: ${error.message}`);
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
        alert('XPub updated successfully!');
    } catch (error) {
        alert(`Error: ${error.message}`);
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
        alert('XPub deleted successfully!');
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Multisig Address Generation
function generateAddress() {
    try {
        // Get selected xpubs
        const checkboxes = document.querySelectorAll('#xpub-selection input[type="checkbox"]:checked');
        const selectedXpubs = Array.from(checkboxes).map(cb => cb.dataset.xpub);

        const m = parseInt(mValueInput.value);
        const n = parseInt(nValueInput.value);
        const index = parseInt(addressIndexInput.value);

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
    
    addressOutput.className = 'output success';
    addressOutput.innerHTML = `
        <h3 class="success-message">✅ Wallet Descriptor Generated</h3>
        
        <div class="address-display">
            <strong>Configuration:</strong> ${m}-of-${n} Multisig<br>
            <strong>Type:</strong> Native Segwit (P2WSH)
        </div>
        
        <div class="wallet-descriptor">
            <strong>Wallet Descriptor:</strong>
            <div class="descriptor-value" id="descriptor-text">${escapeHtml(descriptor)}</div>
            <div style="margin-top: 10px;">
                <button class="btn btn-secondary" onclick="copyDescriptor()">📋 Copy Descriptor</button>
                <button class="btn btn-secondary" onclick="toggleDescriptorQR('${descriptorQRId}')">📱 Toggle QR</button>
            </div>
            <div id="${descriptorQRId}" class="descriptor-qr" style="display: none; margin-top: 15px; text-align: center;"></div>
        </div>
        
        <div class="wallet-descriptor">
            <strong>Selected XPubs (${xpubs.length}):</strong>
            ${xpubs.map((xpub, i) => {
                const shortXpub = xpub.substring(0, 20) + '...' + xpub.substring(xpub.length - 20);
                return `<div class="derivation-path">${i + 1}. ${shortXpub}</div>`;
            }).join('')}
        </div>

        <p style="margin-top: 15px; color: #155724;">
            ℹ️ Import this descriptor into Sparrow Wallet, Bitcoin Core, or other compatible software to generate addresses and manage your multisig wallet.
        </p>
    `;
    
    // Store descriptor for later use
    window.currentDescriptor = descriptor;
    window.currentDescriptorQRId = descriptorQRId;
}

// Generate wallet descriptor with fingerprints
function generateWalletDescriptor(m, xpubs) {
    try {
        const descriptorParts = xpubs.map(xpubStr => {
            const node = bitcoin.bip32.fromBase58(xpubStr);
            const fingerprint = node.fingerprint.toString('hex');
            return `[${fingerprint}/84h/0h/0h]${xpubStr}/0/*`;
        });
        
        return `wsh(sortedmulti(${m},${descriptorParts.join(',')}))#checksum`;
    } catch (e) {
        return `wsh(sortedmulti(${m},${xpubs.map(x => x + '/0/*').join(',')}))`;
    }
}

// Copy descriptor to clipboard
function copyDescriptor() {
    const text = window.currentDescriptor;
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ Descriptor copied to clipboard!');
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('✅ Descriptor copied to clipboard!');
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

// PSBT Verification
function verifyPsbt() {
    try {
        const psbtString = psbtInput.value.trim();
        
        if (!psbtString) {
            throw new Error('Please enter a PSBT');
        }

        // Try to parse PSBT
        let psbt;
        try {
            // Try base64 first
            psbt = bitcoin.Psbt.fromBase64(psbtString);
        } catch (e) {
            try {
                // Try hex
                psbt = bitcoin.Psbt.fromHex(psbtString);
            } catch (e2) {
                throw new Error('Invalid PSBT format. Use base64 or hex encoding.');
            }
        }

        // Extract transaction info
        const tx = psbt.extractTransaction(true); // true = don't finalize
        
        displayPsbtResult(psbt, tx);

    } catch (error) {
        psbtOutput.className = 'output error';
        psbtOutput.innerHTML = `<p class="error-message">Error: ${escapeHtml(error.message)}</p>`;
    }
}

function displayPsbtResult(psbt, tx) {
    const inputs = psbt.data.inputs.map((input, i) => {
        const txInput = tx.ins[i];
        return {
            txid: txInput.hash.reverse().toString('hex'),
            vout: txInput.index,
            value: input.witnessUtxo ? input.witnessUtxo.value : 'Unknown'
        };
    });

    const outputs = tx.outs.map((output, i) => {
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

    psbtOutput.className = 'output success';
    psbtOutput.innerHTML = `
        <h3 class="success-message">✅ PSBT Parsed Successfully</h3>
        
        <div class="psbt-details">
            <div class="tx-info">
                <h4>Transaction ID:</h4>
                <div class="tx-item">${tx.getId()}</div>
            </div>

            <div class="tx-info">
                <h4>Inputs (${inputs.length}):</h4>
                ${inputs.map((inp, i) => `
                    <div class="tx-item">
                        #${i}: ${inp.txid}:${inp.vout}<br>
                        Value: ${formatSatoshis(inp.value)}
                    </div>
                `).join('')}
            </div>

            <div class="tx-info">
                <h4>Outputs (${outputs.length}):</h4>
                ${outputs.map((out, i) => `
                    <div class="tx-item">
                        #${i}: ${out.address}<br>
                        Value: ${formatSatoshis(out.value)}
                    </div>
                `).join('')}
            </div>

            <div class="tx-info">
                <h4>Summary:</h4>
                <div class="tx-item">
                    Total Input: ${formatSatoshis(totalInput)}<br>
                    Total Output: ${formatSatoshis(totalOutput)}<br>
                    Fee: ${formatSatoshis(fee)} (${fee > 0 ? ((fee / totalInput) * 100).toFixed(2) : 0}%)
                </div>
            </div>
        </div>

        <p style="margin-top: 15px; color: #155724;">
            ⚠️ Verify all details carefully before signing this transaction!
        </p>
    `;
}

// PSBT Collaboration Functions
async function loadPsbts() {
    try {
        const response = await fetch(`${API_BASE}/api/psbts`);
        if (!response.ok) throw new Error('Failed to load PSBTs');
        
        allPsbts = await response.json();
        displayPsbts();
    } catch (error) {
        psbtListDiv.innerHTML = `<p class="error-message">Error loading PSBTs: ${error.message}</p>`;
    }
}

function displayPsbts() {
    if (allPsbts.length === 0) {
        psbtListDiv.innerHTML = '<p class="info">No PSBTs uploaded yet. Upload your first PSBT above.</p>';
        return;
    }

    psbtListDiv.innerHTML = allPsbts.map(psbt => {
        const progressPercent = (psbt.signatures_count / psbt.m_required) * 100;
        const isReady = psbt.status === 'ready';
        
        return `
            <div class="psbt-item status-${psbt.status}">
                <div class="psbt-header">
                    <div class="psbt-title">
                        <div class="psbt-name">${escapeHtml(psbt.name)}</div>
                        <div class="psbt-meta">
                            ${psbt.m_required}-of-${psbt.n_total} Multisig • 
                            Created ${new Date(psbt.created_at).toLocaleDateString()}
                        </div>
                    </div>
                    <span class="psbt-status ${psbt.status}">
                        ${isReady ? '✅ Ready' : '⏳ Pending'}
                    </span>
                </div>
                
                <div class="psbt-progress">
                    <strong>Signatures:</strong> ${psbt.signatures_count} of ${psbt.m_required} required
                    <div class="psbt-progress-bar">
                        <div class="psbt-progress-fill ${isReady ? 'complete' : ''}" 
                             style="width: ${progressPercent}%"></div>
                    </div>
                </div>
                
                ${psbt.notes ? `<div class="psbt-notes">${escapeHtml(psbt.notes)}</div>` : ''}
                
                <div class="psbt-actions">
                    <button class="btn btn-info" onclick="downloadPsbt(${psbt.id})">📥 Download</button>
                    <button class="btn btn-info" onclick="togglePsbtQR(${psbt.id}, '${escapeHtml(psbt.psbt_data)}')">📱 QR Code</button>
                    <button class="btn btn-success" onclick="updatePsbtSignatures(${psbt.id})">✍️ Add Signature</button>
                    <button class="btn btn-secondary" onclick="viewPsbtDetails(${psbt.id})">👁️ View Details</button>
                    <button class="btn btn-danger" onclick="deletePsbt(${psbt.id})">🗑️ Delete</button>
                </div>
                <div id="psbt-qr-${psbt.id}" class="psbt-qr-container" style="display: none; margin-top: 15px; text-align: center; padding: 20px; background: white; border-radius: 8px;"></div>
            </div>
        `;
    }).join('');
}

async function uploadPsbt() {
    const name = psbtNameInput.value.trim();
    const psbtString = psbtUploadInput.value.trim();
    const notes = psbtNotesInput.value.trim();

    if (!name || !psbtString) {
        psbtUploadOutput.className = 'output error';
        psbtUploadOutput.innerHTML = '<p class="error-message">Please enter both name and PSBT</p>';
        return;
    }

    try {
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

        // Count signatures and determine M-of-N
        const signaturesCount = countPsbtSignatures(psbt);
        
        // Try to determine M-of-N from witnessScript
        let mRequired = 2, nTotal = 3; // defaults
        if (psbt.data.inputs[0] && psbt.data.inputs[0].witnessScript) {
            const result = extractMultisigInfo(psbt.data.inputs[0].witnessScript);
            if (result) {
                mRequired = result.m;
                nTotal = result.n;
            }
        }

        // Upload to server
        const response = await fetch(`${API_BASE}/api/psbts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                psbt_data: psbt.toBase64(),
                m_required: mRequired,
                n_total: nTotal,
                signatures_count: signaturesCount,
                notes: notes || null
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to upload PSBT');
        }

        // Clear form
        psbtNameInput.value = '';
        psbtUploadInput.value = '';
        psbtNotesInput.value = '';
        
        // Show success
        psbtUploadOutput.className = 'output success';
        psbtUploadOutput.innerHTML = `
            <p class="success-message">✅ PSBT uploaded successfully!</p>
            <p>Signatures: ${signaturesCount} of ${mRequired}</p>
        `;

        // Reload list
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
        
        alert('PSBT downloaded successfully!');
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function updatePsbtSignatures(id) {
    const newPsbtString = prompt('Paste the newly signed PSBT (base64 or hex):');
    if (!newPsbtString) return;

    try {
        // Parse the new PSBT
        let newPsbt;
        try {
            newPsbt = bitcoin.Psbt.fromBase64(newPsbtString.trim());
        } catch (e) {
            try {
                newPsbt = bitcoin.Psbt.fromHex(newPsbtString.trim());
            } catch (e2) {
                throw new Error('Invalid PSBT format');
            }
        }

        // Count signatures
        const signaturesCount = countPsbtSignatures(newPsbt);

        // Update on server
        const response = await fetch(`${API_BASE}/api/psbts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                psbt_data: newPsbt.toBase64(),
                signatures_count: signaturesCount
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update PSBT');
        }

        await loadPsbts();
        alert('PSBT updated successfully!');
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function viewPsbtDetails(id) {
    try {
        const response = await fetch(`${API_BASE}/api/psbts/${id}`);
        if (!response.ok) throw new Error('Failed to fetch PSBT');
        
        const psbtData = await response.json();
        
        // Parse and display in the verification section
        psbtInput.value = psbtData.psbt_data;
        verifyPsbt();
        
        // Scroll to verification section
        document.getElementById('psbt-output').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deletePsbt(id) {
    if (!confirm('Are you sure you want to delete this PSBT?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/psbts/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete PSBT');

        await loadPsbts();
        alert('PSBT deleted successfully!');
    } catch (error) {
        alert(`Error: ${error.message}`);
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
