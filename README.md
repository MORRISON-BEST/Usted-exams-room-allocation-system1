# USTED Room Allocation System
### Akenten Appiah-Menka University of Skills Training and Entrepreneurial Development

A full-stack web application for managing exam room allocations, student distribution, invigilator assignment, and attendance tracking.

---

## Tech Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Frontend | HTML5, CSS3, Vanilla JS, Chart.js |
| Backend  | Node.js, Express.js         |
| Database | MySQL 8+                    |
| Auth     | JWT + bcrypt                |

---

## Project Structure

```
usted-room-allocation/
├── frontend/
│   ├── index.html          # Main SPA page
│   ├── style.css           # Complete styles (USTED maroon/gold theme)
│   ├── app.js              # Frontend logic — connects to API
│   └── assets/
│       └── usted-logo.png  # USTED logo
│
├── backend/
│   ├── server.js           # Express entry point
│   ├── package.json
│   ├── .env.example        # Copy to .env and fill in values
│   ├── config/
│   │   └── db.js           # MySQL connection pool
│   ├── middleware/
│   │   └── auth.js         # JWT verify + admin guard
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── examController.js
│   │   ├── roomController.js
│   │   ├── allocationController.js
│   │   ├── invigilatorController.js
│   │   ├── attendanceController.js
│   │   └── reportController.js
│   ├── routes/
│   │   └── index.js        # All API routes
│   └── utils/
│       └── seedAdmin.js    # Creates default admin account
│
└── database/
    └── schema.sql          # Full DB schema — run this first
```

---

## Setup Instructions

### Prerequisites
- Node.js v18+
- MySQL 8.0+
- npm

---

### Step 1 — Database Setup

1. Open MySQL and run:
```sql
SOURCE /path/to/database/schema.sql;
```
Or paste the contents of `database/schema.sql` into MySQL Workbench / phpMyAdmin.

---

### Step 2 — Backend Setup

```bash
cd backend
npm install
```

Copy the environment file:
```bash
cp .env.example .env
```

Edit `.env` with your MySQL credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=usted_room_allocation
JWT_SECRET=change_this_to_a_long_random_string
PORT=5000
```

Seed the admin account:
```bash
npm run seed
```
This creates:
- **Username:** `admin`
- **Password:** `Admin@USTED2024`
> ⚠️ Change this password after first login!

---

### Step 3 — Start the Server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

The server runs at: **http://localhost:5000**

---

### Step 4 — Open the App

Open your browser and visit:
```
http://localhost:5000
```

The Express server serves the frontend automatically.

---

## Default Login

| Role  | Username | Password        |
|-------|----------|-----------------|
| Admin | `admin`  | `Admin@USTED2024` |

---

## Features

### Dashboard
- Real-time stat cards (Exams, Rooms, Allocations, Students)
- **Line chart** — student distribution per exam (updates on every allocation)
- **Doughnut chart** — attendance overview (Present / Absent / Late)
- Upcoming exams table with allocation status

### Exams
- Add, view, and delete exams
- Search by name or code

### Rooms
- Add, edit, delete rooms
- Track capacity and building

### Room Allocation
- Upload student list (CSV / Excel: Index, Name, Email, Phone, Programme)
- Choose **By Index Number** (sorted A→Z) or **Random** allocation method
- Automatically distributes students across available rooms
- Shows allocation summary card after completion
- View detailed student list per allocation room

### Invigilators
- Create accounts with username/password (bcrypt hashed)
- Assign specific rooms to each invigilator
- Edit, delete invigilators

### Attendance
- Select exam → loads allocated students per room
- Mark each student: Present / Absent / Late
- Live counter for today's session
- Full attendance history table

### Reports & Analytics
- Export to Excel: Exams, Rooms, Allocations, Attendance

---

## Student File Format

Upload a CSV or Excel file with these columns:

| Column 1    | Column 2 | Column 3 | Column 4 | Column 5    |
|-------------|----------|----------|----------|-------------|
| Index Number | Name     | Email    | Phone    | Programme   |

Row 1 is treated as a header and skipped.

---

## API Endpoints

| Method | Path                              | Auth  | Description              |
|--------|-----------------------------------|-------|--------------------------|
| POST   | /api/auth/login                   | None  | Login                    |
| GET    | /api/exams                        | JWT   | List exams               |
| POST   | /api/exams                        | Admin | Create exam              |
| DELETE | /api/exams/:id                    | Admin | Delete exam              |
| GET    | /api/rooms                        | JWT   | List rooms               |
| POST   | /api/rooms                        | Admin | Create room              |
| PUT    | /api/rooms/:id                    | Admin | Update room              |
| DELETE | /api/rooms/:id                    | Admin | Delete room              |
| GET    | /api/allocations                  | JWT   | List allocations         |
| POST   | /api/allocations                  | Admin | Allocate (file upload)   |
| GET    | /api/allocations/:id/students     | JWT   | Students in allocation   |
| DELETE | /api/allocations/:id              | Admin | Delete allocation        |
| GET    | /api/invigilators                 | Admin | List invigilators        |
| POST   | /api/invigilators                 | Admin | Create invigilator       |
| PUT    | /api/invigilators/:id             | Admin | Update invigilator       |
| DELETE | /api/invigilators/:id             | Admin | Delete invigilator       |
| POST   | /api/attendance                   | JWT   | Mark attendance          |
| GET    | /api/attendance?exam_id=          | JWT   | Get attendance           |
| GET    | /api/attendance/history           | JWT   | Full history             |
| GET    | /api/reports/dashboard            | JWT   | Dashboard stats          |
| GET    | /api/reports/export/exams         | JWT   | Download exams Excel     |
| GET    | /api/reports/export/rooms         | JWT   | Download rooms Excel     |
| GET    | /api/reports/export/allocations   | JWT   | Download allocs Excel    |
| GET    | /api/reports/export/attendance    | JWT   | Download att Excel       |

---

## Security Features

- Passwords hashed with **bcrypt** (12 salt rounds)
- **JWT** tokens expire in 8 hours
- Login rate-limited to 20 attempts per 15 minutes
- Input validation on all POST/PUT endpoints
- Admin-only guards on destructive routes
- Parameterized SQL queries (no SQL injection)

---

## Troubleshooting

**MySQL connection error:**
- Check `.env` credentials match your MySQL setup
- Ensure MySQL is running: `sudo systemctl start mysql`

**Port already in use:**
- Change `PORT=5001` in `.env`

**File upload fails:**
- Ensure file is `.csv`, `.xlsx`, or `.xls`
- Max file size is 5 MB
- Row 1 must be a header row (it is skipped)

---

## Built for AAMUSTED
Designed to the USTED brand colors — maroon `#7B1A2E` and gold `#C8970E`.
