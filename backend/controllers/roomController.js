// backend/controllers/roomController.js
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

const roomValidation = [
  body('room_number').trim().notEmpty().withMessage('Room number required'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
];

// GET /api/rooms
async function getAll(req, res) {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM rooms WHERE is_active = 1 ORDER BY building, room_number'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/rooms
async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { room_number, building, capacity } = req.body;
  try {
    const [result] = await db.execute(
      'INSERT INTO rooms (room_number, building, capacity) VALUES (?, ?, ?)',
      [room_number.toUpperCase(), building || null, capacity]
    );
    const [rows] = await db.execute('SELECT * FROM rooms WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Room number already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/rooms/:id
async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { room_number, building, capacity } = req.body;
  try {
    await db.execute(
      'UPDATE rooms SET room_number = ?, building = ?, capacity = ? WHERE id = ?',
      [room_number.toUpperCase(), building || null, capacity, req.params.id]
    );
    const [rows] = await db.execute('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Room number already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/rooms/:id
async function remove(req, res) {
  try {
    await db.execute('UPDATE rooms SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Room removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getAll, create, update, remove, roomValidation };
