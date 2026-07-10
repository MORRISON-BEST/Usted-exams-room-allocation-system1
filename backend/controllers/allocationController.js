// backend/controllers/allocationController.js
const XLSX   = require('xlsx');
const multer = require('multer');
const path   = require('path');
const db     = require('../config/db');
const sms    = require('../utils/smsService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.xlsx','.xls','.csv'].includes(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
}).single('studentFile');

// ── Phone number validator ────────────────────────────────────────────────
function looksLikePhone(val) {
  if (!val) return false;
  const clean = String(val).replace(/[\s\-\(\)\+]/g, '');
  // Ghanaian numbers: 0XXXXXXXXX (10 digits) or 233XXXXXXXXX (12 digits)
  // Also accept plain 9-digit numbers
  return /^(0\d{9}|233\d{9}|\d{9,12})$/.test(clean);
}

function looksLikeEmail(val) {
  if (!val) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim());
}

// ── Smart column parser ───────────────────────────────────────────────────
// Strategy:
//  1. Try to match headers by name (case-insensitive regex)
//  2. For any column NOT matched by header, auto-detect by VALUE type
//     (phone number pattern → phone, email pattern → email)
//  3. Positional fallback only if nothing else works
function parseFileBuffer(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' });

  if (rows.length < 2) return [];

  const headerRow = rows[0] || [];
  const col       = {};

  // Step 1: header-name matching
  headerRow.forEach((h, i) => {
    const k = String(h || '').toLowerCase().trim();
    if      (/index|student.?id|index.?no/.test(k))        col.index_number = i;
    else if (/^name$|full.?name|student.?name/.test(k))    col.name         = i;
    else if (/email|e.?mail/.test(k))                      col.email        = i;
    else if (/phone|tel|mobile|contact/.test(k))           col.phone        = i;
    else if (/programme|program|course|dept|faculty/.test(k)) col.programme = i;
  });

  // Step 2: value-based auto-detection on first 5 data rows
  // For columns not yet assigned, scan the values
  const sampleRows = rows.slice(1, 6);
  const totalCols  = Math.max(...rows.slice(1, 6).map(r => (r || []).length));

  for (let i = 0; i < totalCols; i++) {
    // Skip columns already assigned
    if (Object.values(col).includes(i)) continue;

    const samples = sampleRows.map(r => String((r || [])[i] || '').trim()).filter(Boolean);
    if (!samples.length) continue;

    const phoneCount = samples.filter(looksLikePhone).length;
    const emailCount = samples.filter(looksLikeEmail).length;

    if (phoneCount >= Math.ceil(samples.length * 0.5) && col.phone === undefined) {
      col.phone = i;
    } else if (emailCount >= Math.ceil(samples.length * 0.5) && col.email === undefined) {
      col.email = i;
    }
  }

  // Step 3: positional fallback for still-missing columns
  if (col.index_number === undefined) col.index_number = 0;
  if (col.name         === undefined) col.name         = 1;
  // For email and phone: if only one of them is missing, figure out which
  // remaining unassigned columns are candidates
  const assigned = new Set(Object.values(col));
  const remaining = [];
  for (let i = 0; i < totalCols; i++) {
    if (!assigned.has(i)) remaining.push(i);
  }
  if (col.email === undefined && remaining.length > 0) {
    col.email = remaining.shift();
  }
  if (col.phone === undefined && remaining.length > 0) {
    col.phone = remaining.shift();
  }
  if (col.programme === undefined && remaining.length > 0) {
    col.programme = remaining.shift();
  }

  console.log('[Parser] Column map:', col);

  return rows.slice(1)
    .map(r => {
      const index_number = String(r[col.index_number] || '').trim();
      const name         = String(r[col.name]         || 'N/A').trim();
      let   email        = String(r[col.email]         || '').trim();
      let   phone        = String(r[col.phone]         || '').trim();
      const programme    = col.programme !== undefined ? String(r[col.programme] || '').trim() : '';

      // Cross-check: if email looks like a phone and phone is empty, swap them
      if (looksLikePhone(email) && !looksLikePhone(phone)) {
        console.log(`[Parser] Swapping email↔phone for ${index_number}: "${email}" looks like a phone`);
        phone = email;
        email = '';
      }
      // If phone looks like an email, swap
      if (looksLikeEmail(phone) && !looksLikeEmail(email)) {
        email = phone;
        phone = '';
      }

      return { index_number, name, email, phone, programme };
    })
    .filter(s => s.index_number && s.index_number !== 'undefined');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = String(t).split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

// POST /api/allocations
async function allocate(req, res) {
  const examId = parseInt(req.body.exam_id);
  const method = req.body.method === 'random' ? 'random' : 'index';
  if (!examId || !req.file) return res.status(400).json({ error: 'exam_id and studentFile required' });

  try {
    const [exams] = await db.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (!exams.length) return res.status(404).json({ error: 'Exam not found' });
    const exam = exams[0];

    const [rooms] = await db.execute('SELECT * FROM rooms WHERE is_active=1 ORDER BY building, room_number');
    if (!rooms.length) return res.status(400).json({ error: 'No rooms available' });

    let students = parseFileBuffer(req.file.buffer);
    if (!students.length) return res.status(400).json({ error: 'No valid student data in file' });

    console.log(`[Allocation] Parsed ${students.length} students. Sample:`, students[0]);

    const totalCap = rooms.reduce((s, r) => s + r.capacity, 0);
    if (students.length > totalCap) {
      return res.status(400).json({ error: `Not enough capacity. Students: ${students.length}, Capacity: ${totalCap}` });
    }

    if (method === 'random') shuffle(students);
    else students.sort((a, b) => a.index_number.localeCompare(b.index_number, undefined, { numeric: true }));

    // Upsert students
    const studentIds = [];
    for (const s of students) {
      await db.execute(
        `INSERT INTO students (index_number, name, email, phone, programme)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email),
           phone=VALUES(phone), programme=VALUES(programme)`,
        [s.index_number, s.name, s.email || null, s.phone || null, s.programme || null]
      );
      const [rows] = await db.execute('SELECT id FROM students WHERE index_number=?', [s.index_number]);
      studentIds.push({ id: rows[0].id, ...s });
    }

    // Clear old allocations for this exam
    await db.execute('DELETE FROM allocations WHERE exam_id=?', [examId]);

    let idx = 0;
    const resultRooms = [];
    const smsQueue    = [];

    for (const room of rooms) {
      if (idx >= studentIds.length) break;
      const batch = studentIds.slice(idx, idx + room.capacity);
      idx += room.capacity;

      const [ar] = await db.execute(
        'INSERT INTO allocations (exam_id, room_id, allocation_method) VALUES (?,?,?)',
        [examId, room.id, method]
      );
      const allocId = ar.insertId;

      for (let seat = 0; seat < batch.length; seat++) {
        await db.execute(
          'INSERT INTO allocation_students (allocation_id, student_id, seat_number) VALUES (?,?,?)',
          [allocId, batch[seat].id, seat + 1]
        );
        if (batch[seat].phone) {
          smsQueue.push({
            name:         batch[seat].name,
            index_number: batch[seat].index_number,
            phone:        batch[seat].phone,
            exam_name:    exam.name,
            room_number:  room.room_number,
            building:     room.building,
            seat_number:  seat + 1,
            exam_date:    fmtDate(exam.exam_date),
            exam_time:    fmtTime(exam.exam_time),
          });
        }
      }

      resultRooms.push({
        room_number: room.room_number,
        building:    room.building,
        capacity:    room.capacity,
        assigned:    batch.length,
      });
    }

    const smsCount = smsQueue.length;
    console.log(`[SMS] Queued ${smsCount} student SMS messages`);

    // Respond immediately, fire SMS in background
    res.status(201).json({
      message: `${studentIds.length} students allocated (${smsCount} SMS queued)`,
      method, exam, rooms: resultRooms, total: studentIds.length,
    });

    // Fire all SMS non-blocking
    Promise.allSettled(
      smsQueue.map(s =>
        sms.sendStudentAllocation(s)
          .then(r => {
            if (r.success) console.log(`[SMS] ✅ Sent to ${s.name} (${s.index_number}) at ${s.phone}`);
            else           console.warn(`[SMS] ❌ Failed for ${s.name}: ${JSON.stringify(r.response)}`);
          })
          .catch(err => console.error(`[SMS] Error for ${s.name}:`, err.message))
      )
    );

  } catch (err) {
    console.error('Allocation error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error during allocation' });
  }
}

// GET /api/allocations
async function getAll(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT a.id, a.exam_id, a.room_id, a.allocation_method, a.allocated_at,
             e.name AS exam_name, e.code AS exam_code, e.exam_date, e.exam_time,
             r.room_number, r.building, r.capacity,
             COUNT(ast.id) AS student_count
      FROM allocations a
      JOIN exams e ON a.exam_id=e.id
      JOIN rooms r ON a.room_id=r.id
      LEFT JOIN allocation_students ast ON ast.allocation_id=a.id
      GROUP BY a.id
      ORDER BY e.exam_date ASC, e.exam_time ASC, r.room_number ASC
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
}

// GET /api/allocations/:id/students
async function getAllocationStudents(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT s.id, s.index_number, s.name, s.email, s.phone, s.programme, ast.seat_number
      FROM allocation_students ast
      JOIN students s ON ast.student_id=s.id
      WHERE ast.allocation_id=?
      ORDER BY ast.seat_number
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
}

// GET /api/allocations/my — student's own allocations
async function getMyAllocations(req, res) {
  try {
    const [stuRows] = await db.execute('SELECT id FROM students WHERE index_number=?', [req.user.username]);
    if (!stuRows.length) return res.json([]);
    const [rows] = await db.execute(`
      SELECT e.name AS exam_name, e.code AS exam_code, e.exam_date, e.exam_time, e.duration_minutes,
             r.room_number, r.building, ast.seat_number, al.allocation_method
      FROM allocation_students ast
      JOIN allocations al ON ast.allocation_id=al.id
      JOIN exams e ON al.exam_id=e.id
      JOIN rooms r ON al.room_id=r.id
      WHERE ast.student_id=?
      ORDER BY e.exam_date ASC, e.exam_time ASC
    `, [stuRows[0].id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
}

// DELETE /api/allocations/:id
async function remove(req, res) {
  try {
    await db.execute('DELETE FROM allocations WHERE id=?', [req.params.id]);
    res.json({ message: 'Allocation deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
}

module.exports = { upload, allocate, getAll, getAllocationStudents, getMyAllocations, remove };
