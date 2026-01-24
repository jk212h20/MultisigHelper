const express = require('express');
const router = express.Router();
const { descriptorOperations } = require('../database');

// Get all descriptors
router.get('/', async (req, res) => {
  try {
    const descriptors = await descriptorOperations.getAll();
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
    
    if (!name || !descriptor || !m_required || !n_total) {
      return res.status(400).json({ error: 'Missing required fields: name, descriptor, m_required, n_total' });
    }
    
    const newDescriptor = await descriptorOperations.create(
      name,
      descriptor,
      m_required,
      n_total,
      first_address || null
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
