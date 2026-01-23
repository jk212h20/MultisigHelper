const express = require('express');
const cors = require('cors');
const path = require('path');
const xpubsRouter = require('./routes/xpubs');
const psbtsRouter = require('./routes/psbts');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/xpubs', xpubsRouter);
app.use('/api/psbts', psbtsRouter);

// Serve Bitcoin libraries from node_modules (must be before wildcard route)
app.get('/lib/bitcoinjs-lib.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../node_modules/bitcoinjs-lib/dist/bitcoinjs-lib.min.js'));
});
app.get('/lib/bip32.umd.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../node_modules/bip32/dist/bip32.umd.js'));
});
app.get('/lib/tiny-secp256k1.umd.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../node_modules/tiny-secp256k1/dist/tiny-secp256k1.umd.js'));
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`MultisigHelper server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
