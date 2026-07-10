// backend/controllers/reportController.js
// Generates Excel exports for every section
const XLSX = require('xlsx');
const db   = require('../config/db');

async function exportExams(req, res) {
  const [rows] = await db.execute(
    'SELECT code, name, exam_date, exam_time, duration_minutes, total_students FROM exams ORDER BY exam_date'
  );
  const data = [['Code','Exam Name','Date','Time','Duration (min)','Total Students'],
    ...rows.map(r => [r.code, r.name, r.exam_date, r.exam_time, r.duration_minutes, r.total_students])];
  sendExcel(res, data, 'Exams', 'USTED_Exams_Report.xlsx');
}

async function exportRooms(req, res) {
  const [rows] = await db.execute(
    'SELECT room_number, building, capacity FROM rooms WHERE is_active=1 ORDER BY building, room_number'
  );
  const data = [['Room Number','Building','Capacity'],
    ...rows.map(r => [r.room_number, r.building || 'N/A', r.capacity])];
  sendExcel(res, data, 'Rooms', 'USTED_Rooms_Report.xlsx');
}

async function exportAllocations(req, res) {
  const [rows] = await db.execute(`
    SELECT e.code, e.name AS exam_name, r.room_number, r.building,
           s.index_number, s.name AS student_name, s.email, s.phone, s.programme,
           ast.seat_number, al.allocation_method
    FROM allocation_students ast
    JOIN allocations al ON ast.allocation_id = al.id
    JOIN exams   e  ON al.exam_id  = e.id
    JOIN rooms   r  ON al.room_id  = r.id
    JOIN students s ON ast.student_id = s.id
    ORDER BY e.exam_date, r.room_number, ast.seat_number
  `);
  const data = [['Exam Code','Exam Name','Room','Building','Index No.','Student Name','Email','Phone','Programme','Seat','Method'],
    ...rows.map(r => [r.code, r.exam_name, r.room_number, r.building||'N/A', r.index_number,
      r.student_name, r.email||'', r.phone||'', r.programme||'', r.seat_number, r.allocation_method])];
  sendExcel(res, data, 'Allocations', 'USTED_Allocations_Report.xlsx');
}

async function exportAttendance(req, res) {
  const [rows] = await db.execute(`
    SELECT s.index_number, s.name AS student_name, e.code, e.name AS exam_name,
           a.status, a.session_date, r.room_number, u.name AS marked_by
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    JOIN exams    e ON a.exam_id    = e.id
    LEFT JOIN allocation_students ast ON ast.student_id = s.id
    LEFT JOIN allocations al ON ast.allocation_id = al.id AND al.exam_id = a.exam_id
    LEFT JOIN rooms r ON al.room_id = r.id
    LEFT JOIN users u ON a.marked_by = u.id
    ORDER BY a.session_date DESC, e.name, s.name
  `);
  const data = [['Index No.','Student Name','Exam Code','Exam Name','Status','Date','Room','Marked By'],
    ...rows.map(r => [r.index_number, r.student_name, r.code, r.exam_name,
      r.status, r.session_date, r.room_number||'N/A', r.marked_by||'System'])];
  sendExcel(res, data, 'Attendance', 'USTED_Attendance_Report.xlsx');
}

function sendExcel(res, data, sheetName, fileName) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

// GET /api/reports/dashboard  – aggregated stats for dashboard
async function getDashboardStats(req, res) {
  try {
    const [[examRow]]  = await db.execute('SELECT COUNT(*) AS total FROM exams');
    const [[roomRow]]  = await db.execute('SELECT COUNT(*) AS total FROM rooms WHERE is_active=1');
    const [[allocRow]] = await db.execute('SELECT COUNT(*) AS total FROM allocations');
    const [[stuRow]]   = await db.execute('SELECT COUNT(DISTINCT student_id) AS total FROM allocation_students');
    const [distRows]   = await db.execute(`
      SELECT e.code AS exam_code, e.name AS exam_name, COUNT(ast.id) AS student_count
      FROM exams e
      LEFT JOIN allocations al  ON al.exam_id  = e.id
      LEFT JOIN allocation_students ast ON ast.allocation_id = al.id
      GROUP BY e.id ORDER BY e.exam_date
    `);
    const [attRows] = await db.execute(`
      SELECT SUM(status='present') AS present, SUM(status='absent') AS absent,
             SUM(status='late') AS late FROM attendance
    `);
    const [upcoming] = await db.execute(`
      SELECT e.id, e.name, e.code, e.exam_date, e.exam_time, e.total_students,
             GROUP_CONCAT(DISTINCT r.room_number ORDER BY r.room_number SEPARATOR ', ') AS rooms,
             COUNT(DISTINCT ast.id) AS allocated_count
      FROM exams e
      LEFT JOIN allocations al ON al.exam_id = e.id
      LEFT JOIN rooms r ON al.room_id = r.id
      LEFT JOIN allocation_students ast ON ast.allocation_id = al.id
      WHERE e.exam_date >= CURDATE()
      GROUP BY e.id
      ORDER BY e.exam_date ASC, e.exam_time ASC
      LIMIT 10
    `);

    res.json({
      totals: {
        exams:       examRow.total,
        rooms:       roomRow.total,
        allocations: allocRow.total,
        students:    stuRow.total,
      },
      distribution: distRows,
      attendance:   attRows[0],
      upcoming,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { exportExams, exportRooms, exportAllocations, exportAttendance, getDashboardStats };
