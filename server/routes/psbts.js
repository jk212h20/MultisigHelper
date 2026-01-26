const express = require('express');
const router = express.Router();
const { psbtOperations } = require('../database');

// Helper to get session ID from request (header or query param, default to '0')
function getSessionId(req) {
  return req.headers['x-session-id'] || req.query.session || '0';
}

// GET /api/psbts - List all PSBTs for a session
router.get('/', async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const psbts = await psbtOperations.getAll(sessionId);
    res.json(psbts);
  } catch (error) {
    console.error('Error fetching PSBTs:', error);
    res.status(500).json({ error: 'Failed to fetch PSBTs' });
  }
});

// GET /api/psbts/:id - Get single PSBT
router.get('/:id', async (req, res) => {
  try {
    const psbt = await psbtOperations.getById(req.params.id);
    if (!psbt) {
      return res.status(404).json({ error: 'PSBT not found' });
    }
    res.json(psbt);
  } catch (error) {
    console.error('Error fetching PSBT:', error);
    res.status(500).json({ error: 'Failed to fetch PSBT' });
  }
});

// POST /api/psbts - Create new PSBT
router.post('/', async (req, res) => {
  try {
    const { name, psbt_data, m_required, n_total, signatures_count, notes } = req.body;
    const sessionId = getSessionId(req);

    // Validate input
    if (!name || !psbt_data || !m_required || !n_total || signatures_count === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (m_required > n_total) {
      return res.status(400).json({ error: 'M cannot be greater than N' });
    }

    const newPsbt = await psbtOperations.create(
      name,
      psbt_data,
      m_required,
      n_total,
      signatures_count,
      notes,
      sessionId
    );
    res.status(201).json(newPsbt);
  } catch (error) {
    console.error('Error creating PSBT:', error);
    res.status(500).json({ error: 'Failed to create PSBT' });
  }
});

// PUT /api/psbts/:id - Update PSBT with new signatures
router.put('/:id', async (req, res) => {
  try {
    const { psbt_data, signatures_count } = req.body;

    if (!psbt_data || signatures_count === undefined) {
      return res.status(400).json({ error: 'PSBT data and signatures count are required' });
    }

    const updatedPsbt = await psbtOperations.update(req.params.id, psbt_data, signatures_count);
    res.json(updatedPsbt);
  } catch (error) {
    console.error('Error updating PSBT:', error);
    if (error.message === 'PSBT not found') {
      return res.status(404).json({ error: 'PSBT not found' });
    }
    res.status(500).json({ error: 'Failed to update PSBT' });
  }
});

// PATCH /api/psbts/:id/notes - Update PSBT notes
router.patch('/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;

    const updatedPsbt = await psbtOperations.updateNotes(req.params.id, notes);
    if (!updatedPsbt) {
      return res.status(404).json({ error: 'PSBT not found' });
    }
    res.json(updatedPsbt);
  } catch (error) {
    console.error('Error updating PSBT notes:', error);
    res.status(500).json({ error: 'Failed to update PSBT notes' });
  }
});

// PATCH /api/psbts/:id/broadcast - Update PSBT broadcast status
router.patch('/:id/broadcast', async (req, res) => {
  try {
    const { txid, status, confirmations } = req.body;

    if (!txid) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Status should be one of: 'broadcast', 'confirmed_1' through 'confirmed_6', 'final'
    const validStatuses = ['broadcast', 'confirmed_1', 'confirmed_2', 'confirmed_3', 
                          'confirmed_4', 'confirmed_5', 'confirmed_6', 'final'];
    const newStatus = status || 'broadcast';
    
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updatedPsbt = await psbtOperations.updateBroadcastStatus(
      req.params.id, 
      txid, 
      newStatus, 
      confirmations || 0
    );
    
    if (!updatedPsbt) {
      return res.status(404).json({ error: 'PSBT not found' });
    }
    res.json(updatedPsbt);
  } catch (error) {
    console.error('Error updating PSBT broadcast status:', error);
    res.status(500).json({ error: 'Failed to update PSBT broadcast status' });
  }
});

// DELETE /api/psbts/:id - Delete PSBT
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await psbtOperations.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'PSBT not found' });
    }
    res.json({ message: 'PSBT deleted successfully' });
  } catch (error) {
    console.error('Error deleting PSBT:', error);
    res.status(500).json({ error: 'Failed to delete PSBT' });
  }
});

module.exports = router;
