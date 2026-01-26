const express = require('express');
const router = express.Router();
const { xpubOperations } = require('../database');

// Validate xpub format (basic check)
function isValidXpub(xpub) {
  // Check if it starts with xpub, ypub, or zpub and has reasonable length
  // More permissive to accept various formats from different wallets
  const xpubRegex = /^(xpub|ypub|zpub|Xpub|Ypub|Zpub)[1-9A-HJ-NP-Za-km-z]{70,120}$/;
  return xpubRegex.test(xpub);
}

// Helper to get session ID from request (header or query param, default to '0')
function getSessionId(req) {
  return req.headers['x-session-id'] || req.query.session || '0';
}

// GET /api/xpubs - List all xpubs for a session
router.get('/', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const xpubs = await xpubOperations.getAll(sessionId);
    res.json(xpubs);
  } catch (error) {
    console.error('Error fetching xpubs:', error);
    res.status(500).json({ error: 'Failed to fetch xpubs' });
  }
});

// GET /api/xpubs/:id - Get single xpub
router.get('/:id', async (req, res) => {
  try {
    const xpub = await xpubOperations.getById(req.params.id);
    if (!xpub) {
      return res.status(404).json({ error: 'XPub not found' });
    }
    res.json(xpub);
  } catch (error) {
    console.error('Error fetching xpub:', error);
    res.status(500).json({ error: 'Failed to fetch xpub' });
  }
});

// POST /api/xpubs - Add new xpub
router.post('/', async (req, res) => {
  try {
    const { label, xpub } = req.body;
    const sessionId = getSessionId(req);

    // Validate input
    if (!label || !xpub) {
      return res.status(400).json({ error: 'Label and xpub are required' });
    }

    if (!isValidXpub(xpub)) {
      return res.status(400).json({ error: 'Invalid xpub format' });
    }

    const newXpub = await xpubOperations.create(label.trim(), xpub.trim(), sessionId);
    res.status(201).json(newXpub);
  } catch (error) {
    console.error('Error creating xpub:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'This xpub already exists in this session' });
    }
    res.status(500).json({ error: 'Failed to create xpub' });
  }
});

// PUT /api/xpubs/:id - Update xpub label
router.put('/:id', async (req, res) => {
  try {
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({ error: 'Label is required' });
    }

    const updatedXpub = await xpubOperations.updateLabel(req.params.id, label.trim());
    if (!updatedXpub) {
      return res.status(404).json({ error: 'XPub not found' });
    }

    res.json(updatedXpub);
  } catch (error) {
    console.error('Error updating xpub:', error);
    res.status(500).json({ error: 'Failed to update xpub' });
  }
});

// DELETE /api/xpubs/:id - Delete xpub
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await xpubOperations.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'XPub not found' });
    }
    res.json({ message: 'XPub deleted successfully' });
  } catch (error) {
    console.error('Error deleting xpub:', error);
    res.status(500).json({ error: 'Failed to delete xpub' });
  }
});

module.exports = router;
