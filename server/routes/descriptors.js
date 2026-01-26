const express = require('express');
const router = express.Router();
const { descriptorOperations } = require('../database');

// Helper to get session ID from request (header or query param, default to '0')
function getSessionId(req) {
  return req.headers['x-session-id'] || req.query.session || '0';
}

// Get all descriptors for a session
router.get('/', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const descriptors = await descriptorOperations.getAll(sessionId);
    res.json(descriptors);
  } catch (error) {
    console.error('Error fetching descriptors:', error);
    res.status(500).json({ error: 'Failed to fetch descriptors' });
  }
});

// Get descriptor by ID
router.get('/:id', async (req, res) => {
  try {
    const descriptor = await descriptorOperations.getById(req.params.id);
    if (!descriptor) {
      return res.status(404).json({ error: 'Descriptor not found' });
    }
    res.json(descriptor);
  } catch (error) {
    console.error('Error fetching descriptor:', error);
    res.status(500).json({ error: 'Failed to fetch descriptor' });
  }
});

// Create new descriptor
router.post('/', async (req, res) => {
  try {
    const { name, descriptor, m_required, n_total, first_address } = req.body;
    const sessionId = getSessionId(req);
    
    if (!name || !descriptor || !m_required || !n_total) {
      return res.status(400).json({ error: 'Missing required fields: name, descriptor, m_required, n_total' });
    }
    
    const newDescriptor = await descriptorOperations.create(
      name,
      descriptor,
      m_required,
      n_total,
      first_address || null,
      sessionId
    );
    
    res.status(201).json(newDescriptor);
  } catch (error) {
    console.error('Error creating descriptor:', error);
    res.status(500).json({ error: 'Failed to create descriptor' });
  }
});

// Delete descriptor
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await descriptorOperations.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Descriptor not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting descriptor:', error);
    res.status(500).json({ error: 'Failed to delete descriptor' });
  }
});

module.exports = router;
