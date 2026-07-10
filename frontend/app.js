// ═══════════════════════════════════════════════════════════════════════
// USTED Room Allocation System — Frontend
// ═══════════════════════════════════════════════════════════════════════

const API = '/api';

let token        = localStorage.getItem('usted_token') || null;
let currentUser  = JSON.parse(localStorage.getItem('usted_user') || 'null');
let examChart    = null;
let attChart     = null;
let todayAtt     = {};
let submittedAtt = new Set();

// ── API helper ────────────────────────────────────────────────────────────
async function api(method, path, body = null, isForm = false) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res  = await fetch(API + path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

// ── Startup ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setInterval(() => {
    const el = document.getElementById('topbarTime');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }, 1000);

  const dateEl = document.getElementById('attDate');
  if (dateEl) dateEl.valueAsDate = new Date();

  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.innerHTML = '<span class="spinner"></span> Signing in…'; btn.disabled = true;
    try {
      const res = await api('POST', '/auth/login', {
        username: document.getElementById('loginUsername').value.trim(),
        password: document.getElementById('loginPassword').value,
      });
      token = res.token; currentUser = res.user;
      localStorage.setItem('usted_token', token);
      localStorage.setItem('usted_user', JSON.stringify(currentUser));
      launchApp();
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; btn.disabled = false; }
  });

  document.getElementById('examForm').addEventListener('submit', saveExam);
  document.getElementById('roomForm').addEventListener('submit', saveRoom);
  document.getElementById('invForm').addEventListener('submit', saveInvigilator);
  document.getElementById('allocForm').addEventListener('submit', doAllocate);
  document.getElementById('settingsForm').addEventListener('submit', saveSettings);

  const drop = document.getElementById('fileDrop');
  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) { document.getElementById('studentFile').files = e.dataTransfer.files; onFileSelected({ files:[f] }); }
    });
  }
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
  });

  if (token && currentUser) launchApp();
});

// ── Launch ────────────────────────────────────────────────────────────────
function launchApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display     = 'flex';
  document.getElementById('loginForm').reset();
  document.getElementById('loginPassword').type = 'password';
  document.getElementById('eyeIcon').className  = 'fas fa-eye';

  const initials = (currentUser.name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('sidebarAvatar').textContent   = initials;
  document.getElementById('topbarAvatar').textContent    = initials;
  document.getElementById('sidebarUserName').textContent = currentUser.name;
  document.getElementById('topbarUserName').textContent  = currentUser.name;
  document.getElementById('sidebarRole').textContent     = capitalize(currentUser.role);

  applyPermissions();

  // Always land on dashboard
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const dashBtn = document.querySelector('.nav-item[data-tab="dashboard"]');
  if (dashBtn) dashBtn.classList.add('active');
  const dashPage = document.getElementById('dashboard');
  if (dashPage) dashPage.classList.add('active');
  document.getElementById('pageTitle').textContent = 'Dashboard';

  const role = currentUser.role;
  if (role === 'student') {
    hideAdminDashboard();
    loadStudentDashboard();
  } else if (role === 'invigilator') {
    hideAdminDashboard();
    loadInvigilatorDashboard();
  } else {
    showAdminDashboard();
    loadDashboard();
  }
}

function applyPermissions() {
  const isAdmin   = currentUser.role === 'admin';
  const isStudent = currentUser.role === 'student';
  const isInvig   = currentUser.role === 'invigilator';

  ['navExams','navRooms','navAllocation','navInvigilators'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = isAdmin ? '' : 'none';
  });
  const navAtt     = document.getElementById('navAttendance');
  const navReports = document.getElementById('navReports');
  if (navAtt)     navAtt.style.display     = isStudent ? 'none' : '';
  if (navReports) navReports.style.display = isStudent ? 'none' : '';
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const page = document.getElementById(name);
  if (page) page.classList.add('active');
  if (btn)  btn.classList.add('active');
  const titles = { dashboard:'Dashboard', exams:'Exams', rooms:'Rooms', allocation:'Room Allocation', invigilators:'Invigilators', attendance:'Attendance', reports:'Reports & Analytics', settings:'Settings' };
  document.getElementById('pageTitle').textContent = titles[name] || name;

  switch (name) {
    case 'dashboard':
      if (currentUser.role === 'student') {
        hideAdminDashboard(); loadStudentDashboard();
      } else if (currentUser.role === 'invigilator') {
        hideAdminDashboard(); loadInvigilatorDashboard();
      } else {
        showAdminDashboard(); loadDashboard();
      }
      break;
    case 'exams':        loadExams(); break;
    case 'rooms':        loadRooms(); break;
    case 'allocation':   loadAllocations(); loadExamDropdowns(); break;
    case 'invigilators': loadInvigilators(); break;
    case 'attendance':   loadExamDropdowns(); loadAttHistory(); break;
    case 'settings':     loadSettings(); break;
  }
}

function togglePassword() {
  const inp = document.getElementById('loginPassword');
  const ico = document.getElementById('eyeIcon');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  ico.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('usted_token'); localStorage.removeItem('usted_user');
  if (examChart) { examChart.destroy(); examChart = null; }
  if (attChart)  { attChart.destroy();  attChart  = null; }
  document.getElementById('mainApp').style.display    = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginForm').reset();
}

// ═══════════════════════ INVIGILATOR DASHBOARD ═══════════════════════════
// Shows assigned rooms as cards + upcoming exams table
async function loadInvigilatorDashboard() {
  const roleDiv = document.getElementById('roleDashboard');
  roleDiv.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <h3><i class="fas fa-user-tie"></i> Welcome, ${currentUser.name}</h3>
        <span class="badge badge-maroon">Invigilator</span>
      </div>
      <div style="padding:.8rem 1.5rem 1.2rem;color:var(--text-muted);font-size:.9rem">
        <i class="fas fa-info-circle"></i> Your assigned rooms and exam schedule are shown below.
      </div>
    </div>
    <div id="invDashContent">
      <p style="padding:2rem;text-align:center;color:var(--text-muted)"><span class="spinner"></span> Loading…</p>
    </div>`;

  try {
    const me = await api('GET', '/invigilators/me');
    const allocs = await api('GET', '/allocations');

    const container = document.getElementById('invDashContent');

    // ── Assigned Rooms cards
    const roomsHtml = me.rooms.length
      ? `<div class="inv-rooms-grid">
          ${me.rooms.map(r => `
            <div class="inv-room-card">
              <div class="inv-room-icon"><i class="fas fa-door-open"></i></div>
              <div>
                <div class="inv-room-number">Room ${r.room_number}</div>
                <div class="inv-room-building">${r.building || 'No building specified'}</div>
                <div style="margin-top:.4rem"><span class="badge badge-info">Capacity: ${r.capacity}</span></div>
              </div>
            </div>`).join('')}
         </div>`
      : `<div style="text-align:center;padding:1.5rem;color:var(--text-muted)">
           <i class="fas fa-door-closed" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.5rem"></i>
           No rooms assigned yet. Contact your administrator.
         </div>`;

    // ── Exams in my rooms
    const myRoomIds = me.rooms.map(r => r.id);
    const myAllocs  = allocs.filter(a => myRoomIds.includes(a.room_id));

    const examsHtml = myAllocs.length
      ? `<div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Exam</th><th>Code</th><th>Room</th><th>Date</th><th>Time</th><th>Students</th></tr></thead>
            <tbody>
              ${myAllocs.map(a => {
                const roomDisplay = a.building ? `${a.room_number} — ${a.building}` : a.room_number;
                return `<tr>
                  <td><strong>${a.exam_name}</strong></td>
                  <td><span class="badge badge-maroon">${a.exam_code}</span></td>
                  <td>${roomDisplay}</td>
                  <td>${fmtDate(a.exam_date)}</td>
                  <td>${a.exam_time}</td>
                  <td><span class="badge badge-info">${a.student_count} students</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
         </div>`
      : `<div style="text-align:center;padding:1.5rem;color:var(--text-muted)">No exams allocated to your rooms yet.</div>`;

    container.innerHTML = `
      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header">
          <h3 class="card-title"><i class="fas fa-door-open"></i> Your Assigned Rooms</h3>
          <span class="badge badge-info">${me.rooms.length} room${me.rooms.length !== 1 ? 's' : ''}</span>
        </div>
        <div style="padding:1rem 1.3rem 1.3rem">${roomsHtml}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><i class="fas fa-calendar-check"></i> Exams in Your Rooms</h3>
          <span class="badge badge-info">${myAllocs.length} exam${myAllocs.length !== 1 ? 's' : ''}</span>
        </div>
        ${examsHtml}
      </div>`;
  } catch (err) {
    document.getElementById('invDashContent').innerHTML =
      `<div class="card" style="padding:2rem;text-align:center;color:#EF4444"><i class="fas fa-exclamation-circle"></i> ${err.message}</div>`;
  }
}

// ═══════════════════════════════ STUDENT DASHBOARD ═══════════════════════
async function loadStudentDashboard() {
  const roleDiv = document.getElementById('roleDashboard');
  roleDiv.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <h3><i class="fas fa-user-graduate"></i> Welcome, ${currentUser.name}</h3>
        <span class="badge badge-maroon">${currentUser.username}</span>
      </div>
      <div style="padding:.8rem 1.5rem 1.2rem;color:var(--text-muted);font-size:.9rem">
        <i class="fas fa-info-circle"></i> Your index number is <strong>${currentUser.username}</strong>. Your exam allocations are below.
      </div>
    </div>
    <div id="studentAllocList">
      <p style="padding:2rem;text-align:center;color:var(--text-muted)"><span class="spinner"></span> Loading…</p>
    </div>`;

  try {
    const rows = await api('GET', '/allocations/my');
    const container = document.getElementById('studentAllocList');
    if (!rows.length) {
      container.innerHTML = `<div class="card" style="text-align:center;padding:3rem">
        <span style="font-size:3rem">📭</span>
        <h3 style="margin:.8rem 0 .4rem;color:var(--text-muted)">No Allocations Yet</h3>
        <p style="color:var(--text-muted)">You have not been allocated a room for any exam yet.</p>
      </div>`; return;
    }
    container.innerHTML = rows.map(r => {
      const h = Math.floor(r.duration_minutes/60), m = r.duration_minutes%60;
      const dur = h ? `${h}h ${m}m` : `${m}m`;
      const roomDisplay = r.building ? `${r.room_number} — ${r.building}` : r.room_number;
      return `<div class="card student-alloc-card" style="margin-bottom:1.2rem">
        <div class="student-alloc-header">
          <div>
            <h3 style="margin:0 0 .25rem">${r.exam_name}</h3>
            <span class="badge badge-maroon">${r.exam_code}</span>
          </div>
          <span class="badge badge-success" style="font-size:.9rem;padding:.5rem .9rem">✅ Allocated</span>
        </div>
        <div class="student-alloc-body">
          <div class="alloc-detail-grid">
            <div class="alloc-detail-item">
              <i class="fas fa-door-open" style="color:var(--maroon)"></i>
              <div><div class="alloc-detail-label">Room</div><div class="alloc-detail-value"><strong>${roomDisplay}</strong></div></div>
            </div>
            <div class="alloc-detail-item">
              <i class="fas fa-chair" style="color:var(--gold)"></i>
              <div><div class="alloc-detail-label">Seat Number</div><div class="alloc-detail-value"><strong>Seat ${r.seat_number}</strong></div></div>
            </div>
            <div class="alloc-detail-item">
              <i class="fas fa-calendar-alt" style="color:#3B82F6"></i>
              <div><div class="alloc-detail-label">Exam Date</div><div class="alloc-detail-value">${fmtDate(r.exam_date)}</div></div>
            </div>
            <div class="alloc-detail-item">
              <i class="fas fa-clock" style="color:#10B981"></i>
              <div><div class="alloc-detail-label">Time & Duration</div><div class="alloc-detail-value">${r.exam_time} (${dur})</div></div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('studentAllocList').innerHTML =
      `<div class="card" style="text-align:center;padding:2rem;color:#EF4444"><i class="fas fa-exclamation-circle"></i> ${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════ ADMIN DASHBOARD ══════
async function loadDashboard() {
  try {
    const data = await api('GET', '/reports/dashboard');
    document.getElementById('statExams').textContent       = data.totals.exams;
    document.getElementById('statRooms').textContent       = data.totals.rooms;
    document.getElementById('statAllocations').textContent = data.totals.allocations;
    document.getElementById('statStudents').textContent    = data.totals.students;
    renderExamChart(data.distribution);
    renderAttChart(data.attendance);
    renderUpcoming(data.upcoming);
  } catch (err) { console.error('Dashboard error:', err); }
}

function renderExamChart(dist) {
  const ctx = document.getElementById('examChart');
  const empty = document.getElementById('examChartEmpty');
  if (!ctx) return;
  if (!dist || !dist.length) { empty.style.display='flex'; ctx.style.display='none'; return; }
  empty.style.display='none'; ctx.style.display='block';
  if (examChart) { examChart.destroy(); examChart = null; }
  examChart = new Chart(ctx, {
    type:'line',
    data:{ labels:dist.map(d=>d.exam_code), datasets:[{ label:'Students Allocated', data:dist.map(d=>Number(d.student_count)||0), borderColor:'#7B1A2E', backgroundColor:'rgba(123,26,46,0.08)', borderWidth:2.5, pointBackgroundColor:'#C8970E', pointBorderColor:'#fff', pointBorderWidth:2, pointRadius:6, pointHoverRadius:8, tension:0.4, fill:true }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{title:i=>dist[i[0].dataIndex]?.exam_name||i[0].label,label:i=>` ${i.raw} students`}} }, scales:{ y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#F1F5F9'}}, x:{grid:{display:false}} } },
  });
}

function renderAttChart(att) {
  const ctx=document.getElementById('attendanceChart'), empty=document.getElementById('attChartEmpty'), legend=document.getElementById('attLegend');
  if (!ctx) return;
  const p=parseInt(att?.present||0), a=parseInt(att?.absent||0), l=parseInt(att?.late||0);
  if (p+a+l===0) { empty.style.display='flex'; legend.style.display='none'; ctx.style.display='none'; return; }
  empty.style.display='none'; legend.style.display='flex'; ctx.style.display='block';
  document.getElementById('legPresent').textContent=p;
  document.getElementById('legAbsent').textContent=a;
  document.getElementById('legLate').textContent=l;
  if (attChart) { attChart.destroy(); attChart=null; }
  attChart = new Chart(ctx, {
    type:'doughnut',
    data:{labels:['Present','Absent','Late'],datasets:[{data:[p,a,l],backgroundColor:['#10B981','#EF4444','#F59E0B'],borderColor:['#ECFDF5','#FEF2F2','#FFFBEB'],borderWidth:3,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false}}},
  });
}

function renderUpcoming(rows) {
  const tbody=document.getElementById('upcomingTbody'); if (!tbody) return;
  document.getElementById('upcomingCount').textContent=`${rows.length} exam${rows.length!==1?'s':''}`;
  if (!rows.length) { tbody.innerHTML=`<tr class="empty-row"><td colspan="7"><span class="empty-ico">📭</span>No upcoming exams</td></tr>`; return; }
  tbody.innerHTML=rows.map(e=>`<tr>
    <td><strong>${e.name}</strong></td>
    <td><span class="badge badge-maroon">${e.code}</span></td>
    <td>${fmtDate(e.exam_date)}</td><td>${e.exam_time}</td>
    <td>${e.allocated_count}/${e.total_students}</td><td>${e.rooms||'—'}</td>
    <td><span class="badge ${e.allocated_count>0?'badge-success':'badge-warning'}">${e.allocated_count>0?'Allocated':'Pending'}</span></td>
  </tr>`).join('');
}

// ═══════════════════════════════════════════════════════ EXAMS ════════════
let allExams=[];
async function loadExams(){try{allExams=await api('GET','/exams');renderExams(allExams);}catch(err){showToast(err.message,'error');}}
function renderExams(list){
  const tbody=document.getElementById('examsTbody');
  if(!list.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="7"><span class="empty-ico">📚</span>No exams yet.</td></tr>`;return;}
  tbody.innerHTML=list.map(e=>{const h=Math.floor(e.duration_minutes/60),m=e.duration_minutes%60;return`<tr>
    <td><span class="badge badge-maroon">${e.code}</span></td><td><strong>${e.name}</strong></td>
    <td>${fmtDate(e.exam_date)}</td><td>${e.exam_time}</td>
    <td>${h?h+'h ':''} ${m}m</td><td>${e.total_students}</td>
    <td class="action-btns">${currentUser.role==='admin'?`<button class="btn btn-danger btn-sm" onclick="deleteExam(${e.id})"><i class="fas fa-trash"></i></button>`:''}</td>
  </tr>`;}).join('');
}
function filterExams(){const q=document.getElementById('examSearch').value.toLowerCase();renderExams(allExams.filter(e=>e.name.toLowerCase().includes(q)||e.code.toLowerCase().includes(q)));}
async function saveExam(e){
  e.preventDefault();
  try{
    await api('POST','/exams',{name:document.getElementById('examName').value.trim(),code:document.getElementById('examCode').value.trim(),exam_date:document.getElementById('examDate').value,exam_time:document.getElementById('examTime').value,duration_minutes:parseInt(document.getElementById('examDuration').value),total_students:parseInt(document.getElementById('examStudents').value)});
    showToast('Exam created!','success');closeModal('examModal');e.target.reset();loadExams();loadDashboard();
  }catch(err){showToast(err.message,'error');}
}
async function deleteExam(id){if(!confirm('Delete this exam?'))return;try{await api('DELETE',`/exams/${id}`);showToast('Exam deleted','success');loadExams();loadDashboard();}catch(err){showToast(err.message,'error');}}

// ═══════════════════════════════════════════════════════ ROOMS ════════════
let allRooms=[];
async function loadRooms(){try{allRooms=await api('GET','/rooms');renderRooms(allRooms);}catch(err){showToast(err.message,'error');}}
function renderRooms(list){
  const tbody=document.getElementById('roomsTbody');
  if(!list.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="4"><span class="empty-ico">🏢</span>No rooms yet.</td></tr>`;return;}
  tbody.innerHTML=list.map(r=>`<tr>
    <td><strong>${r.room_number}</strong></td><td>${r.building||'N/A'}</td><td>${r.capacity}</td>
    <td class="action-btns">
      <button class="btn btn-info btn-sm" onclick="editRoom(${r.id})"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm" onclick="deleteRoom(${r.id})"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}
function filterRooms(){const q=document.getElementById('roomSearch').value.toLowerCase();renderRooms(allRooms.filter(r=>r.room_number.toLowerCase().includes(q)||(r.building||'').toLowerCase().includes(q)));}
function editRoom(id){
  const r=allRooms.find(x=>x.id===id);if(!r)return;
  document.getElementById('roomId').value=r.id;document.getElementById('roomNumber').value=r.room_number;
  document.getElementById('roomBuilding').value=r.building||'';document.getElementById('roomCapacity').value=r.capacity;
  document.getElementById('roomModalTitle').textContent='Edit Room';
  document.getElementById('roomSubmitBtn').innerHTML='<i class="fas fa-save"></i> Update Room';
  openModal('roomModal');
}
async function saveRoom(e){
  e.preventDefault();const id=document.getElementById('roomId').value;
  const body={room_number:document.getElementById('roomNumber').value.trim(),building:document.getElementById('roomBuilding').value.trim(),capacity:parseInt(document.getElementById('roomCapacity').value)};
  try{
    if(id){await api('PUT',`/rooms/${id}`,body);showToast('Room updated!','success');}
    else{await api('POST','/rooms',body);showToast('Room created!','success');}
    closeModal('roomModal');e.target.reset();document.getElementById('roomId').value='';
    document.getElementById('roomModalTitle').textContent='Add New Room';
    document.getElementById('roomSubmitBtn').innerHTML='<i class="fas fa-plus-circle"></i> Create Room';
    loadRooms();loadDashboard();
  }catch(err){showToast(err.message,'error');}
}
async function deleteRoom(id){if(!confirm('Remove this room?'))return;try{await api('DELETE',`/rooms/${id}`);showToast('Room removed','success');loadRooms();loadDashboard();}catch(err){showToast(err.message,'error');}}

// ═══════════════════════════════════════════════════ ALLOCATION ═══════════
let allAllocs=[];
async function loadAllocations(){try{allAllocs=await api('GET','/allocations');renderAllocations();}catch(err){showToast(err.message,'error');}}
function renderAllocations(){
  const tbody=document.getElementById('allocTbody');
  if(!allAllocs.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6"><span class="empty-ico">📋</span>No allocations yet.</td></tr>`;return;}
  tbody.innerHTML=allAllocs.map(a=>{
    const rd=a.building?`${a.room_number} — ${a.building}`:a.room_number;
    return`<tr>
      <td><strong>${a.exam_code}</strong><br><small style="color:var(--text-muted)">${a.exam_name}</small></td>
      <td><strong>${rd}</strong></td>
      <td><span class="badge badge-info">${a.student_count} students</span></td>
      <td><span class="badge ${a.allocation_method==='random'?'badge-purple':'badge-info'}">${a.allocation_method}</span></td>
      <td>${fmtDate(a.exam_date)}<br><small style="color:var(--text-muted)">${a.exam_time}</small></td>
      <td class="action-btns">
        <button class="btn btn-info btn-sm" onclick="viewAlloc(${a.id})"><i class="fas fa-eye"></i> View</button>
        ${currentUser.role==='admin'?`<button class="btn btn-danger btn-sm" onclick="deleteAlloc(${a.id})"><i class="fas fa-trash"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
}
function onFileSelected(input){const f=input.files?.[0];if(f)document.getElementById('fileDropLabel').textContent=`✅ ${f.name}`;}
async function doAllocate(e){
  e.preventDefault();
  const examId=document.getElementById('allocExam').value,file=document.getElementById('studentFile').files[0],method=document.querySelector('input[name=method]:checked').value;
  if(!examId){showToast('Select an exam','warning');return;}
  if(!file){showToast('Upload a student file','warning');return;}
  const btn=document.getElementById('allocBtn');
  btn.innerHTML='<span class="spinner"></span> Allocating…';btn.disabled=true;
  try{
    const fd=new FormData();fd.append('exam_id',examId);fd.append('method',method);fd.append('studentFile',file);
    const res=await api('POST','/allocations',fd,true);
    showToast(`✅ ${res.message} — SMS sent to students with phone numbers 📱`,'success');
    document.getElementById('allocSummary').style.display='block';
    document.getElementById('summaryBody').innerHTML=res.rooms.map(r=>`
      <div class="summary-room">
        <h4>📍 Room ${r.room_number}${r.building?' — '+r.building:''}</h4>
        <p>Capacity: ${r.capacity} | Assigned: ${r.assigned} students</p>
      </div>`).join('');
    e.target.reset();document.getElementById('fileDropLabel').textContent='Click to upload or drag & drop';
    loadAllocations();loadDashboard();
  }catch(err){showToast(err.message,'error');}
  finally{btn.innerHTML='<i class="fas fa-magic"></i> Allocate Rooms';btn.disabled=false;}
}
async function viewAlloc(id){
  try{
    const students=await api('GET',`/allocations/${id}/students`);
    const a=allAllocs.find(x=>x.id===id);
    const rd=a?.building?`${a.room_number} — ${a.building}`:a?.room_number;
    document.getElementById('viewAllocTitle').textContent=`${a?.exam_name} — Room ${rd}`;
    document.getElementById('viewAllocBody').innerHTML=`
      <div style="padding:0 1.3rem 1.3rem">
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">
          <span class="badge badge-maroon">${a?.exam_code}</span>
          <span class="badge badge-info">${students.length} students</span>
          <span class="badge ${a?.allocation_method==='random'?'badge-purple':'badge-info'}">${a?.allocation_method} order</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Seat</th><th>Index No.</th><th>Student Name</th><th>Programme</th><th>Email</th></tr></thead>
            <tbody>${students.map(s=>`<tr>
              <td>${s.seat_number}</td><td><strong>${s.index_number}</strong></td>
              <td>${s.name}</td><td>${s.programme||'—'}</td><td>${s.email||'—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
    openModal('viewAllocModal');
  }catch(err){showToast(err.message,'error');}
}
async function deleteAlloc(id){if(!confirm('Delete this allocation?'))return;try{await api('DELETE',`/allocations/${id}`);showToast('Allocation deleted','success');loadAllocations();loadDashboard();}catch(err){showToast(err.message,'error');}}

// ═══════════════════════════════════════════════ INVIGILATORS ═════════════
let allInvigilators=[];
async function loadInvigilators(){try{allInvigilators=await api('GET','/invigilators');renderInvigilators(allInvigilators);}catch(err){showToast(err.message,'error');}}
function renderInvigilators(list){
  const tbody=document.getElementById('invTbody');
  if(!list.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6"><span class="empty-ico">👥</span>No invigilators yet.</td></tr>`;return;}
  tbody.innerHTML=list.map(i=>`<tr>
    <td><strong>${i.name}</strong></td><td>${i.username}</td>
    <td>${i.email||'—'}</td><td>${i.phone||'—'}</td>
    <td>${i.assigned_rooms||'<span style="color:var(--text-muted)">None</span>'}</td>
    <td class="action-btns">
      <button class="btn btn-info btn-sm" onclick="editInv(${i.id})"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm" onclick="deleteInv(${i.id})"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}
function filterInvigilators(){const q=document.getElementById('invSearch').value.toLowerCase();renderInvigilators(allInvigilators.filter(i=>i.name.toLowerCase().includes(q)||i.username.toLowerCase().includes(q)));}
async function editInv(id){
  const inv=allInvigilators.find(x=>x.id===id);if(!inv)return;
  document.getElementById('invId').value=inv.id;document.getElementById('invName').value=inv.name;
  document.getElementById('invUsername').value=inv.username;document.getElementById('invEmail').value=inv.email||'';
  document.getElementById('invPhone').value=inv.phone||'';document.getElementById('invPassword').value='';
  document.getElementById('pwdHint').textContent='(leave blank to keep)';
  document.getElementById('invModalTitle').textContent='Edit Invigilator';
  document.getElementById('invSubmitBtn').innerHTML='<i class="fas fa-save"></i> Update Invigilator';
  await populateRoomSelect();
  const assignedIds=(inv.room_ids||'').split(',').map(Number);
  Array.from(document.getElementById('invRooms').options).forEach(o=>{o.selected=assignedIds.includes(parseInt(o.value));});
  openModal('invModal');
}
async function saveInvigilator(e){
  e.preventDefault();
  const id=document.getElementById('invId').value;
  const roomIds=Array.from(document.getElementById('invRooms').selectedOptions).map(o=>parseInt(o.value));
  const body={name:document.getElementById('invName').value.trim(),username:document.getElementById('invUsername').value.trim(),password:document.getElementById('invPassword').value,email:document.getElementById('invEmail').value.trim(),phone:document.getElementById('invPhone').value.trim(),room_ids:roomIds};
  try{
    if(id){await api('PUT',`/invigilators/${id}`,body);showToast('Invigilator updated! SMS sent if password changed 📱','success');}
    else{await api('POST','/invigilators',body);showToast('Invigilator created! Welcome SMS sent 📱','success');}
    closeModal('invModal');e.target.reset();
    document.getElementById('invId').value='';
    document.getElementById('invModalTitle').textContent='Add Invigilator';
    document.getElementById('invSubmitBtn').innerHTML='<i class="fas fa-plus-circle"></i> Create Invigilator';
    document.getElementById('pwdHint').textContent='(required)';
    loadInvigilators();
  }catch(err){showToast(err.message,'error');}
}
async function deleteInv(id){if(!confirm('Delete this invigilator?'))return;try{await api('DELETE',`/invigilators/${id}`);showToast('Invigilator deleted','success');loadInvigilators();}catch(err){showToast(err.message,'error');}}
async function populateRoomSelect(){
  const rooms=await api('GET','/rooms');
  document.getElementById('invRooms').innerHTML=rooms.map(r=>`<option value="${r.id}">${r.room_number}${r.building?' — '+r.building:''} (Cap: ${r.capacity})</option>`).join('');
}

// ═══════════════════════════════════════════════════ ATTENDANCE ═══════════
async function loadExamDropdowns(){
  try{
    const exams=await api('GET','/exams');
    ['allocExam','attExam'].forEach(id=>{
      const sel=document.getElementById(id);if(!sel)return;
      const cur=sel.value;
      sel.innerHTML='<option value="">Choose exam…</option>'+exams.map(e=>`<option value="${e.id}">${e.code} — ${e.name} (${fmtDate(e.exam_date)})</option>`).join('');
      sel.value=cur;
    });
  }catch(err){console.error(err);}
}
async function loadAttendanceList(){
  const examId=document.getElementById('attExam').value,date=document.getElementById('attDate').value;
  const list=document.getElementById('attList'),wrap=document.getElementById('attSubmitWrap');
  todayAtt={};submittedAtt=new Set();updateAttCounts();
  if(!examId){list.innerHTML='';wrap.style.display='none';return;}
  list.innerHTML='<p style="padding:1.5rem;text-align:center;color:var(--text-muted)"><span class="spinner"></span> Loading students…</p>';
  try{
    const allocs=await api('GET','/allocations');
    const examAllocs=allocs.filter(a=>a.exam_id==examId);
    if(!examAllocs.length){list.innerHTML='<p style="padding:1.5rem;color:var(--text-muted);text-align:center">No students allocated for this exam.</p>';wrap.style.display='none';return;}
    let existingAtt={};
    if(date){try{const ex=await api('GET',`/attendance?exam_id=${examId}&session_date=${date}`);ex.forEach(r=>{existingAtt[r.student_id]=r.status;submittedAtt.add(Number(r.student_id));});}catch(_){}}
    const studentRows=[];
    for(const a of examAllocs){const students=await api('GET',`/allocations/${a.id}/students`);const rd=a.building?`${a.room_number} — ${a.building}`:a.room_number;students.forEach(s=>studentRows.push({...s,roomDisplay:rd}));}
    studentRows.forEach(s=>{if(existingAtt[s.id])todayAtt[s.id]=existingAtt[s.id];});
    wrap.style.display='block';
    list.innerHTML=studentRows.map(s=>{
      const initials=s.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      const saved=existingAtt[s.id];
      const colors={present:'#10B981',absent:'#EF4444',late:'#F59E0B'};
      const labels={present:'✅ Present',absent:'❌ Absent',late:'⏰ Late'};
      const actHtml=saved
        ?`<div class="att-actions" id="attact-${s.id}"><span class="badge" style="background:${colors[saved]}20;color:${colors[saved]};border:1px solid ${colors[saved]}">${labels[saved]}</span><span style="color:var(--text-muted);font-size:.75rem;margin-left:.5rem">Saved</span></div>`
        :`<div class="att-actions" id="attact-${s.id}">
            <button class="btn btn-success btn-sm" onclick="markAtt(${s.id},'present')"><i class="fas fa-check"></i> Present</button>
            <button class="btn btn-danger btn-sm" onclick="markAtt(${s.id},'absent')"><i class="fas fa-times"></i> Absent</button>
            <button class="btn btn-warning btn-sm" onclick="markAtt(${s.id},'late')"><i class="fas fa-clock"></i> Late</button>
          </div>`;
      return`<div class="student-att-row" id="srow-${s.id}">
        <div class="student-att-info">
          <div class="student-att-avatar">${initials}</div>
          <div><div class="student-att-name">${s.name}</div><div class="student-att-sub">${s.index_number} · Room ${s.roomDisplay} · Seat ${s.seat_number}</div></div>
        </div>${actHtml}
      </div>`;
    }).join('');
    updateAttCounts();
  }catch(err){showToast(err.message,'error');}
}
function markAtt(studentId,status){
  if(submittedAtt.has(Number(studentId))){showToast('Already saved for this student','warning');return;}
  todayAtt[studentId]=status;
  const colors={present:'#10B981',absent:'#EF4444',late:'#F59E0B'};
  const labels={present:'✅ Present',absent:'❌ Absent',late:'⏰ Late'};
  document.getElementById(`attact-${studentId}`).innerHTML=`
    <span class="badge" style="background:${colors[status]}20;color:${colors[status]};border:1px solid ${colors[status]}">${labels[status]}</span>
    <button class="btn btn-ghost btn-sm" onclick="undoAtt(${studentId})" style="margin-left:.5rem"><i class="fas fa-undo"></i> Undo</button>`;
  updateAttCounts();
}
function undoAtt(studentId){
  if(submittedAtt.has(Number(studentId)))return;
  delete todayAtt[studentId];
  document.getElementById(`attact-${studentId}`).innerHTML=`
    <button class="btn btn-success btn-sm" onclick="markAtt(${studentId},'present')"><i class="fas fa-check"></i> Present</button>
    <button class="btn btn-danger btn-sm" onclick="markAtt(${studentId},'absent')"><i class="fas fa-times"></i> Absent</button>
    <button class="btn btn-warning btn-sm" onclick="markAtt(${studentId},'late')"><i class="fas fa-clock"></i> Late</button>`;
  updateAttCounts();
}
function updateAttCounts(){
  const v=Object.values(todayAtt);
  document.getElementById('presentCount').textContent=v.filter(s=>s==='present').length;
  document.getElementById('absentCount').textContent=v.filter(s=>s==='absent').length;
  document.getElementById('lateCount').textContent=v.filter(s=>s==='late').length;
}
async function submitAttendance(){
  const examId=document.getElementById('attExam').value,date=document.getElementById('attDate').value;
  if(!examId){showToast('Select an exam','warning');return;}
  const newRecords=Object.entries(todayAtt).filter(([sid])=>!submittedAtt.has(parseInt(sid))).map(([student_id,status])=>({student_id:parseInt(student_id),status}));
  if(!newRecords.length){showToast('No new attendance to save','warning');return;}
  try{
    await api('POST','/attendance',{exam_id:examId,session_date:date,records:newRecords});
    showToast(`${newRecords.length} record${newRecords.length!==1?'s':''} saved!`,'success');
    loadAttendanceList();loadAttHistory();loadDashboard();
  }catch(err){showToast(err.message,'error');}
}
async function loadAttHistory(){
  try{
    const rows=await api('GET','/attendance/history');
    const tbody=document.getElementById('attHistoryTbody');
    if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6"><span class="empty-ico">📋</span>No records yet.</td></tr>`;return;}
    tbody.innerHTML=rows.map(r=>{const bc=r.status==='present'?'badge-success':r.status==='absent'?'badge-danger':'badge-warning';
      return`<tr><td>${r.student_name}</td><td><strong>${r.index_number}</strong></td><td>${r.exam_code} — ${r.exam_name}</td><td>${r.room_number||'—'}</td><td><span class="badge ${bc}">${r.status}</span></td><td>${fmtDate(r.session_date)}</td></tr>`;
    }).join('');
  }catch(err){console.error(err);}
}

// ═══════════════════════════════════════════════════════ REPORTS ══════════
function exportReport(type){
  if(!token)return;
  fetch(`${API}/reports/export/${type}`,{headers:{Authorization:`Bearer ${token}`}})
    .then(r=>r.blob()).then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`USTED_${capitalize(type)}_Report.xlsx`;a.click();showToast(`${capitalize(type)} report downloaded!`,'success');})
    .catch(err=>showToast(err.message,'error'));
}

// ═══════════════════════════════════════════════════════ SETTINGS ═════════
function loadSettings(){
  if(!currentUser)return;
  document.getElementById('settingsUsername').value=currentUser.username;
  document.getElementById('settingsNewUsername').value='';
  document.getElementById('settingsCurrentPwd').value='';
  document.getElementById('settingsNewPwd').value='';
  document.getElementById('settingsConfirmPwd').value='';
  const isStu=currentUser.role==='student';
  const uRow=document.getElementById('settingsUsernameRow');
  const sNote=document.getElementById('settingsStudentNote');
  if(uRow) uRow.style.display=isStu?'none':'';
  if(sNote) sNote.style.display=isStu?'block':'none';
}
async function saveSettings(e){
  e.preventDefault();
  const newUn=document.getElementById('settingsNewUsername').value.trim();
  const cur=document.getElementById('settingsCurrentPwd').value;
  const nw=document.getElementById('settingsNewPwd').value;
  const cf=document.getElementById('settingsConfirmPwd').value;
  if(!cur){showToast('Enter your current password','warning');return;}
  if(nw&&nw!==cf){showToast('New passwords do not match','error');return;}
  if(nw&&nw.length<6){showToast('New password must be at least 6 characters','error');return;}
  if(!newUn&&!nw){showToast('Enter a new username or password','warning');return;}
  const body={current_password:cur};if(newUn)body.new_username=newUn;if(nw)body.new_password=nw;
  const btn=document.getElementById('settingsSubmitBtn');btn.innerHTML='<span class="spinner"></span> Saving…';btn.disabled=true;
  try{
    const res=await api('PUT','/auth/settings',body);
    showToast(res.message,'success');
    token=res.token;currentUser=res.user;
    localStorage.setItem('usted_token',token);localStorage.setItem('usted_user',JSON.stringify(currentUser));
    const i=currentUser.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('sidebarAvatar').textContent=i;document.getElementById('topbarAvatar').textContent=i;
    document.getElementById('sidebarUserName').textContent=currentUser.name;document.getElementById('topbarUserName').textContent=currentUser.name;
    loadSettings();
  }catch(err){showToast(err.message,'error');}
  finally{btn.innerHTML='<i class="fas fa-save"></i> Save Changes';btn.disabled=false;}
}

// ═══════════════════════════════════════════════════════ MODALS ═══════════
function openModal(id){
  const m=document.getElementById(id);if(m)m.classList.add('open');
  if(id==='invModal'&&!document.getElementById('invId').value){populateRoomSelect();document.getElementById('pwdHint').textContent='(required)';}
}
function closeModal(id){const m=document.getElementById(id);if(m)m.classList.remove('open');}

// ═══════════════════════════════════════════════════════ TOAST ════════════
function showToast(msg,type='success'){
  const t=document.getElementById('toast');t.textContent=msg;t.className=`toast ${type} show`;
  clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),4500);
}

// ═══════════════════════════════════════════════════════ UTILS ════════════
function fmtDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric'});}
function capitalize(s){return s?s.charAt(0).toUpperCase()+s.slice(1):'';}

// ── Dashboard section visibility helpers ─────────────────────────────────
function showAdminDashboard() {
  ['adminStatGrid','adminCharts','adminUpcoming'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  document.getElementById('roleDashboard').innerHTML = '';
}

function hideAdminDashboard() {
  ['adminStatGrid','adminCharts','adminUpcoming'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
