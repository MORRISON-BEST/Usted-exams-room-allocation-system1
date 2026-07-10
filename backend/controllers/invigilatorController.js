// backend/controllers/invigilatorController.js
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db  = require('../config/db');
const sms = require('../utils/smsService');

const SALT_ROUNDS = 12;

const invigilatorValidation = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').optional().isLength({ min:6 }).withMessage('Password min 6 chars'),
  body('email').optional().isEmail().withMessage('Invalid email'),
];

// Shared query for invigilator data with full room + building details
const INVIG_QUERY = `
  SELECT u.id, u.name, u.username, u.email, u.phone, u.is_active,
         GROUP_CONCAT(
           CASE WHEN r.building IS NOT NULL AND r.building != ''
             THEN CONCAT(r.room_number, ' — ', r.building)
             ELSE r.room_number
           END
           ORDER BY r.room_number SEPARATOR ', '
         ) AS assigned_rooms,
         GROUP_CONCAT(ir.room_id ORDER BY r.room_number SEPARATOR ',') AS room_ids
  FROM users u
  LEFT JOIN invigilator_rooms ir ON ir.user_id = u.id
  LEFT JOIN rooms r ON ir.room_id = r.id
  WHERE u.role = 'invigilator'
  GROUP BY u.id
  ORDER BY u.name
`;

// GET /api/invigilators  — admin sees all
async function getAll(req, res) {
  try {
    const [users] = await db.execute(INVIG_QUERY);
    res.json(users);
  } catch (err) { console.error(err); res.status(500).json({ error:'Server error' }); }
}

// GET /api/invigilators/me  — invigilator sees their own profile + rooms
async function getMe(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.name, u.username, u.email, u.phone,
             r.id AS room_id, r.room_number, r.building, r.capacity
      FROM users u
      LEFT JOIN invigilator_rooms ir ON ir.user_id = u.id
      LEFT JOIN rooms r ON ir.room_id = r.id
      WHERE u.id = ?
      ORDER BY r.room_number
    `, [req.user.id]);

    if (!rows.length) return res.status(404).json({ error:'Not found' });

    const user = {
      id:       rows[0].id,
      name:     rows[0].name,
      username: rows[0].username,
      email:    rows[0].email,
      phone:    rows[0].phone,
      rooms:    rows.filter(r => r.room_id).map(r => ({
        id:          r.room_id,
        room_number: r.room_number,
        building:    r.building,
        capacity:    r.capacity,
      })),
    };
    res.json(user);
  } catch (err) { console.error(err); res.status(500).json({ error:'Server error' }); }
}

// POST /api/invigilators
async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, username, password, email, phone, room_ids } = req.body;
  if (!password) return res.status(400).json({ error:'Password required' });

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await db.execute(
      `INSERT INTO users (name, username, password_hash, email, phone, role) VALUES (?,?,?,?,?,'invigilator')`,
      [name, username.trim(), hash, email||null, phone||null]
    );
    const uid = result.insertId;

    const roomNames = [];
    if (Array.isArray(room_ids) && room_ids.length) {
      for (const rid of room_ids) {
        await db.execute('INSERT IGNORE INTO invigilator_rooms (user_id, room_id) VALUES (?,?)', [uid, rid]);
      }
      const ph = room_ids.map(() => '?').join(',');
      const [roomRows] = await db.execute(`SELECT room_number, building FROM rooms WHERE id IN (${ph})`, room_ids);
      roomRows.forEach(r => roomNames.push(r.building ? `${r.room_number} — ${r.building}` : r.room_number));
    }

    // Send welcome SMS immediately
    if (phone) {
      sms.sendInvigilatorWelcome({ name, username: username.trim(), password, phone, rooms: roomNames })
        .then(r => { console.log(r.success ? `[SMS] Sent to invigilator ${name}` : `[SMS] Failed: ${JSON.stringify(r.response)}`); })
        .catch(err => console.error('[SMS]', err.message));
    }

    res.status(201).json({ message:'Invigilator created', id:uid });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error:'Username already exists' });
    console.error(err); res.status(500).json({ error:'Server error' });
  }
}

// PUT /api/invigilators/:id
async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, username, password, email, phone, room_ids } = req.body;
  const uid = req.params.id;

  try {
    const [existing] = await db.execute('SELECT name, phone FROM users WHERE id=?', [uid]);
    const prev = existing[0];

    if (password) {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await db.execute(
        'UPDATE users SET name=?, username=?, password_hash=?, email=?, phone=? WHERE id=?',
        [name, username.trim(), hash, email||null, phone||null, uid]
      );
      const notifyPhone = phone || prev?.phone;
      if (notifyPhone) {
        sms.sendPasswordReset({ name, username: username.trim(), new_password: password, phone: notifyPhone })
          .then(r => { console.log(r.success ? `[SMS] Password reset sent to ${name}` : `[SMS] Failed: ${JSON.stringify(r.response)}`); })
          .catch(err => console.error('[SMS]', err.message));
      }
    } else {
      await db.execute(
        'UPDATE users SET name=?, username=?, email=?, phone=? WHERE id=?',
        [name, username.trim(), email||null, phone||null, uid]
      );
    }

    // Re-assign rooms
    await db.execute('DELETE FROM invigilator_rooms WHERE user_id=?', [uid]);
    const roomNames = [];
    if (Array.isArray(room_ids) && room_ids.length) {
      for (const rid of room_ids) {
        await db.execute('INSERT IGNORE INTO invigilator_rooms (user_id, room_id) VALUES (?,?)', [uid, rid]);
      }
      const ph = room_ids.map(() => '?').join(',');
      const [roomRows] = await db.execute(`SELECT room_number, building FROM rooms WHERE id IN (${ph})`, room_ids);
      roomRows.forEach(r => roomNames.push(r.building ? `${r.room_number} — ${r.building}` : r.room_number));
    }

    res.json({ message:'Invigilator updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error:'Username already exists' });
    console.error(err); res.status(500).json({ error:'Server error' });
  }
}

// DELETE /api/invigilators/:id
async function remove(req, res) {
  try {
    await db.execute("DELETE FROM users WHERE id=? AND role='invigilator'", [req.params.id]);
    res.json({ message:'Invigilator deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error:'Server error' }); }
}

module.exports = { getAll, getMe, create, update, remove, invigilatorValidation };
