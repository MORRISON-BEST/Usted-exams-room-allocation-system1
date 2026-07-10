// backend/controllers/attendanceController.js
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

// POST /api/attendance  – mark multiple students at once
async function markAttendance(req, res) {
  const { exam_id, session_date, records } = req.body;
  // records: [{ student_id, status }]
  if (!exam_id || !session_date || !Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'exam_id, session_date, and records[] required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const r of records) {
      await conn.execute(
        `INSERT INTO attendance (exam_id, student_id, status, session_date, marked_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
        [exam_id, r.student_id, r.status, session_date, req.user.id]
      );
    }
    await conn.commit();
    res.json({ message: `${records.length} attendance records saved` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

// GET /api/attendance?exam_id=&session_date=
async function getAttendance(req, res) {
  const { exam_id, session_date } = req.query;
  if (!exam_id) return res.status(400).json({ error: 'exam_id required' });

  try {
    let sql = `
      SELECT a.id, a.status, a.session_date,
             s.id AS student_id, s.index_number, s.name, s.email,
             r.room_number,
             u.name AS marked_by_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      LEFT JOIN allocation_students ast ON ast.student_id = s.id
      LEFT JOIN allocations al ON ast.allocation_id = al.id AND al.exam_id = a.exam_id
      LEFT JOIN rooms r ON al.room_id = r.id
      LEFT JOIN users u ON a.marked_by = u.id
      WHERE a.exam_id = ?
    `;
    const params = [exam_id];
    if (session_date) { sql += ' AND a.session_date = ?'; params.push(session_date); }
    sql += ' ORDER BY s.name';

    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/attendance/history  – full history for reports
async function getHistory(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT a.id, a.status, a.session_date,
             s.index_number, s.name AS student_name,
             e.name AS exam_name, e.code AS exam_code,
             r.room_number, u.name AS marked_by_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      JOIN exams    e ON a.exam_id    = e.id
      LEFT JOIN allocation_students ast ON ast.student_id = s.id
      LEFT JOIN allocations al ON ast.allocation_id = al.id AND al.exam_id = a.exam_id
      LEFT JOIN rooms r ON al.room_id = r.id
      LEFT JOIN users u ON a.marked_by = u.id
      ORDER BY a.session_date DESC, e.name, s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/attendance/stats  – summary counts for dashboard
async function getStats(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT
        SUM(status = 'present') AS present_count,
        SUM(status = 'absent')  AS absent_count,
        SUM(status = 'late')    AS late_count,
        COUNT(*)                AS total
      FROM attendance
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { markAttendance, getAttendance, getHistory, getStats };
