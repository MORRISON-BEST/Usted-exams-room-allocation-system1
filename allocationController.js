// backend/controllers/examController.js
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

const examValidation = [
  body('name').trim().notEmpty().withMessage('Exam name required'),
  body('code').trim().notEmpty().withMessage('Exam code required'),
  body('exam_date').isDate().withMessage('Valid date required'),
  body('exam_time').notEmpty().withMessage('Time required'),
  body('duration_minutes').isInt({ min: 1 }).withMessage('Duration required'),
  body('total_students').isInt({ min: 1 }).withMessage('Total students required'),
];

// GET /api/exams
async function getAll(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT e.*, u.name AS created_by_name
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.exam_date ASC, e.exam_time ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/exams
async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, code, exam_date, exam_time, duration_minutes, total_students } = req.body;
  try {
    const [result] = await db.execute(
      `INSERT INTO exams (name, code, exam_date, exam_time, duration_minutes, total_students, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, code.toUpperCase(), exam_date, exam_time, duration_minutes, total_students, req.user.id]
    );
    const [rows] = await db.execute('SELECT * FROM exams WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Exam code already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/exams/:id
async function remove(req, res) {
  try {
    await db.execute('DELETE FROM exams WHERE id = ?', [req.params.id]);
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getAll, create, remove, examValidation };
