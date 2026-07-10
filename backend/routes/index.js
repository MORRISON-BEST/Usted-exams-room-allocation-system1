// backend/routes/index.js
const express = require('express');
const router  = express.Router();
const { authenticate, adminOnly } = require('../middleware/auth');

// ── Auth ──────────────────────────────────────────────────────────────────
const { login, loginValidation, updateSettings } = require('../controllers/authController');
router.post('/auth/login',    loginValidation, login);
router.put ('/auth/settings', authenticate, updateSettings);

// ── Exams ─────────────────────────────────────────────────────────────────
const examCtrl = require('../controllers/examController');
router.get   ('/exams',     authenticate, examCtrl.getAll);
router.post  ('/exams',     authenticate, adminOnly, examCtrl.examValidation, examCtrl.create);
router.delete('/exams/:id', authenticate, adminOnly, examCtrl.remove);

// ── Rooms ─────────────────────────────────────────────────────────────────
const roomCtrl = require('../controllers/roomController');
router.get   ('/rooms',     authenticate, roomCtrl.getAll);
router.post  ('/rooms',     authenticate, adminOnly, roomCtrl.roomValidation, roomCtrl.create);
router.put   ('/rooms/:id', authenticate, adminOnly, roomCtrl.roomValidation, roomCtrl.update);
router.delete('/rooms/:id', authenticate, adminOnly, roomCtrl.remove);

// ── Allocations — /my and /mine MUST come before /:id ────────────────────
const allocCtrl = require('../controllers/allocationController');
router.get   ('/allocations/my',           authenticate, allocCtrl.getMyAllocations);
router.get   ('/allocations',              authenticate, allocCtrl.getAll);
router.get   ('/allocations/:id/students', authenticate, allocCtrl.getAllocationStudents);
router.post  ('/allocations',              authenticate, adminOnly, allocCtrl.upload, allocCtrl.allocate);
router.delete('/allocations/:id',          authenticate, adminOnly, allocCtrl.remove);

// ── Invigilators ──────────────────────────────────────────────────────────
const invCtrl = require('../controllers/invigilatorController');
router.get   ('/invigilators/me',  authenticate, invCtrl.getMe);          // invigilator sees own data
router.get   ('/invigilators',     authenticate, adminOnly, invCtrl.getAll);
router.post  ('/invigilators',     authenticate, adminOnly, invCtrl.invigilatorValidation, invCtrl.create);
router.put   ('/invigilators/:id', authenticate, adminOnly, invCtrl.invigilatorValidation, invCtrl.update);
router.delete('/invigilators/:id', authenticate, adminOnly, invCtrl.remove);

// ── Attendance ────────────────────────────────────────────────────────────
const attCtrl = require('../controllers/attendanceController');
router.post('/attendance',         authenticate, attCtrl.markAttendance);
router.get ('/attendance',         authenticate, attCtrl.getAttendance);
router.get ('/attendance/history', authenticate, attCtrl.getHistory);
router.get ('/attendance/stats',   authenticate, attCtrl.getStats);

// ── Reports ───────────────────────────────────────────────────────────────
const repCtrl = require('../controllers/reportController');
router.get('/reports/dashboard',          authenticate, repCtrl.getDashboardStats);
router.get('/reports/export/exams',       authenticate, repCtrl.exportExams);
router.get('/reports/export/rooms',       authenticate, repCtrl.exportRooms);
router.get('/reports/export/allocations', authenticate, repCtrl.exportAllocations);
router.get('/reports/export/attendance',  authenticate, repCtrl.exportAttendance);

module.exports = router;
