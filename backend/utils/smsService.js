// backend/utils/smsService.js
// Arkesel SMS Gateway — USTED Room Allocation System

const https = require('https');
const http  = require('http');

const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY  || 'SUxPSldaUm5GcXlITk9HREpMRmU';
const SENDER_ID       = process.env.ARKESEL_SENDER_ID || 'NOTEMORE';
const ARKESEL_URL     = 'https://sms.arkesel.com/sms/api';

function normalisePhone(phone) {
  let n = String(phone).trim().replace(/\s+/g, '').replace(/-/g, '');
  if (n.startsWith('+'))  n = n.slice(1);
  if (n.startsWith('0'))  n = '233' + n.slice(1);
  if (!n.startsWith('233')) n = '233' + n;
  return n;
}

async function sendSMS(phone, message) {
  if (!phone) return { success: false, response: 'No phone number' };
  const to  = normalisePhone(phone);
  const url = `${ARKESEL_URL}?${new URLSearchParams({ action:'send-sms', api_key:ARKESEL_API_KEY, to, from:SENDER_ID, sms:message })}`;
  return new Promise(resolve => {
    const client = https;
    client.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          const ok = p.status === 'success' || res.statusCode === 200;
          if (!ok) console.warn('[SMS] Failed:', p);
          resolve({ success: ok, response: p });
        } catch { resolve({ success: false, response: data }); }
      });
    }).on('error', err => { console.error('[SMS]', err.message); resolve({ success: false, response: err.message }); });
  });
}

// ── Templates — USTED only, no AAMUSTED ──────────────────────────────────

function sendInvigilatorWelcome({ name, username, password, phone, rooms = [] }) {
  const roomList = rooms.length ? rooms.join(', ') : 'To be assigned';
  const msg =
`USTED Exam System

Dear ${name},

Your invigilator account is ready.

Username : ${username}
Password : ${password}
Role     : Invigilator
Room(s)  : ${roomList}

Login: http://localhost:5000

Change your password after first login.

NOTEMORE – USTED`;
  return sendSMS(phone, msg);
}

function sendStudentAllocation({ name, index_number, phone, exam_name, room_number, building, seat_number, exam_date, exam_time }) {
  const room = building ? `${room_number} (${building})` : room_number;
  const msg =
`USTED Exam System

Dear ${name},

Your exam room has been allocated.

Index No : ${index_number}
Exam     : ${exam_name}
Room     : ${room}
Seat No  : ${seat_number}
Date     : ${exam_date}
Time     : ${exam_time}

Login: http://localhost:5000
Username & Password: your index number

NOTEMORE – USTED`;
  return sendSMS(phone, msg);
}

function sendPasswordReset({ name, username, new_password, phone }) {
  const msg =
`USTED Exam System

Dear ${name},

Your password has been reset.

Username : ${username}
Password : ${new_password}

Login immediately and change your password.

Login: http://localhost:5000

NOTEMORE – USTED`;
  return sendSMS(phone, msg);
}

module.exports = { sendSMS, sendInvigilatorWelcome, sendStudentAllocation, sendPasswordReset };
