// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db  = require('../config/db');
const sms = require('../utils/smsService');

const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
];

// POST /api/auth/login
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;

  try {
    // 1) Check users table (admin + invigilators)
    const [userRows] = await db.execute(
      'SELECT id, name, username, password_hash, role, is_active FROM users WHERE username = ?',
      [username.trim()]
    );
    if (userRows.length > 0) {
      const user = userRows[0];
      if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );
      return res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
    }

    // 2) Check students table — index number = username = password
    const [stuRows] = await db.execute(
      'SELECT id, name, index_number FROM students WHERE index_number = ?',
      [username.trim()]
    );
    if (stuRows.length > 0) {
      const student = stuRows[0];
      if (password !== student.index_number) return res.status(401).json({ error: 'Invalid credentials' });
      const token = jwt.sign(
        { id: student.id, username: student.index_number, role: 'student', name: student.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );
      return res.json({ token, user: { id: student.id, name: student.name, username: student.index_number, role: 'student' } });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/auth/settings — change username or password for logged-in users
async function updateSettings(req, res) {
  const { new_username, current_password, new_password } = req.body;
  const userId = req.user.id;

  try {
    // Students cannot use this endpoint (their "password" is their index number)
    if (req.user.role === 'student') {
      return res.status(403).json({ error: 'Students cannot change credentials here' });
    }

    const [rows] = await db.execute(
      'SELECT id, name, username, password_hash, phone FROM users WHERE id = ?', [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];

    if (!current_password) return res.status(400).json({ error: 'Current password is required' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const updates = [];
    const params  = [];

    if (new_username && new_username.trim() !== user.username) {
      const [existing] = await db.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?', [new_username.trim(), userId]
      );
      if (existing.length) return res.status(400).json({ error: 'Username already taken' });
      updates.push('username = ?');
      params.push(new_username.trim());
    }

    if (new_password) {
      if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
      const hash = await bcrypt.hash(new_password, 12);
      updates.push('password_hash = ?');
      params.push(hash);

      // SMS notification for password change
      if (user.phone) {
        const uname = (new_username && new_username.trim()) || user.username;
        sms.sendPasswordReset({ name: user.name, username: uname, new_password, phone: user.phone })
          .then(r => { if (!r.success) console.warn('[SMS] Settings password SMS failed:', r.response); })
          .catch(err => console.error('[SMS]', err.message));
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(userId);
    await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updated] = await db.execute('SELECT id, name, username, role FROM users WHERE id = ?', [userId]);
    const u = updated[0];
    const newToken = jwt.sign(
      { id: u.id, username: u.username, role: u.role, name: u.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    return res.json({
      message: 'Settings updated successfully',
      token: newToken,
      user: { id: u.id, name: u.name, username: u.username, role: u.role },
    });
  } catch (err) {
    console.error('Settings error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { login, loginValidation, updateSettings };
