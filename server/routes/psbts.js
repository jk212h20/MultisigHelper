const express = require('express');
const router = express.Router();
const { psbtOperations } = require('../database');

// GET /api/psbts - List all PSBTs
router.get('/', async (req, res) => {
  try {
    const psbts = await psbtOperations.getAll();
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
      notes
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
