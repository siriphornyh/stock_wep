// ============================================================
//  GLOBAL STATE
// ============================================================
var currentApp = '';
var currentAdmin = '';
var _cache = {};
var _currentTab = '';

// ============================================================
//  SUPABASE BRIDGE
//  (เดิมเป็น google.script.run → เปลี่ยนมาเรียก SUPA_API ที่คุยกับ Supabase โดยตรง
//   คง signature เดิมของ gas(fnName, args, onSuccess, onError) ไว้ทั้งหมด
//   เพื่อไม่ต้องแก้โค้ด UI ส่วนที่เหลือทั้งไฟล์)
// ============================================================
function gas(fnName, args, onSuccess, onError) {
  showLoading(true);
  var fn = SUPA_API[fnName];
  if (!fn) {
    showLoading(false);
    var e = { message: 'ไม่พบฟังก์ชัน: ' + fnName };
    if (onError) onError(e); else showToast('❌ เกิดข้อผิดพลาด: ' + e.message, '#dc2626');
    return;
  }
  Promise.resolve()
    .then(function() { return fn.apply(null, args || []); })
    .then(function(result) {
      showLoading(false);
      if (onSuccess) onSuccess(result);
    })
    .catch(function(err) {
      showLoading(false);
      console.error(fnName, err);
      if (onError) onError(err);
      else showToast('❌ เกิดข้อผิดพลาด: ' + (err.message || err), '#dc2626');
    });
}

// ============================================================
//  LOADING / TOAST
// ============================================================
function showLoading(show, msg) {
  var el = document.getElementById('loading-overlay');
  var msgEl = document.getElementById('loading-msg');
  if (show) { el.classList.add('show'); if (msg && msgEl) msgEl.textContent = msg; }
  else el.classList.remove('show');
}

function showToast(msg, color, duration) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color || '#16a34a';
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.style.display = 'none'; }, duration || 2500);
}

// ============================================================
//  MANUAL SAVE BUTTON
// ============================================================
function manualSave() {
  if (currentApp && _currentTab) {
    showToast('💾 บันทึกแล้ว — กำลัง Refresh...', '#0070c0', 1500);
    setTimeout(function() {
      switchTab(currentApp, _currentTab);
    }, 600);
  } else {
    showToast('💾 ข้อมูลถูกบันทึกใน Supabase แล้ว ✅', '#16a34a');
  }
  document.getElementById('app-time').textContent = 'อัปเดต: ' + formatDateTH(new Date());
}

// ============================================================
//  DATE FORMAT HELPERS — DD/MM/YYYY (Phase 2 fix #7)
// ============================================================
function formatDateTH(d) {
  if (!d) return '';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return d.toString();
  var dd = String(dt.getDate()).padStart(2, '0');
  var mm = String(dt.getMonth() + 1).padStart(2, '0');
  var yyyy = dt.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

// แปลงจาก YYYY-MM-DD → DD/MM/YYYY เพื่อแสดงผลในตาราง
function toDisplayDate(str) {
  if (!str) return '-';
  // รองรับทั้ง YYYY-MM-DD และ ISO string
  var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  return str;
}

// today ในรูปแบบ YYYY-MM-DD (สำหรับ input type=date)
function today() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  return yyyy + '-' + mm + '-' + dd;
}

// ============================================================
//  LOGIN
// ============================================================
window.onload = function() {
  gas('getAdminList', [], function(res) {
    var sel = document.getElementById('login-admin');
    if (res.ok && res.data.length) {
      sel.innerHTML = res.data.map(function(n) {
        return '<option value="' + n + '">' + n + '</option>';
      }).join('');
    } else {
      sel.innerHTML = '<option value="">⚠️ ไม่มีรายชื่อ — กรุณา Setup ก่อน</option>';
    }
  });
};

function doLogin() {
  var pw = document.getElementById('login-pw').value;
  var admin = document.getElementById('login-admin').value;
  var errEl = document.getElementById('login-err');
  var spinner = document.getElementById('login-spinner');
  errEl.style.display = 'none';
  if (!admin) { errEl.textContent = 'กรุณาเลือกชื่อแอดมิน'; errEl.style.display = 'block'; return; }
  if (!pw) { errEl.textContent = 'กรุณากรอกรหัสผ่าน'; errEl.style.display = 'block'; return; }
  spinner.style.display = 'block';
  gas('login', [pw, admin], function(res) {
    spinner.style.display = 'none';
    if (res.ok) {
      currentAdmin = res.adminName;
      localStorage.setItem('stockAdmin', currentAdmin);
      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('home-screen').style.display = 'flex';
      document.getElementById('home-admin-name').textContent = '👤 ' + currentAdmin;
    } else {
      errEl.textContent = res.message || 'รหัสผ่านไม่ถูกต้อง';
      errEl.style.display = 'block';
    }
  });
}

function doLogout() {
  currentAdmin = '';
  localStorage.removeItem('stockAdmin');
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-pw').value = '';
}

// ============================================================
//  NAVIGATION
// ============================================================
function goHome() {
  document.getElementById('home-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  currentApp = '';
  _currentTab = '';
  _cache = {};
}

function openApp(sys) {
  currentApp = sys;
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  var cfg = appConfig(sys);
  document.getElementById('app-header').style.background = cfg.gradient;
  document.getElementById('app-title').textContent = cfg.title;
  document.getElementById('app-time').textContent = 'อัปเดต: ' + formatDateTH(new Date());
  renderAppTabs(sys, cfg);
  switchTab(sys, sys === 'reports' ? 'deduction' : 'dashboard');
}

function appConfig(sys) {
  var c = {
    office:   { title: '🏢 Office Stock',   gradient: 'linear-gradient(135deg,#0070c0,#004f8c)', color: '#0070c0' },
    medicine: { title: '💊 Medicine Stock', gradient: 'linear-gradient(135deg,#16a34a,#14532d)', color: '#16a34a' },
    machine:  { title: '⚙️ Machine Stock',  gradient: 'linear-gradient(135deg,#ea580c,#9a3412)', color: '#ea580c' },
    uniform:  { title: '👕 Uniform Stock',  gradient: 'linear-gradient(135deg,#7c3aed,#4c1d95)', color: '#7c3aed' },
    reports:  { title: '📊 Reports',        gradient: 'linear-gradient(135deg,#b45309,#92400e)', color: '#b45309' }
  };
  return c[sys];
}

function renderAppTabs(sys, cfg) {
  var tabs, labels;
  if (sys === 'reports') {
    tabs = ['deduction', 'summary'];
    labels = { deduction: '💰 Summary', summary: '📈 Dashboard' };
  } else {
    tabs = ['dashboard', 'items', 'receive', 'issue', 'balance'];
    labels = { dashboard: '🏠 Dashboard', items: '📦 รายการ', receive: '📥 รับเข้า', issue: '📤 เบิกจ่าย', balance: '📊 ยอดคงเหลือ' };
  }
  document.getElementById('app-tabs').innerHTML = tabs.map(function(t) {
    return '<button class="tab" id="tab-btn-' + t + '" style="color:' + cfg.color + '" onclick="switchTab(\'' + sys + '\',\'' + t + '\')">' + labels[t] + '</button>';
  }).join('');
}

function switchTab(sys, tab) {
  _currentTab = tab;
  document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.getElementById('tab-btn-' + tab);
  if (btn) btn.classList.add('active');
  document.getElementById('app-time').textContent = 'อัปเดต: ' + formatDateTH(new Date());
  var fn = { dashboard: renderDashboard, items: renderItems, receive: renderReceive, issue: renderIssue, balance: renderBalance, deduction: renderDeductionReport, summary: renderSummaryDashboard };
  if (fn[tab]) fn[tab](sys);
}

// ============================================================
//  HELPERS
// ============================================================
function sysColor(sys) { return { office: '#0070c0', medicine: '#16a34a', machine: '#ea580c', uniform: '#7c3aed' }[sys]; }
function badgeCls(s) { return s === 'OK' ? 'badge-ok' : s === 'LOW STOCK' ? 'badge-low' : 'badge-out'; }
function verifiedBadge(v) {
  return v === 'Y'
    ? '<span class="badge badge-ok">✅ ตรวจนับแล้ว</span>'
    : '<span class="badge badge-unverified">⚪ UNVERIFIED</span>';
}
function imgOrPh(url, size) {
  size = size || 40;
  return url
    ? '<img src="' + url + '" style="width:' + size + 'px;height:' + size + 'px;border-radius:6px;object-fit:cover" onerror="this.style.display=\'none\'">'
    : '<div style="width:' + size + 'px;height:' + size + 'px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:' + Math.floor(size/2) + 'px;margin:auto">📦</div>';
}
// [v6.2] พรีวิวรูปในฟอร์มเพิ่ม/แก้ไขสินค้า พร้อมปุ่มกากบาทลบรูป (ใช้ได้ทั้งตอนเพิ่มและแก้ไข)
function imgPreviewHtml_(url) {
  if (!url) return '<div class="img-ph">📦</div>';
  return '<img src="' + url + '" class="img-prev">' +
    '<button type="button" class="imod-img-remove-btn" onclick="removeItemImg()" title="ลบรูปภาพ">✕</button>';
}
function removeItemImg() {
  document.getElementById('imod-img-wrap').innerHTML = imgPreviewHtml_('');
  document.getElementById('imod-photo').value = '';
  document.getElementById('imod-photo-base64').value = '';
  document.getElementById('imod-photo-mime').value = '';
  document.getElementById('imod-photo-filename').value = '';
  document.getElementById('imod-file-input').value = '';
}
function daysTillExp(d) { return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24)); }
function issueTypeBadge(t) {
  var m = { new: '<span class="badge badge-new">🆕 ใหม่</span>', swap: '<span class="badge badge-swap">🔄 เปลี่ยน</span>', self: '<span class="badge badge-self">💰 ซื้อเอง</span>', use: '<span class="badge badge-ok">🔧 ใช้งาน</span>' };
  return m[t] || t || '';
}

// ============================================================
//  SEARCHABLE DROPDOWN (generic)
// ============================================================
function initSW(key, data, labelFn, valFn, onSelect) {
  var inp = document.getElementById(key + '-search');
  var lst = document.getElementById(key + '-list');
  if (!inp) return;
  var filter = function() {
    var q = inp.value.toLowerCase();
    var filtered = data.filter(function(d) { return labelFn(d).toLowerCase().includes(q); });
    lst.innerHTML = filtered.map(function(d) {
      return '<div class="ddi" onmousedown="selectSW(\'' + key + '\',this,\'' + valFn(d).replace(/'/g, "\\'") + '\',\'' + labelFn(d).replace(/'/g, "\\'") + '\')">' + labelFn(d) + '</div>';
    }).join('');
    lst.style.display = filtered.length ? 'block' : 'none';
  };
  inp.oninput = filter; inp.onfocus = filter;
  window['_swSelect_' + key] = onSelect;
}
function selectSW(key, el, val, label) {
  // [BUG FIX v6.1] เดิม set label เต็มรูปแบบ "ชื่อ (รหัส)" ลงในช่อง input ตรงๆ
  // ทำให้ช่องชื่อพนักงานในฟอร์มเบิกจ่ายมีรหัสพนักงานติดโชว์อยู่ด้วยเสมอ
  // แก้โดยตัดส่วนรหัสออกเฉพาะตอนแสดงผลในกล่อง input ของช่องชื่อพนักงาน (key === 'iss-emp')
  // โดยใช้ split(' (') ตัดเอาแต่ส่วนชื่อก่อนวงเล็บ — ดร็อปดาวน์ตอนพิมพ์ค้นหายังคงโชว์ "ชื่อ (รหัส)"
  // เหมือนเดิมเพื่อให้แอดมินแยกพนักงานชื่อซ้ำกันได้ระหว่างกำลังเลือก
  var displayLabel = label;
  if (key === 'iss-emp') {
    displayLabel = label.split(' (')[0];
  }
  document.getElementById(key + '-search').value = displayLabel;
  document.getElementById(key + '-val').value = val;
  document.getElementById(key + '-list').style.display = 'none';
  if (window['_swSelect_' + key]) window['_swSelect_' + key](val, label);
}
document.addEventListener('click', function(e) {
  document.querySelectorAll('.ddl').forEach(function(el) {
    if (!el.contains(e.target)) {
      var key = el.id.replace('-list', '');
      var inp = document.getElementById(key + '-search');
      if (inp && !inp.contains(e.target)) el.style.display = 'none';
    }
  });
});

// ============================================================
//  DASHBOARD
// ============================================================
function renderDashboard(sys) {
  var col = sysColor(sys);
  document.getElementById('app-content').innerHTML = '<div style="text-align:center;padding:40px;color:#888">⏳ กำลังดึงข้อมูล Dashboard...</div>';
  gas('getDashboardSummary', [sys], function(res) {
    if (!res || !res.ok) {
      document.getElementById('app-content').innerHTML =
        '<div style="padding:20px;color:#dc2626;background:#fff;border-radius:12px">' +
        '❌ ดึงข้อมูลไม่ได้: ' + (res ? res.message : 'ไม่มีการตอบกลับ') +
        '<br><br><button class="btn btn-blue btn-sm" onclick="renderDashboard(\'' + sys + '\')">🔄 ลองใหม่</button></div>';
      return;
    }
    var html = '<div class="grid4">';
    html += '<div class="kpi" style="border-color:' + col + '"><div class="num" style="color:' + col + '">' + (res.total || 0) + '</div><div class="lbl">📦 รายการทั้งหมด</div></div>';
    html += '<div class="kpi" style="border-color:#16a34a"><div class="num" style="color:#16a34a">' + (res.okCount || 0) + '</div><div class="lbl">✅ ปกติ</div></div>';
    html += '<div class="kpi" style="border-color:#d97706"><div class="num" style="color:#d97706">' + (res.low || 0) + '</div><div class="lbl">⚠️ ใกล้หมด</div></div>';
    html += '<div class="kpi" style="border-color:#dc2626"><div class="num" style="color:#dc2626">' + (res.out || 0) + '</div><div class="lbl">🔴 หมดแล้ว</div></div>';
    html += '<div class="kpi" style="border-color:#9ca3af"><div class="num" style="color:#6b7280">' + (res.unverified || 0) + '</div><div class="lbl">⚪ ยังไม่ได้นับสต็อค</div></div>';
    if (sys === 'medicine') html += '<div class="kpi" style="border-color:#dc2626"><div class="num" style="color:#dc2626">' + (res.soon || 0) + '</div><div class="lbl">⏰ ใกล้หมดอายุ</div></div>';
    html += '</div>';
    html += '<div class="card"><div class="card-title" style="color:#dc2626">🔔 รายการที่ต้องสั่งซื้อเพิ่ม</div>';
    if (!res.alerts || !res.alerts.length) {
      html += '<div style="text-align:center;color:#16a34a;padding:16px">✅ ทุกรายการอยู่ในเกณฑ์ปกติ</div>';
    } else {
      res.alerts.forEach(function(p) {
        html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f5f5f5">' +
          imgOrPh(p.imageUrl, 44) +
          '<div style="flex:1"><div style="font-weight:bold">' + p.itemName + (p.extra2 ? ' (' + p.extra2 + ')' : '') + '</div>' +
          '<div style="font-size:11px;color:#888">' + p.itemCode + ' | คงเหลือ: <b>' + p.balance + '</b> ' + p.unit + ' | ขั้นต่ำ: ' + p.minStock + '</div></div>' +
          '<span class="badge ' + badgeCls(p.status) + '">' + p.status + '</span></div>';
      });
    }
    html += '</div>';
    if (sys === 'medicine') {
      html += '<div class="card"><div class="card-title" style="color:#dc2626">⏰ รายการใกล้หมดอายุ (ภายใน 90 วัน)</div>';
      var expItems = (res.alerts || []).filter(function(p) { return p.extra1 && daysTillExp(p.extra1) <= 90; });
      if (!expItems.length) {
        html += '<div style="text-align:center;color:#16a34a;padding:16px">✅ ไม่มีรายการใกล้หมดอายุ</div>';
      } else {
        expItems.forEach(function(p) {
          var days = daysTillExp(p.extra1);
          html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f5f5f5">' +
            imgOrPh(p.imageUrl, 44) +
            '<div style="flex:1"><div style="font-weight:bold">' + p.itemName + '</div>' +
            '<div style="font-size:11px;color:#888">หมดอายุ: ' + toDisplayDate(p.extra1) + ' | เหลือ ' + days + ' วัน</div></div>' +
            '<span class="badge badge-expire">⏰ ' + days + ' วัน</span></div>';
        });
      }
      html += '</div>';
    }
    document.getElementById('app-content').innerHTML = html;
  }, function(err) {
    document.getElementById('app-content').innerHTML =
      '<div style="padding:20px;color:#dc2626;background:#fff;border-radius:12px">' +
      '❌ เชื่อมต่อ Sheets ไม่ได้: ' + (err.message || err) +
      '<br><br><button class="btn btn-blue btn-sm" onclick="renderDashboard(\'' + sys + '\')">🔄 ลองใหม่</button></div>';
  });
}

// ============================================================
//  ITEMS — ข้อ 5: เปลี่ยน "รหัสเครื่องจักร" → "Part No."
// ============================================================
function renderItems(sys) {
  var col = sysColor(sys);
  document.getElementById('app-content').innerHTML = '<div style="text-align:center;padding:40px;color:#888">⏳ กำลังโหลดรายการสินค้า...</div>';
  gas('getProducts', [sys.toUpperCase()], function(res) {
    if (!res.ok) {
      document.getElementById('app-content').innerHTML = '<div style="padding:20px;color:#dc2626">❌ ' + (res.message || 'ดึงข้อมูลไม่ได้') + '</div>';
      return;
    }
    var items = res.data;
    _cache[sys + '_items'] = items;
    var isMachine = sys === 'machine', isMedicine = sys === 'medicine', isUniform = sys === 'uniform';
    var html = '<div class="card"><div class="card-title" style="color:' + col + '">🖼️ Bulk Image Upload (ลากไฟล์วางเพื่ออัปโหลด)</div>' +
      '<div class="bulk-drop-zone" id="bulk-drop-zone" onclick="document.getElementById(\'bulk-file-input\').click()">' +
      '<div class="bdz-icon">📤</div><div><b>ลากไฟล์ภาพหลายไฟล์มาวางที่นี่</b> หรือคลิกเพื่อเลือกไฟล์</div>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:4px">ระบบจะจับคู่รูปกับสินค้าอัตโนมัติจาก "ชื่อไฟล์ = รหัสสินค้า" (ไม่รวมนามสกุลไฟล์)</div>' +
      '<input type="file" id="bulk-file-input" accept="image/*" multiple style="display:none"></div>' +
      '<div id="bulk-result-wrap"></div></div>';
    html += '<div class="card"><div class="card-title" style="color:' + col + '">📦 รายการทั้งหมด (' + items.length + ')' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<input type="text" id="items-search" placeholder="🔍 ค้นหา..." style="width:200px;font-size:12px" oninput="filterItemsTable(\'' + sys + '\')">' +
      '<button class="btn btn-sm" style="background:' + col + ';color:#fff" onclick="openItemModal(\'' + sys + '\')">➕ เพิ่ม</button>' +
      '</div></div>' +
      '<div style="overflow-x:auto"><table><thead><tr style="background:' + col + ';color:#fff"><th>รูป</th><th>รหัส</th><th>ชื่อ</th>';
    if (isUniform) html += '<th>ไซส์</th>';
    if (isMedicine) html += '<th>หมดอายุ</th>';
    if (isMachine) html += '<th>Part No.</th>';
    html += '<th>หมวดหมู่</th><th>หน่วย</th><th>ขั้นต่ำ</th><th>จัดการ</th></tr></thead><tbody id="items-tbody">';
    items.forEach(function(item, idx) {
      html += '<tr style="background:' + (idx % 2 === 0 ? '#fafafa' : '#fff') + '">';
      html += '<td style="text-align:center">' + imgOrPh(item.imageUrl, 40) + '</td>';
      html += '<td style="color:#888;text-align:center;font-size:12px">' + item.itemCode + '</td>';
      html += '<td><b>' + item.itemName + '</b></td>';
      if (isUniform) html += '<td style="text-align:center">' + (item.extra2 || '-') + '</td>';
      if (isMedicine) html += '<td style="text-align:center;font-size:12px;color:' + (item.extra1 && daysTillExp(item.extra1) <= 30 ? '#dc2626' : '#555') + '">' + (item.extra1 ? toDisplayDate(item.extra1) : '-') + '</td>';
      if (isMachine) html += '<td style="text-align:center;font-size:12px">' + (item.extra1 || '-') + '</td>';
      html += '<td style="text-align:center;font-size:12px">' + item.category + '</td>';
      html += '<td style="text-align:center">' + item.unit + '</td>';
      html += '<td style="text-align:center;color:#d97706"><b>' + item.minStock + '</b></td>';
      html += '<td style="text-align:center;white-space:nowrap">' +
        '<button class="btn btn-blue btn-sm" onclick="openItemModal(\'' + sys + '\',\'' + item.itemCode + '\')">✏️</button> ' +
        '<button class="btn btn-red btn-sm" onclick="deleteItem(\'' + sys + '\',\'' + item.itemCode + '\')">🗑️</button></td></tr>';
    });
    html += '</tbody></table></div></div>';
    document.getElementById('app-content').innerHTML = html;
    initBulkDropZone_(sys);
  });
}

function filterItemsTable(sys) {
  var q = (document.getElementById('items-search').value || '').toLowerCase();
  var items = _cache[sys + '_items'] || [];
  var isMachine = sys === 'machine', isMedicine = sys === 'medicine', isUniform = sys === 'uniform';
  var col = sysColor(sys);

  var filtered = q ? items.filter(function(item) {
    return (item.itemName || '').toLowerCase().includes(q) ||
           (item.aliases || '').toLowerCase().includes(q) ||
           (item.itemCode || '').toLowerCase().includes(q);
  }) : items;

  var rows = '';
  filtered.forEach(function(item, idx) {
    rows += '<tr style="background:' + (idx % 2 === 0 ? '#fafafa' : '#fff') + '">';
    rows += '<td style="text-align:center">' + imgOrPh(item.imageUrl, 40) + '</td>';
    rows += '<td style="color:#888;text-align:center;font-size:12px">' + item.itemCode + '</td>';
    rows += '<td><b>' + item.itemName + '</b>' + (item.aliases ? '<br><span style="font-size:11px;color:#888">[' + item.aliases + ']</span>' : '') + '</td>';
    if (isUniform) rows += '<td style="text-align:center">' + (item.extra2 || '-') + '</td>';
    if (isMedicine) rows += '<td style="text-align:center;font-size:12px;color:' + (item.extra1 && daysTillExp(item.extra1) <= 30 ? '#dc2626' : '#555') + '">' + (item.extra1 ? toDisplayDate(item.extra1) : '-') + '</td>';
    if (isMachine) rows += '<td style="text-align:center;font-size:12px">' + (item.extra1 || '-') + '</td>';
    rows += '<td style="text-align:center;font-size:12px">' + item.category + '</td>';
    rows += '<td style="text-align:center">' + item.unit + '</td>';
    rows += '<td style="text-align:center;color:#d97706"><b>' + item.minStock + '</b></td>';
    rows += '<td style="text-align:center;white-space:nowrap">' +
      '<button class="btn btn-blue btn-sm" onclick="openItemModal(\'' + sys + '\',\'' + item.itemCode + '\')">✏️</button> ' +
      '<button class="btn btn-red btn-sm" onclick="deleteItem(\'' + sys + '\',\'' + item.itemCode + '\')">🗑️</button></td></tr>';
  });

  var tbody = document.getElementById('items-tbody');
  if (tbody) tbody.innerHTML = rows || '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px">ไม่พบรายการ</td></tr>';
}

// ============================================================
//  BULK IMAGE UPLOAD (Drag & Drop) [v6.2]
// ============================================================
function initBulkDropZone_(sys) {
  var zone = document.getElementById('bulk-drop-zone');
  var input = document.getElementById('bulk-file-input');
  if (!zone || !input) return;
  input.onchange = function(e) { handleBulkUpload_(e.target.files, sys); input.value = ''; };
  zone.ondragover = function(e) { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover'); };
  zone.ondragleave = function(e) { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover'); };
  zone.ondrop = function(e) {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('dragover');
    handleBulkUpload_(e.dataTransfer.files, sys);
  };
}

function handleBulkUpload_(fileList, sys) {
  var files = Array.prototype.slice.call(fileList || []).filter(function(f) {
    return f.type && f.type.indexOf('image/') === 0;
  });
  if (!files.length) { showToast('❌ กรุณาเลือก/ลากไฟล์รูปภาพเท่านั้น', '#dc2626'); return; }
  showLoading(true, '⬆️ กำลังอัปโหลด ' + files.length + ' ไฟล์...');
  Promise.all(files.map(fileToPayload_)).then(function(payload) {
    gas('bulkUploadImages', [payload, currentAdmin], function(res) {
      renderBulkResult_(res);
      if (res && res.ok && res.matchedCount > 0) renderItems(sys); // รีเฟรชตารางให้เห็นรูปที่จับคู่แล้ว
    });
  }).catch(function(err) {
    showLoading(false);
    showToast('❌ อ่านไฟล์ไม่สำเร็จ: ' + (err.message || err), '#dc2626');
  });
}

function fileToPayload_(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var parts = ev.target.result.split(',');
      resolve({ fileName: file.name, base64Data: parts[1], mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderBulkResult_(res) {
  var wrap = document.getElementById('bulk-result-wrap');
  if (!wrap) return;
  if (!res || !res.ok) {
    wrap.innerHTML = '<div style="color:#dc2626;font-size:12px;margin-top:8px">❌ ' + (res ? res.message : 'อัปโหลดไม่สำเร็จ') + '</div>';
    return;
  }
  var html = '<div class="bulk-result-list">';
  res.results.forEach(function(r) {
    html += r.matched
      ? '<div class="bulk-result-item ok">✅ ' + r.fileName + ' → จับคู่กับรหัส <b>' + r.itemCode + '</b> สำเร็จ</div>'
      : '<div class="bulk-result-item fail">⚠️ ' + r.fileName + ' — ' + (r.message || 'ไม่พบรหัสสินค้าที่ตรงกัน') + '</div>';
  });
  html += '</div><div style="font-size:12px;color:#555;margin-top:6px">สรุป: จับคู่สำเร็จ ' + res.matchedCount + ' / ' + res.total + ' ไฟล์</div>';
  wrap.innerHTML = html;
}

// เปิด Modal เพิ่ม/แก้ไขสินค้า
function openItemModal(sys, code) {
  document.getElementById('imod-sys').value = sys;
  document.getElementById('imod-code-orig').value = code || '';
  document.getElementById('imod-stocktype').value = sys.toUpperCase();
  document.getElementById('imod-title').textContent = code ? '✏️ แก้ไขรายการ' : '➕ เพิ่มรายการใหม่';
  document.getElementById('imod-img-wrap').innerHTML = imgPreviewHtml_('');
  document.getElementById('imod-photo').value = '';
  document.getElementById('imod-photo-base64').value = '';
  document.getElementById('imod-file-input').value = '';

  gas('getDropdownOptions', [sys], function(res) {
    var cats = (res && res.ok && res.categories) ? res.categories : ['General'];
    var units = (res && res.ok && res.units) ? res.units : ['ชิ้น', 'กล่อง', 'อัน'];

    var catSel = document.getElementById('imod-cat');
    var unitSel = document.getElementById('imod-unit');

    catSel.innerHTML = cats.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    unitSel.innerHTML = units.map(function(u) { return '<option value="' + u + '">' + u + '</option>'; }).join('');

    updateExtraFields_(sys);

    if (code) {
      var items = _cache[sys + '_items'] || [];
      var item = items.find(function(i) { return i.itemCode === code; });
      if (item) {
        document.getElementById('imod-code').value = item.itemCode;
        document.getElementById('imod-name').value = item.itemName;
        catSel.value = item.category;
        if (!catSel.value && item.category) {
          catSel.innerHTML += '<option value="' + item.category + '" selected>' + item.category + '</option>';
          catSel.value = item.category;
        }
        unitSel.value = item.unit;
        if (!unitSel.value && item.unit) {
          unitSel.innerHTML += '<option value="' + item.unit + '" selected>' + item.unit + '</option>';
          unitSel.value = item.unit;
        }
        document.getElementById('imod-min').value = item.minStock;
        document.getElementById('imod-extra1').value = item.extra1 || '';
        document.getElementById('imod-extra2').value = item.extra2 || '';
        document.getElementById('imod-aliases').value = item.aliases || '';
        document.getElementById('imod-photo').value = item.imageUrl || '';
        if (item.imageUrl) document.getElementById('imod-img-wrap').innerHTML = imgPreviewHtml_(item.imageUrl);
      }
    } else {
      document.getElementById('imod-code').value = '';
      document.getElementById('imod-name').value = '';
      document.getElementById('imod-min').value = '5';
      document.getElementById('imod-extra1').value = '';
      document.getElementById('imod-extra2').value = '';
      document.getElementById('imod-aliases').value = '';
    }
  });

  document.getElementById('item-modal').classList.add('show');
}

function updateExtraFields_(sys) {
  var e1 = document.getElementById('imod-extra1-wrap');
  var e2 = document.getElementById('imod-extra2-wrap');
  var lbl = document.getElementById('imod-extra1-label');
  // ข้อ 5: เปลี่ยน label "รหัสเครื่องจักร" → "Part No."
  if (sys === 'medicine') { e1.style.display = ''; lbl.textContent = 'วันหมดอายุ (YYYY-MM-DD)'; e2.style.display = 'none'; }
  else if (sys === 'machine') { e1.style.display = ''; lbl.textContent = 'Part No. (รหัสสินค้าจากผู้ผลิต)'; e2.style.display = 'none'; }
  else if (sys === 'uniform') { e1.style.display = 'none'; e2.style.display = ''; }
  else { e1.style.display = 'none'; e2.style.display = 'none'; }
}

function previewItemImg(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var dataUrl = ev.target.result;
    document.getElementById('imod-img-wrap').innerHTML = imgPreviewHtml_(dataUrl);
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    document.getElementById('imod-photo-base64').value = parts[1];
    document.getElementById('imod-photo-mime').value = mime;
    document.getElementById('imod-photo-filename').value = file.name;
  };
  reader.readAsDataURL(file);
}

function saveItemModal() {
  var sys = document.getElementById('imod-sys').value;
  var code = document.getElementById('imod-code').value.trim();
  var name = document.getElementById('imod-name').value.trim();
  var cat  = document.getElementById('imod-cat').value;
  var unit = document.getElementById('imod-unit').value;
  var min  = Number(document.getElementById('imod-min').value) || 0;
  if (!code || !name) { alert('กรุณากรอก รหัส และ ชื่อสินค้า'); return; }

  var stockType = document.getElementById('imod-stocktype').value;
  var extra1 = document.getElementById('imod-extra1').value.trim();
  var extra2 = document.getElementById('imod-extra2').value.trim();
  var aliases = document.getElementById('imod-aliases').value.trim();
  var existingUrl = document.getElementById('imod-photo').value;
  var base64 = document.getElementById('imod-photo-base64').value;
  var mime   = document.getElementById('imod-photo-mime').value;
  var fname  = document.getElementById('imod-photo-filename').value;

  var doSave = function(imageUrl) {
    var product = { stockType: stockType, category: cat, itemCode: code, itemName: name, unit: unit, minStock: min, imageUrl: imageUrl || '', extra1: extra1, extra2: extra2, aliases: aliases };
    gas('saveProduct', [product, currentAdmin], function(res) {
      if (res.ok) {
        closeModal('item-modal');
        showToast(res.action === 'added' ? '✅ เพิ่มสินค้าสำเร็จ' : '✅ อัปเดตสินค้าสำเร็จ', '#16a34a');
        renderItems(sys);
      } else {
        showToast('❌ ' + (res.message || 'บันทึกไม่สำเร็จ'), '#dc2626');
      }
    });
  };

  if (base64) {
    showLoading(true, '⬆️ กำลังอัปโหลดรูปไปยัง Storage');
    gas('uploadImage', [base64, fname, mime, currentAdmin], function(res) {
      showLoading(false);
      if (res.ok) doSave(res.url);
      else { showToast('❌ อัปโหลดรูปไม่สำเร็จ: ' + res.message, '#dc2626'); doSave(existingUrl); }
    });
  } else {
    doSave(existingUrl);
  }
}

function deleteItem(sys, code) {
  if (!confirm('⚠️ ลบสินค้า "' + code + '" ออกจากระบบ?\n\n(ประวัติรับเข้า/เบิกจ่ายยังคงอยู่ใน Supabase)')) return;
  gas('deleteProduct', [code, currentAdmin], function(res) {
    if (res.ok) { showToast('🗑️ ลบสินค้าแล้ว', '#ea580c'); renderItems(sys); }
    else showToast('❌ ' + (res.message || 'ลบไม่ได้'), '#dc2626');
  });
}

// ============================================================
//  RECEIVE — ข้อ 6: Dynamic layout + ข้อ 7: DD/MM/YYYY
// ============================================================
function renderReceive(sys) {
  var col = sysColor(sys);
  var isMachine = sys === 'machine';
  var isUniform = sys === 'uniform';
  var todayVal = today();

  var renderForm = function(hist) {
    // เก็บ cache ประวัติรับเข้าไว้สำหรับ filter แบบไม่ต้อง re-fetch
    _cache[sys + '_receives'] = hist;

    var html = '<div class="card"><div class="card-title" style="color:' + col + '">📥 บันทึกรับเข้า</div><div class="grid2">';
    html += '<div class="fr"><label>วันที่รับ</label><input type="date" id="r-date" value="' + todayVal + '" max="' + todayVal + '"><div style="font-size:10px;color:#888;margin-top:3px">รูปแบบที่บันทึก/แสดงผล: วัน/เดือน/ปี (DD/MM/YYYY)</div></div>';
    html += '<div class="fr"><label>สินค้า/รายการ</label><div class="sw"><input type="text" id="r-item-search" placeholder="พิมพ์เพื่อค้นหา..." autocomplete="off"><input type="hidden" id="r-item-val"><div class="ddl" id="r-item-list"></div></div></div>';
    html += '<div class="fr"><label>จำนวนรับ</label><input type="number" id="r-qty" placeholder="0" min="1"></div>';
    html += '<div class="fr"><label>ราคา/หน่วย (บาท)</label><input type="number" id="r-price" placeholder="0.00" min="0" step="0.01"></div>';
    html += '<div class="fr"><label>หมายเหตุ</label><input type="text" id="r-note" placeholder="(ถ้ามี)"></div>';
    html += '</div><div style="font-size:12px;color:#888;margin-bottom:8px">ผู้บันทึก: <b>' + currentAdmin + '</b></div>';
    html += '<button class="btn" style="background:' + col + ';color:#fff" onclick="saveReceiveData(\'' + sys + '\')">📥 บันทึกรับเข้า</button></div>';

    // แผงตัวกรองประวัติรับเข้า — สอดคล้องกับ filter bar ของหน้าเบิกจ่าย
    var filterBar = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb">' +
      '<span style="font-size:12px;font-weight:bold;color:#555">🔍 ค้นหา:</span>' +
      '<input type="text" id="rec-filter-by" placeholder="👤 ผู้บันทึก / ซัพพลายเออร์..." oninput="filterReceiveTable()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;width:190px">' +
      '<input type="text" id="rec-filter-item" placeholder="📦 ชื่อสินค้า / รหัสสินค้า..." oninput="filterReceiveTable()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;width:200px">' +
      '<input type="date" id="rec-filter-df" onchange="filterReceiveTable()" style="padding:6px;border:1px solid #d1d5db;border-radius:8px;font-size:12px"><span style="font-size:12px;color:#888">ถึง</span>' +
      '<input type="date" id="rec-filter-dt" onchange="filterReceiveTable()" style="padding:6px;border:1px solid #d1d5db;border-radius:8px;font-size:12px">' +
      '<button onclick="clearReceiveFilter()" style="padding:6px 12px;border:none;border-radius:8px;background:#6b7280;color:#fff;font-size:12px;cursor:pointer">✖ ล้าง</button>' +
      '<span id="rec-filter-count" style="font-size:11px;color:#888"></span></div>';

    // Dynamic table header ตามหมวดหมู่ เหมือน Issue
    var thHtml = '<th>วันที่</th><th>รหัสสินค้า</th><th>รายการ</th>';
    if (isMachine) thHtml += '<th>Part No.</th>';
    if (isUniform) thHtml += '<th>ไซส์</th>';
    thHtml += '<th>จำนวน</th><th>หน่วยนับ</th><th>ราคา/หน่วย</th><th>ผู้บันทึก</th><th>หมายเหตุ</th><th></th>';

    html += '<div class="card"><div class="card-title">ประวัติการรับสินค้า</div>' + filterBar;
    html += '<div style="overflow-x:auto"><table><thead><tr style="background:' + col + ';color:#fff">' + thHtml + '</tr></thead><tbody id="rec-tbody"></tbody></table></div></div>';

    document.getElementById('app-content').innerHTML = html;

    var loadAndInit = function(itemsData) {
      initSmartItemSWForKey('r-item', itemsData);
      // เรนเดอร์ตารางหลังจาก items cache พร้อมแล้ว เพื่อให้ unit/partNo แสดงผลถูกต้องทันที
      renderReceiveTable(sys);
    };
    var items = _cache[sys + '_items'] || [];
    if (items.length) {
      loadAndInit(items);
    } else {
      gas('getProducts', [sys.toUpperCase()], function(res) {
        if (res.ok) { _cache[sys + '_items'] = res.data; loadAndInit(res.data); }
        else { renderReceiveTable(sys); }
      });
    }
  };

  gas('getReceiveHistory', [sys], function(res) { renderForm(res.ok ? res.data : []); });
}

// แยกฟังก์ชัน render แถวตารางรับเข้าออกมาต่างหาก เพื่อให้ filter ทำงานได้โดยไม่ต้อง re-fetch
function renderReceiveTable(sys) {
  var isMachine = sys === 'machine';
  var isUniform = sys === 'uniform';
  var items = _cache[sys + '_items'] || [];
  var data  = _cache[sys + '_receives'] || [];
  var col   = sysColor(sys);

  var rows = data.map(function(r, idx) {
    var itemObj = items.find(function(i) { return i.itemCode === r.itemCode; }) || {};
    var partNo  = itemObj.extra1 || '';
    var size    = itemObj.extra2 || '';
    var unit    = itemObj.unit || '-';
    var bg      = idx % 2 === 0 ? '#fafafa' : '#fff';

    var extraTd = '';
    if (isMachine) extraTd = '<td style="text-align:center;font-size:12px;color:#0070c0">' + (partNo || '-') + '</td>';
    if (isUniform) extraTd = '<td style="text-align:center">' + (size || '-') + '</td>';

    return '<tr style="background:' + bg + '">' +
      '<td style="text-align:center;white-space:nowrap">' + toDisplayDate(r.date) + '</td>' +
      '<td style="text-align:center;font-size:12px;color:#888">' + r.itemCode + '</td>' +
      '<td>' + r.itemName + '</td>' +
      extraTd +
      '<td style="text-align:center;color:#16a34a;font-weight:bold">+' + r.qty + '</td>' +
      '<td style="text-align:center">' + unit + '</td>' +
      '<td style="text-align:right;color:#b45309;font-weight:bold">' + (r.price > 0 ? r.price.toLocaleString('th-TH',{minimumFractionDigits:2}) : '-') + '</td>' +
      '<td style="text-align:center">' + r.recordedBy + '</td>' +
      '<td style="color:#888">' + (r.note || '-') + '</td>' +
      '<td style="text-align:center"><button class="btn btn-red btn-sm" onclick="delReceiveRow(\'' + sys + '\',' + r.rowIndex + ')">🗑️</button></td></tr>';
  }).join('');

  var colCount = (isMachine || isUniform) ? 11 : 10;
  var tbody = document.getElementById('rec-tbody');
  if (tbody) tbody.innerHTML = rows || '<tr><td colspan="' + colCount + '" style="text-align:center;color:#888;padding:20px">ไม่พบข้อมูล</td></tr>';
  var cnt = document.getElementById('rec-filter-count');
  if (cnt) cnt.textContent = '(' + data.length + ' รายการ)';
}

function filterReceiveTable() {
  var sys   = currentApp;
  var data  = _cache[sys + '_receives'] || [];
  var qBy   = ((document.getElementById('rec-filter-by')   || {}).value || '').toLowerCase();
  var qItem = ((document.getElementById('rec-filter-item') || {}).value || '').toLowerCase();
  var df    = (document.getElementById('rec-filter-df') || {}).value || '';
  var dt    = (document.getElementById('rec-filter-dt') || {}).value || '';

  var filtered = data.filter(function(r) {
    var matchBy   = !qBy   || (r.recordedBy || '').toLowerCase().includes(qBy);
    var matchItem = !qItem || (r.itemName || '').toLowerCase().includes(qItem) || (r.itemCode || '').toLowerCase().includes(qItem);
    var matchDf   = !df   || r.date >= df;
    var matchDt   = !dt   || r.date <= dt;
    return matchBy && matchItem && matchDf && matchDt;
  });

  // swap cache ชั่วคราว เรนเดอร์เฉพาะข้อมูลที่กรองแล้ว แล้วคืนค่าเดิม
  var orig = _cache[sys + '_receives'];
  _cache[sys + '_receives'] = filtered;
  renderReceiveTable(sys);
  _cache[sys + '_receives'] = orig;

  var cnt = document.getElementById('rec-filter-count');
  if (cnt) cnt.textContent = '(' + filtered.length + ' รายการ)';
}

function clearReceiveFilter() {
  ['rec-filter-by', 'rec-filter-item', 'rec-filter-df', 'rec-filter-dt'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderReceiveTable(currentApp);
}

function saveReceiveData(sys) {
  var itemCode = document.getElementById('r-item-val').value;
  var qty = Number(document.getElementById('r-qty').value);
  var date = document.getElementById('r-date').value;
  var note = document.getElementById('r-note').value;
  if (!itemCode || !qty || !date) { alert('กรุณากรอกข้อมูลให้ครบ (สินค้า, วันที่, จำนวน)'); return; }
  if (date > today()) {
    showToast('❌ วันที่ดังกล่าวไม่สามารถบันทึกได้ในขณะนี้', '#dc2626');
    return;
  }
  var items = _cache[sys + '_items'] || [];
  var item = items.find(function(i) { return i.itemCode === itemCode; }) || {};
  var price = Number(document.getElementById('r-price').value) || 0;
  var record = { date: date, itemCode: itemCode, itemName: item.itemName || itemCode, qty: qty, price: price, note: note };
  gas('saveReceive', [sys, record, currentAdmin], function(res) {
    if (res.ok) { showToast('✅ บันทึกรับเข้าสำเร็จ', '#16a34a'); renderReceive(sys); }
    else showToast('❌ ' + (res.message || 'บันทึกไม่สำเร็จ'), '#dc2626');
  });
}

function delReceiveRow(sys, rowIndex) {
  if (!confirm('ลบรายการนี้?')) return;
  gas('deleteReceive', [sys, rowIndex, currentAdmin], function(res) {
    if (res.ok) { showToast('🗑️ ลบแล้ว', '#ea580c'); renderReceive(sys); }
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

// ============================================================
//  SMART ITEM SEARCH — ข้อ 3: ค้นหาจาก Aliases ด้วย
// ============================================================
function initSmartItemSWForKey(key, items) {
  var inp = document.getElementById(key + '-search');
  var lst = document.getElementById(key + '-list');
  if (!inp) return;

  var filter = function() {
    var q = inp.value.toLowerCase();
    var filtered = items.filter(function(item) {
      var targets = [item.itemCode, item.itemName, item.extra1 || '', item.aliases || ''];
      return targets.some(function(t) { return t.toLowerCase().includes(q); });
    });
    lst.innerHTML = filtered.map(function(item) {
      var dispAlias = item.aliases ? '<span style="color:#888;font-size:11px"> [' + item.aliases + ']</span>' : '';
      var partDisp  = item.extra1 ? '<span style="color:#0070c0;font-size:11px"> P/N:' + item.extra1 + '</span>' : '';
      var sizeDisp  = item.extra2 ? '<span style="color:#7c3aed;font-size:11px"> ไซส์:' + item.extra2 + '</span>' : '';
      return '<div class="ddi" onmousedown="selectSmartItem(\'' + key + '\',\'' + item.itemCode.replace(/'/g,"\\'") + '\')">' +
        '<b>' + item.itemCode + '</b> — ' + item.itemName + partDisp + sizeDisp + dispAlias + '</div>';
    }).join('');
    lst.style.display = filtered.length ? 'block' : 'none';
  };
  inp.oninput = filter;
  inp.onfocus = filter;
}

function selectSmartItem(key, itemCode) {
  var items = _cache[currentApp + '_items'] || [];
  var item = items.find(function(i) { return i.itemCode === itemCode; });
  if (!item) return;
  var label = item.itemCode + ' — ' + item.itemName + (item.extra2 ? ' (' + item.extra2 + ')' : '');
  var inp = document.getElementById(key + '-search');
  var val = document.getElementById(key + '-val');
  var lst = document.getElementById(key + '-list');
  if (inp) inp.value = label;
  if (val) val.value = item.itemCode;
  if (lst) lst.style.display = 'none';

  // ถ้าเป็น issue form ให้ autofill Part No. และแสดงรูปยืนยัน
  if (key === 'iss-item') {
    var partnoEl = document.getElementById('iss-item-partno');
    if (partnoEl) partnoEl.value = item.extra1 || '';
    // Visual verification image
    var verifyEl = document.getElementById('iss-item-img-verify');
    var imgEl = document.getElementById('iss-item-img-el');
    if (item.imageUrl && verifyEl && imgEl) {
      imgEl.src = item.imageUrl;
      imgEl.onerror = function() { verifyEl.style.display = 'none'; };
      verifyEl.style.display = 'block';
    } else if (verifyEl) {
      verifyEl.style.display = 'none';
    }
    checkStockWarning();
  }
}

// ============================================================
//  ISSUE — ข้อ 1,2,3,4,6,7 รวมกัน
// ============================================================
var _pendingIssueRecord = null;
var _pendingIssueSys = null;

function renderIssue(sys) {
  var col = sysColor(sys);
  var isMachine = sys === 'machine';
  var isUniform = sys === 'uniform';
  var isMedicine = sys === 'medicine';
  var isOffice = sys === 'office';
  var todayVal = today();

  // ---- History table columns ตาม spec ข้อ 6 ----
  var histTh = '';
  if (isMachine) {
    // [ วันที่ ]|[ รหัสสินค้า ]|[ รายการ ]|[ Part No. ]|[ จำนวน ]|[ หน่วยนับ ]|[ รหัสพนักงาน ]|[ ชื่อพนักงาน ]|[ แผนก ]|[ ประเภท ]|[ หมายเหตุ ]|[ ลบ ]
    histTh = '<th>วันที่</th><th>รหัสสินค้า</th><th>รายการ</th><th>Part No.</th><th>จำนวน</th><th>หน่วยนับ</th><th>รหัสพนักงาน</th><th>ชื่อพนักงาน</th><th>แผนก</th><th>ประเภท</th><th>หมายเหตุ</th><th></th>';
  } else if (isUniform) {
    // [ วันที่ ]|[ รหัสสินค้า ]|[ รายการ ]|[ ไซส์ ]|[ จำนวน ]|[ หน่วยนับ ]|[ รหัสพนักงาน ]|[ ชื่อพนักงาน ]|[ แผนก ]|[ ประเภท ]|[ หมายเหตุ ]|[ ลบ ]
    histTh = '<th>วันที่</th><th>รหัสสินค้า</th><th>รายการ</th><th>ไซส์</th><th>จำนวน</th><th>หน่วยนับ</th><th>รหัสพนักงาน</th><th>ชื่อพนักงาน</th><th>แผนก</th><th>ประเภท</th><th>หมายเหตุ</th><th></th>';
  } else if (isMedicine) {
    // [ วันที่ ]|[ รหัสสินค้า ]|[ รายการ ]|[ จำนวน ]|[ หน่วยนับ ]|[ รหัสพนักงาน ]|[ ชื่อพนักงาน ]|[ แผนก ]|[ อาการ ]|[ หมายเหตุ ]|[ ลบ ]
    histTh = '<th>วันที่</th><th>รหัสสินค้า</th><th>รายการ</th><th>จำนวน</th><th>หน่วยนับ</th><th>รหัสพนักงาน</th><th>ชื่อพนักงาน</th><th>แผนก</th><th>อาการ</th><th>หมายเหตุ</th><th></th>';
  } else {
    // Office: [ วันที่ ]|[ รหัสสินค้า ]|[ รายการ ]|[ จำนวน ]|[ หน่วยนับ ]|[ รหัสพนักงาน ]|[ ชื่อพนักงาน ]|[ แผนก ]|[ ประเภท ]|[ หมายเหตุ ]|[ ลบ ]
    histTh = '<th>วันที่</th><th>รหัสสินค้า</th><th>รายการ</th><th>จำนวน</th><th>หน่วยนับ</th><th>รหัสพนักงาน</th><th>ชื่อพนักงาน</th><th>แผนก</th><th>ประเภท</th><th>หมายเหตุ</th><th></th>';
  }

  var filterBar = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb">' +
    '<span style="font-size:12px;font-weight:bold;color:#555">🔍 ค้นหา:</span>' +
    '<input type="text" id="iss-filter-emp" placeholder="👤 ชื่อพนักงาน..." oninput="filterIssueTable()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;width:150px">' +
    '<input type="text" id="iss-filter-item" placeholder="📦 ชื่อสินค้า..." oninput="filterIssueTable()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;width:150px">' +
    '<input type="date" id="iss-filter-df" onchange="filterIssueTable()" style="padding:6px;border:1px solid #d1d5db;border-radius:8px;font-size:12px"><span style="font-size:12px;color:#888">ถึง</span>' +
    '<input type="date" id="iss-filter-dt" onchange="filterIssueTable()" style="padding:6px;border:1px solid #d1d5db;border-radius:8px;font-size:12px">' +
    '<button onclick="clearIssueFilter()" style="padding:6px 12px;border:none;border-radius:8px;background:#6b7280;color:#fff;font-size:12px;cursor:pointer">✖ ล้าง</button>' +
    '<span id="iss-filter-count" style="font-size:11px;color:#888"></span></div>';

  // ---- Build form HTML ----
  var html = '<div class="card"><div class="card-title" style="color:' + col + '">📤 บันทึกการเบิกจ่าย</div>';

  // Row 1: วันที่ | ประเภท (Machine/Uniform) หรือ อาการ (Medicine)
  html += '<div class="grid2">';
  // ข้อ 2: max = today, แสดงเฉพาะวันปัจจุบันและย้อนหลัง
  html += '<div class="fr"><label>📅 วันที่เบิก</label><input type="date" id="iss-date" value="' + todayVal + '" max="' + todayVal + '"><div style="font-size:10px;color:#888;margin-top:3px">รูปแบบที่บันทึก/แสดงผล: วัน/เดือน/ปี (DD/MM/YYYY)</div></div>';
  if (isMachine) {
    html += '<div class="fr"><label>ประเภทการเบิก</label><select id="iss-type"><option value="use">🔧 เบิกใช้งาน/ซ่อม</option><option value="swap">🔄 นำมาเปลี่ยน (คืนตัวเก่า)</option><option value="self">💰 พนักงานซื้อเอง</option></select></div>';
  } else if (isUniform) {
    html += '<div class="fr"><label>ประเภทการเบิก</label><select id="iss-type"><option value="new">🆕 ซื้อใหม่</option><option value="swap">🔄 นำตัวเก่ามาเปลี่ยน</option><option value="self">💰 ซื้อเพิ่มเอง</option></select></div>';
  } else if (isMedicine) {
    html += '<div class="fr"><label>อาการ/เหตุผล</label><input type="text" id="iss-symptom" placeholder="เช่น ปวดหัว ไข้"></div>';
  } else if (isOffice) {
    html += '<div class="fr"><label>ประเภทการเบิก</label><select id="iss-type"><option value="use">📋 เบิกใช้งาน</option><option value="self">💰 พนักงานซื้อเอง</option></select></div>';
  } else {
    html += '<div></div>';
  }
  html += '</div>';

  // Row 2: ค้นหาสินค้า (full) + image verify
  html += '<div class="fr"><label>🔍 รหัสสินค้า / รายการ <span style="font-weight:normal;font-size:11px;color:#888">(ค้นหาด้วยชื่อ, รหัส, Part No. หรือชื่อเรียกของช่าง)</span></label>';
  html += '<div class="sw"><input type="text" id="iss-item-search" placeholder="พิมพ์เพื่อค้นหา..." autocomplete="off">';
  html += '<input type="hidden" id="iss-item-val"><input type="hidden" id="iss-item-partno">';
  html += '<div class="ddl" id="iss-item-list"></div></div>';
  html += '<div id="iss-item-img-verify"><img id="iss-item-img-el" src="" alt=""><div class="vfy-label">✅ ยืนยันสินค้า — ตรวจสอบรูปก่อนบันทึก</div></div>';
  html += '</div>';

  // Row 3: จำนวน | รหัสเครื่องจักร (machine เท่านั้น)
  html += '<div class="grid2">';
  html += '<div class="fr"><label>จำนวนเบิก</label><input type="number" id="iss-qty" placeholder="0" min="1" oninput="checkStockWarning()"></div>';
  if (isMachine) {
    html += '<div class="fr"><label>รหัสเครื่องจักร <span style="font-weight:normal;font-size:11px;color:#888">(ระบุเครื่องที่นำไปใช้)</span></label><input type="text" id="iss-machine" placeholder="เช่น MC001"></div>';
  } else {
    html += '<div></div>';
  }
  html += '</div>';

  // ---- ข้อ 1: Employee Autofill ----
  // Dropdown หลัก: "ชื่อพนักงาน (รหัสพนักงาน)"
  html += '<div class="fr"><label>👤 ชื่อพนักงาน</label>';
  html += '<div class="sw"><input type="text" id="iss-emp-search" placeholder="พิมพ์ชื่อพนักงาน..." autocomplete="off">';
  html += '<input type="hidden" id="iss-emp-val"><div class="ddl" id="iss-emp-list"></div></div></div>';

  // รหัสพนักงาน + แผนก: Read-only autofill
  html += '<div class="grid2">';
  html += '<div class="fr"><label>🔖 รหัสพนักงาน <span style="font-size:10px;color:#0369a1;font-weight:normal">(อัตโนมัติ)</span></label>';
  html += '<input type="text" id="iss-empcode-display" readonly class="af-box" style="background:#f0f9ff;color:#0369a1;font-weight:bold" placeholder="—"></div>';
  html += '<div class="fr"><label>🏢 แผนก <span style="font-size:10px;color:#0369a1;font-weight:normal">(อัตโนมัติ)</span></label>';
  html += '<div class="af-box" id="iss-dept-display">—</div>';
  html += '<input type="hidden" id="iss-dept-val"><input type="hidden" id="iss-empcode-val"><input type="hidden" id="iss-emp-name-val"></div>';
  html += '</div>';

  // Row: หมายเหตุ
  html += '<div class="fr"><label>หมายเหตุ</label><input type="text" id="iss-note" placeholder="(ถ้ามี)"></div>';

  html += '<div style="font-size:12px;color:#888;margin-bottom:8px">ผู้บันทึก: <b>' + currentAdmin + '</b></div>';
  html += '<button class="btn" style="background:' + col + ';color:#fff" onclick="saveIssueData(\'' + sys + '\')">📤 บันทึกเบิกจ่าย</button></div>';

  // History table
  html += '<div class="card"><div class="card-title">ประวัติการเบิกจ่าย</div>' + filterBar;
  html += '<div style="overflow-x:auto"><table><thead><tr style="background:' + col + ';color:#fff">' + histTh + '</tr></thead><tbody id="iss-tbody"></tbody></table></div></div>';

  document.getElementById('app-content').innerHTML = html;

  // ตั้ง max ของ date อีกครั้ง
  var dateEl = document.getElementById('iss-date');
  if (dateEl) dateEl.setAttribute('max', todayVal);

  // โหลดข้อมูลพร้อมกัน
  // [BUG FIX] เดิม getIssueHistory ยิงคู่ขนานแยกจาก loadItems/loadEmps แล้วเรียก renderIssueTable
  // ทันทีที่ตัวเองเสร็จ — ถ้า getProducts (ซึ่งเติม _cache[sys+'_items']) ยังไม่เสร็จก่อน
  // renderIssueTable จะหา itemObj ไม่เจอ ทำให้ "หน่วยนับ" ไม่แสดงผล (ช่องโชว์ '-')
  // แก้โดยรวม getIssueHistory เข้าไปใน Promise.all เดียวกัน แล้ว render ตารางหลังจากทุกอย่างพร้อมแล้วเท่านั้น
  var loadItems = new Promise(function(resolve) {
    var cached = _cache[sys + '_items'];
    if (cached && cached.length) resolve(cached);
    else gas('getProducts', [sys.toUpperCase()], function(res) { if (res.ok) { _cache[sys + '_items'] = res.data; resolve(res.data); } else resolve([]); });
  });
  var loadEmps = new Promise(function(resolve) {
    var cached = _cache['employees'];
    if (cached) resolve(cached);
    else gas('getEmployees', [], function(res) { if (res.ok) { _cache['employees'] = res.data; resolve(res.data); } else resolve([]); });
  });
  var loadIssues = new Promise(function(resolve) {
    gas('getIssueHistory', [sys], function(res) {
      _cache[sys + '_issues'] = res.ok ? res.data : [];
      resolve(_cache[sys + '_issues']);
    });
  });

  Promise.all([loadItems, loadEmps, loadIssues]).then(function(results) {
    var items = results[0];
    var emps  = results[1];

    // ข้อ 3: Smart Search รวม Aliases
    initSmartItemSWForKey('iss-item', items);

    // ข้อ 1: Employee dropdown หลัก — แสดงเป็น "ชื่อพนักงาน (รหัสพนักงาน)"
    initSW('iss-emp', emps,
      function(e) { return e.name + ' (' + e.code + ')'; },
      function(e) { return e.code; },
      function(val) { autofillEmpByCode(val, emps); }
    );

    // [BUG FIX] เรนเดอร์ตารางประวัติหลังจาก _cache[sys+'_items'] พร้อมแล้วแน่นอน
    renderIssueTable(sys);
  });
}

// ---- ข้อ 1: Autofill รหัสพนักงาน + แผนก เมื่อเลือกชื่อ ----
function autofillEmpByCode(code, emps) {
  var emp = (emps || _cache['employees'] || []).find(function(e) { return e.code === code; });
  if (!emp) return;
  // autofill รหัสพนักงาน (read-only)
  var codeDisp = document.getElementById('iss-empcode-display');
  var codeVal  = document.getElementById('iss-empcode-val');
  if (codeDisp) codeDisp.value = emp.code;
  if (codeVal)  codeVal.value  = emp.code;
  // [BUG FIX] เก็บ "ชื่อพนักงาน" ล้วนๆ แยกไว้ใน hidden field ต่างหาก
  // เพราะช่อง #iss-emp-search ใช้แสดงผล label แบบ "ชื่อ (รหัส)" สำหรับการค้นหา/เลือก
  // ถ้าดึง empName ตรงจากช่องนั้นไปบันทึก จะได้ "ชื่อ (รหัส)" ซ้ำซ้อนกับช่องรหัสพนักงานที่มีอยู่แล้ว
  var nameVal = document.getElementById('iss-emp-name-val');
  if (nameVal) nameVal.value = emp.name || '';
  // autofill แผนก (read-only)
  var deptDisp = document.getElementById('iss-dept-display');
  var deptVal  = document.getElementById('iss-dept-val');
  var dept = emp.department || emp.dept || '';
  if (deptDisp) deptDisp.textContent = dept || '—';
  if (deptVal)  deptVal.value = dept;
}

// ---- ข้อ 4: Soft-warning ----
function checkStockWarning() {
  var sys = currentApp;
  var itemCode = (document.getElementById('iss-item-val') || {}).value || '';
  var qty = Number((document.getElementById('iss-qty') || {}).value || 0);
  if (!itemCode || !qty) return;
  var balData = _cache[sys + '_balance'] || [];
  var bal = balData.find(function(b) { return b.itemCode === itemCode; });
  var qtyEl = document.getElementById('iss-qty');
  if (bal && qty > bal.balance) {
    if (qtyEl) qtyEl.style.borderColor = '#ea580c';
  } else {
    if (qtyEl) qtyEl.style.borderColor = '';
  }
}

function closeSoftWarn() {
  document.getElementById('soft-warn-modal').classList.remove('show');
  _pendingIssueRecord = null; _pendingIssueSys = null;
}

function confirmSoftWarn() {
  document.getElementById('soft-warn-modal').classList.remove('show');
  if (_pendingIssueRecord && _pendingIssueSys) {
    _doSaveIssue(_pendingIssueSys, _pendingIssueRecord);
  }
  _pendingIssueRecord = null; _pendingIssueSys = null;
}

function saveIssueData(sys) {
  var itemCode  = (document.getElementById('iss-item-val') || {}).value || '';
  var partNo    = (document.getElementById('iss-item-partno') || {}).value || '';
  var qty       = Number((document.getElementById('iss-qty') || {}).value || 0);
  var empCode   = (document.getElementById('iss-empcode-val') || {}).value || '';
  // [BUG FIX] เดิมดึง empName จาก #iss-emp-search ตรงๆ ซึ่งเก็บ label แบบ "ชื่อ (รหัส)"
  // ทำให้ตารางประวัติแสดงรหัสพนักงานซ้ำซ้อนในช่องชื่อ — เปลี่ยนมาดึงจาก hidden field ที่เก็บชื่อล้วนๆ
  var empName   = (document.getElementById('iss-emp-name-val') || {}).value || '';
  var dept      = (document.getElementById('iss-dept-val') || {}).value || '';
  var date      = (document.getElementById('iss-date') || {}).value || '';

  if (!itemCode || !qty || !empCode || !date) {
    showToast('❌ กรุณากรอกข้อมูลให้ครบ (สินค้า, จำนวน, พนักงาน, วันที่)', '#dc2626');
    return;
  }

  // ข้อ 2: ห้ามวันที่ในอนาคต — ข้อความตามที่กำหนด
  if (date > today()) {
    showToast('❌ วันที่ดังกล่าวไม่สามารถบันทึกได้ในขณะนี้', '#dc2626');
    return;
  }

  var items = _cache[sys + '_items'] || [];
  var item  = items.find(function(i) { return i.itemCode === itemCode; }) || {};

  var record = {
    date: date, itemCode: itemCode, itemName: item.itemName || itemCode,
    partNo: partNo || item.extra1 || '',
    qty: qty, empCode: empCode, empName: empName, dept: dept,
    note: (document.getElementById('iss-note') || {}).value || ''
  };
  if (sys === 'medicine') record.symptom = (document.getElementById('iss-symptom') || {}).value || '';
  if (sys === 'machine')  { record.machineCode = (document.getElementById('iss-machine') || {}).value || ''; record.issueType = (document.getElementById('iss-type') || {}).value || 'use'; }
  if (sys === 'uniform')  record.issueType = (document.getElementById('iss-type') || {}).value || 'new';
  if (sys === 'office')   record.issueType = (document.getElementById('iss-type') || {}).value || 'use';

  // [BUG FIX v6.1] เดิมเช็ค _cache[sys+'_balance'] ฝั่ง client ก่อนเด้ง soft-warning popup
  // ปัญหาคือ cache นี้จะว่างถ้าแอดมินยังไม่เคยเปิดแท็บ "ยอดคงเหลือ" มาก่อน ทำให้ข้ามการเตือนไปเลย
  // และตอนนี้ Code.gs (saveIssue) เปลี่ยนมาตรวจยอดคงเหลือ Real-time จาก Sheets โดยตรงและบล็อกจริง
  // ไม่ใช่แค่เตือนแล้วปล่อยผ่านอีกต่อไป — จึงไม่จำเป็นต้องเช็คซ้ำฝั่ง client ด้วย cache ที่ไม่แน่นอน
  // ส่งข้อมูลไปให้ backend ตัดสินใจตรงๆ ถ้าเบิกเกินจะได้ error message ที่ถูกต้องจาก server ทันที
  _doSaveIssue(sys, record);
}

function _doSaveIssue(sys, record) {
  gas('saveIssue', [sys, record, currentAdmin], function(res) {
    if (res.ok) {
      showToast('✅ บันทึกเบิกจ่ายสำเร็จ', '#16a34a');
      _cache[sys + '_issues'] = null;
      _cache[sys + '_balance'] = null;
      renderIssue(sys);
    } else {
      showToast('❌ ' + (res.message || 'บันทึกไม่สำเร็จ'), '#dc2626', 4000);
    }
  });
}

// ---- Render ตาราง Issue ตาม layout ข้อ 6 + วันที่ DD/MM/YYYY ข้อ 7 ----
function renderIssueTable(sys) {
  var isMachine = sys === 'machine', isUniform = sys === 'uniform', isMedicine = sys === 'medicine', isOffice = sys === 'office';
  var items = _cache[sys + '_items'] || [];
  var data  = _cache[sys + '_issues'] || [];

  var rows = data.map(function(r, idx) {
    var itemObj = items.find(function(i) { return i.itemCode === r.itemCode; }) || {};
    var partNo  = r.partNo || (itemObj ? itemObj.extra1 || '' : '');
    var size    = itemObj.extra2 || '';
    var unit    = itemObj.unit || '-';
    var bg      = idx % 2 === 0 ? '#fafafa' : '#fff';

    var extraTd = '';
    if (isMachine) {
      // [BUG FIX] เดิมขาด <td> จำนวน (qty) ไปก่อนหน้านี้ ทำให้คอลัมน์ที่เหลือทั้งหมดเยื้อง 1 ช่อง
      // (หน่วยนับไปโผล่ช่องจำนวน, รหัสพนักงานไปโผล่ช่องหน่วยนับ, ชื่อพนักงานไปโผล่ช่องรหัสพนักงาน)
      // ลำดับคอลัมน์ที่ถูกต้องตาม spec: Part No. | จำนวน | หน่วยนับ | รหัสพนักงาน | ชื่อพนักงาน | แผนก | ประเภท | หมายเหตุ
      extraTd = '<td style="text-align:center;font-size:12px;color:#0070c0">' + (partNo || '-') + '</td>' +
                '<td style="text-align:center;color:#dc2626;font-weight:bold">-' + r.qty + '</td>' +
                '<td style="text-align:center">' + unit + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.empCode || '-') + '</td>' +
                '<td>' + (r.empName || '-') + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.dept || '-') + '</td>' +
                '<td style="text-align:center">' + issueTypeBadge(r.issueType) + '</td>' +
                '<td style="color:#888;font-size:12px">' + (r.note || '-') + '</td>';
    } else if (isUniform) {
      extraTd = '<td style="text-align:center">' + (size || '-') + '</td>' +
                '<td style="text-align:center;color:#dc2626;font-weight:bold">-' + r.qty + '</td>' +
                '<td style="text-align:center">' + unit + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.empCode || '-') + '</td>' +
                '<td>' + (r.empName || '-') + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.dept || '-') + '</td>' +
                '<td style="text-align:center">' + issueTypeBadge(r.issueType) + '</td>' +
                '<td style="color:#888;font-size:12px">' + (r.note || '-') + '</td>';
      // คืน row ตรงนี้สำหรับ uniform (layout ต่างออกไป)
      return '<tr style="background:' + bg + '">' +
        '<td style="text-align:center;white-space:nowrap">' + toDisplayDate(r.date) + '</td>' +
        '<td style="font-size:12px;color:#888">' + r.itemCode + '</td>' +
        '<td><b>' + r.itemName + '</b></td>' +
        extraTd +
        '<td style="text-align:center"><button class="btn btn-red btn-sm" onclick="delIssueRow(\'' + sys + '\',' + r.rowIndex + ')">🗑️</button></td></tr>';
    } else if (isMedicine) {
      extraTd = '<td style="text-align:center;color:#dc2626;font-weight:bold">-' + r.qty + '</td>' +
                '<td style="text-align:center">' + unit + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.empCode || '-') + '</td>' +
                '<td>' + (r.empName || '-') + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.dept || '-') + '</td>' +
                '<td style="font-size:12px">' + (r.symptom || '-') + '</td>' +
                '<td style="color:#888;font-size:12px">' + (r.note || '-') + '</td>';
    } else if (isOffice) {
      // Office
      extraTd = '<td style="text-align:center;color:#dc2626;font-weight:bold">-' + r.qty + '</td>' +
                '<td style="text-align:center">' + unit + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.empCode || '-') + '</td>' +
                '<td>' + (r.empName || '-') + '</td>' +
                '<td style="text-align:center;font-size:12px">' + (r.dept || '-') + '</td>' +
                '<td style="text-align:center">' + issueTypeBadge(r.issueType) + '</td>' +
                '<td style="color:#888;font-size:12px">' + (r.note || '-') + '</td>';
      return '<tr style="background:' + bg + '">' +
        '<td style="text-align:center;white-space:nowrap">' + toDisplayDate(r.date) + '</td>' +
        '<td style="font-size:12px;color:#888">' + r.itemCode + '</td>' +
        '<td><b>' + r.itemName + '</b></td>' +
        extraTd +
        '<td style="text-align:center"><button class="btn btn-red btn-sm" onclick="delIssueRow(\'' + sys + '\',' + r.rowIndex + ')">🗑️</button></td></tr>';                
    }

    if (isMachine) {
      return '<tr style="background:' + bg + '">' +
        '<td style="text-align:center;white-space:nowrap">' + toDisplayDate(r.date) + '</td>' +
        '<td style="font-size:12px;color:#888">' + r.itemCode + '</td>' +
        '<td><b>' + r.itemName + '</b></td>' +
        extraTd +
        '<td style="text-align:center"><button class="btn btn-red btn-sm" onclick="delIssueRow(\'' + sys + '\',' + r.rowIndex + ')">🗑️</button></td></tr>';
    }

    return '<tr style="background:' + bg + '">' +
      '<td style="text-align:center;white-space:nowrap">' + toDisplayDate(r.date) + '</td>' +
      '<td style="font-size:12px;color:#888">' + r.itemCode + '</td>' +
      '<td><b>' + r.itemName + '</b></td>' +
      extraTd +
      '<td style="text-align:center"><button class="btn btn-red btn-sm" onclick="delIssueRow(\'' + sys + '\',' + r.rowIndex + ')">🗑️</button></td></tr>';
  }).join('');

  var tbody = document.getElementById('iss-tbody');
  var colCount = isMachine ? 13 : isUniform ? 13 : isMedicine ? 12 : 11;
  if (tbody) tbody.innerHTML = rows || '<tr><td colspan="' + colCount + '" style="text-align:center;color:#888;padding:20px">ไม่พบข้อมูล</td></tr>';
  var cnt = document.getElementById('iss-filter-count');
  if (cnt) cnt.textContent = '(' + data.length + ' รายการ)';
}

function filterIssueTable() {
  var sys   = currentApp;
  var data  = _cache[sys + '_issues'] || [];
  var qEmp  = ((document.getElementById('iss-filter-emp')  || {}).value || '').toLowerCase();
  var qItem = ((document.getElementById('iss-filter-item') || {}).value || '').toLowerCase();
  var df    = (document.getElementById('iss-filter-df') || {}).value || '';
  var dt    = (document.getElementById('iss-filter-dt') || {}).value || '';
  var filtered = data.filter(function(r) {
    return (!qEmp  || (r.empName || '').toLowerCase().includes(qEmp) || (r.empCode || '').toLowerCase().includes(qEmp))
        && (!qItem || (r.itemName || '').toLowerCase().includes(qItem) || (r.itemCode || '').toLowerCase().includes(qItem))
        && (!df    || r.date >= df)
        && (!dt    || r.date <= dt);
  });
  var orig = _cache[sys + '_issues'];
  _cache[sys + '_issues'] = filtered;
  renderIssueTable(sys);
  _cache[sys + '_issues'] = orig;
  var cnt = document.getElementById('iss-filter-count');
  if (cnt) cnt.textContent = '(' + filtered.length + ' รายการ)';
}

function clearIssueFilter() {
  ['iss-filter-emp','iss-filter-item','iss-filter-df','iss-filter-dt'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  renderIssueTable(currentApp);
}

function delIssueRow(sys, rowIndex) {
  if (!confirm('ลบรายการนี้?')) return;
  gas('deleteIssue', [sys, rowIndex, currentAdmin], function(res) {
    if (res.ok) { showToast('🗑️ ลบแล้ว', '#ea580c'); renderIssue(sys); }
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

// ============================================================
//  BALANCE — ข้อ 7: DD/MM/YYYY
// ============================================================
function balRowHtml_(sys, item, idx) {
  var isMedicine = sys === 'medicine', isUniform = sys === 'uniform', isMachine = sys === 'machine';
  var extraTd = isMedicine
    ? '<td style="text-align:center;font-size:12px;color:' + (item.extra1 && daysTillExp(item.extra1) <= 30 ? '#dc2626' : '#555') + '">' + (item.extra1 ? toDisplayDate(item.extra1) : '-') + '</td>'
    : isUniform ? '<td style="text-align:center">' + (item.extra2 || '-') + '</td>'
    : isMachine ? '<td style="text-align:center;font-size:12px">' + (item.extra1 || '-') + '</td>' : '';
  var nameCell = '<b>' + item.itemName + '</b>' + (item.verified !== 'Y' ? '<br>' + verifiedBadge(item.verified) : '');
  return '<tr class="bal-row" onclick="openPreviewModal(\'' + item.itemCode + '\')" style="background:' + (idx % 2 === 0 ? '#fafafa' : '#fff') + '"><td style="text-align:center">' + imgOrPh(item.imageUrl, 36) + '</td><td style="font-size:11px;color:#888;text-align:center">' + item.itemCode + '</td><td>' + nameCell + '</td>' + extraTd + '<td style="text-align:center;font-size:12px">' + item.category + '</td><td style="text-align:center">' + item.unit + '</td><td style="text-align:center;color:#16a34a;font-weight:bold">' + item.totalIn + '</td><td style="text-align:center;color:#dc2626;font-weight:bold">' + item.totalOut + '</td><td style="text-align:center;font-weight:bold;font-size:15px">' + item.balance + '</td><td style="text-align:center;color:#888">' + item.minStock + '</td><td style="text-align:center"><span class="badge ' + badgeCls(item.status) + '">' + item.status + '</span></td></tr>';
}

function renderBalance(sys) {
  var col = sysColor(sys);
  var isMedicine = sys === 'medicine', isUniform = sys === 'uniform', isMachine = sys === 'machine';
  var extraTh = isMedicine ? '<th>หมดอายุ</th>' : isUniform ? '<th>ไซส์</th>' : isMachine ? '<th>Part No.</th>' : '';
  document.getElementById('app-content').innerHTML = '<div style="text-align:center;padding:40px;color:#888">⏳ กำลังคำนวณยอดคงเหลือ...</div>';
  gas('getBalance', [sys], function(res) {
    if (!res || !res.ok) {
      document.getElementById('app-content').innerHTML =
        '<div style="padding:20px;color:#dc2626;background:#fff;border-radius:12px">' +
        '❌ ' + (res ? res.message : 'ดึงข้อมูลไม่ได้') +
        '<br><br><button class="btn btn-blue btn-sm" onclick="renderBalance(\'' + sys + '\')">🔄 ลองใหม่</button></div>';
      return;
    }
    var rows = (res.data || []).map(function(item, idx) { return balRowHtml_(sys, item, idx); }).join('');
    document.getElementById('app-content').innerHTML =
      '<div class="card"><div class="card-title" style="color:' + col + '">📊 ยอดคงเหลือ Real-Time ' +
      '<input type="text" id="bal-q" placeholder="🔍 ค้นหา..." style="width:180px;font-size:13px" oninput="filterBalanceTable()"></div>' +
      '<div style="overflow-x:auto" id="bal-table-wrap"><table><thead><tr style="background:' + col + ';color:#fff"><th>รูป</th><th>รหัส</th><th>ชื่อ</th>' + extraTh + '<th>หมวดหมู่</th><th>หน่วย</th><th>รับเข้า</th><th>เบิกจ่าย</th><th>คงเหลือ</th><th>ขั้นต่ำ</th><th>สถานะ</th></tr></thead><tbody id="bal-body">' + rows + '</tbody></table></div></div>';
    _cache[sys + '_balance'] = res.data;
  }, function(err) {
    document.getElementById('app-content').innerHTML =
      '<div style="padding:20px;color:#dc2626;background:#fff;border-radius:12px">' +
      '❌ เชื่อมต่อ Sheets ไม่ได้: ' + (err.message || err) +
      '<br><br><button class="btn btn-blue btn-sm" onclick="renderBalance(\'' + sys + '\')">🔄 ลองใหม่</button></div>';
  });
}

function filterBalanceTable() {
  var q = document.getElementById('bal-q').value.toLowerCase();
  var sys = currentApp;
  var data = _cache[sys + '_balance'] || [];
  var filtered = data.filter(function(i) {
    return i.itemName.toLowerCase().includes(q) || i.itemCode.toLowerCase().includes(q) || (i.aliases || '').toLowerCase().includes(q);
  });
  var rows = filtered.map(function(item, idx) { return balRowHtml_(sys, item, idx); }).join('');
  var tbody = document.getElementById('bal-body');
  if (tbody) tbody.innerHTML = rows || '<tr><td colspan="11" style="text-align:center;color:#888;padding:20px">ไม่พบข้อมูล</td></tr>';
}

// ============================================================
//  PRODUCT PREVIEW MODAL + UNVERIFIED BADGE TOGGLE [v6.1]
// ============================================================
var _previewItem = null;

function openPreviewModal(itemCode) {
  var sys = currentApp;
  var data = _cache[sys + '_balance'] || [];
  var item = data.filter(function(i) { return i.itemCode === itemCode; })[0];
  if (!item) { showToast('❌ ไม่พบข้อมูลสินค้า', '#dc2626'); return; }
  _previewItem = item;
  renderPreviewBody_(sys, item);
  document.getElementById('preview-modal').classList.add('show');
}

function renderPreviewBody_(sys, item) {
  var isMedicine = sys === 'medicine', isUniform = sys === 'uniform', isMachine = sys === 'machine';
  var extraInfo = '';
  if (isMedicine && item.extra1) extraInfo = '<div><b>หมดอายุ:</b> ' + toDisplayDate(item.extra1) + '</div>';
  else if (isUniform && item.extra2) extraInfo = '<div><b>ไซส์:</b> ' + item.extra2 + '</div>';
  else if (isMachine && item.extra1) extraInfo = '<div><b>Part No.:</b> ' + item.extra1 + '</div>';
  var toggleLabel = item.verified === 'Y' ? '⚪ ยกเลิกการนับสต็อค' : '✅ ยืนยันว่านับสต็อคแล้ว';
  document.getElementById('preview-body').innerHTML =
    '<div class="pv-img-wrap">' + (item.imageUrl ? '<img src="' + item.imageUrl + '" onerror="this.style.display=\'none\'">' : '<div class="img-ph">📦</div>') + '</div>' +
    '<div class="pv-badge-row" onclick="toggleVerified()" title="คลิกเพื่อ' + toggleLabel + '">' + verifiedBadge(item.verified) + '</div>' +
    '<div class="pv-name">' + item.itemName + '</div>' +
    '<div class="pv-code">' + item.itemCode + '</div>' +
    '<div class="pv-grid">' +
      '<div><b>หมวดหมู่:</b> ' + item.category + '</div>' +
      '<div><b>หน่วย:</b> ' + item.unit + '</div>' +
      '<div><b>รับเข้าสะสม:</b> ' + item.totalIn + '</div>' +
      '<div><b>เบิกจ่ายสะสม:</b> ' + item.totalOut + '</div>' +
      '<div><b>คงเหลือ:</b> ' + item.balance + ' ' + item.unit + '</div>' +
      '<div><b>ขั้นต่ำ:</b> ' + item.minStock + '</div>' +
      extraInfo +
    '</div>' +
    '<div class="pv-status-row"><span class="badge ' + badgeCls(item.status) + '">' + item.status + '</span></div>' +
    '<div style="text-align:center;margin-top:10px;font-size:11px;color:#888">คลิกที่ป้าย UNVERIFIED ด้านบนเพื่อเปลี่ยนสถานะ</div>';
}

function toggleVerified() {
  if (!_previewItem) return;
  var sys = currentApp;
  var newVerified = _previewItem.verified === 'Y' ? false : true;
  gas('setVerifiedStatus', [_previewItem.itemCode, newVerified, currentAdmin], function(res) {
    if (!res || !res.ok) { showToast('❌ ' + (res ? res.message : 'บันทึกไม่สำเร็จ'), '#dc2626'); return; }
    var newVal = res.verified; // 'Y' หรือ 'N'
    _previewItem.verified = newVal;
    var arr = _cache[sys + '_balance'] || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].itemCode === _previewItem.itemCode) { arr[i].verified = newVal; break; }
    }
    renderPreviewBody_(sys, _previewItem);
    showToast('✅ อัปเดตสถานะสำเร็จ', '#16a34a');
    if (_currentTab === 'balance' && document.getElementById('bal-body')) filterBalanceTable();
  });
}

// ============================================================
//  SETTINGS
// ============================================================
var _settingsTab = 'admin';

function openSettings() {
  document.getElementById('settings-modal').classList.add('show');
  switchSettingsTab('admin');
}

function switchSettingsTab(tab) {
  _settingsTab = tab;
  ['admin','emp','dept','pw','logs'].forEach(function(t) {
    var btn = document.getElementById('stab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  var content = document.getElementById('settings-content');
  content.innerHTML = '<div style="text-align:center;padding:20px;color:#888">⏳ กำลังโหลด...</div>';
  if (tab === 'admin') renderSettingsAdmin();
  else if (tab === 'emp') renderSettingsEmp();
  else if (tab === 'dept') renderSettingsDept();
  else if (tab === 'pw') renderSettingsPw();
  else if (tab === 'logs') renderSettingsLogs();
}

function renderSettingsAdmin() {
  gas('getAdminList', [], function(res) {
    var names = res.ok ? res.data : [];
    var html = '<div style="font-size:13px;color:#555;margin-bottom:8px">รายชื่อแอดมินที่สามารถ Login ได้</div>';
    html += '<div class="tag-list" id="adm-name-tags">' + names.map(function(n, i) {
      return '<span class="tag">' + n + '<button onclick="delAdminName(' + i + ')">×</button></span>';
    }).join('') + '</div>';
    html += '<hr class="section-divider"><div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="adm-new-name" placeholder="ชื่อแอดมินใหม่" style="flex:1"><button class="btn btn-blue btn-sm" onclick="addAdminName()">➕ เพิ่ม</button></div>';
    document.getElementById('settings-content').innerHTML = html;
    window._settingsAdminNames = names;
  });
}

function addAdminName() {
  var v = document.getElementById('adm-new-name').value.trim();
  if (!v) return;
  window._settingsAdminNames.push(v);
  gas('saveAdminList', [window._settingsAdminNames, currentAdmin], function(res) {
    if (res.ok) { showToast('✅ เพิ่มแอดมินแล้ว', '#16a34a'); renderSettingsAdmin(); }
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

function delAdminName(idx) {
  window._settingsAdminNames.splice(idx, 1);
  gas('saveAdminList', [window._settingsAdminNames, currentAdmin], function(res) {
    if (res.ok) renderSettingsAdmin();
  });
}

function renderSettingsEmp() {
  gas('getEmployees', [], function(res) {
    var emps = res.ok ? res.data : [];
    _cache['employees'] = emps;
    var html = '<div class="grid3" style="margin-bottom:8px">' +
      '<div><label>รหัส</label><input type="text" id="adm-emp-code" placeholder="EMP001"></div>' +
      '<div><label>ชื่อ-นามสกุล</label><input type="text" id="adm-emp-name" placeholder="ชื่อ นามสกุล"></div>' +
      '<div><label>แผนก</label><input type="text" id="adm-emp-dept" placeholder="แผนก"></div>' +
      '</div>';
    html += '<button class="btn btn-blue btn-sm" onclick="addEmp()">➕ เพิ่มพนักงาน</button>';
    html += '<div class="tag-list" id="adm-emp-tags" style="margin-top:10px">' + emps.map(function(e) {
      var deptText = e.department ? ' | ' + e.department : '';
      return '<span class="tag">' + e.code + ' — ' + e.name + deptText + '<button onclick="delEmp(\'' + e.code + '\')">×</button></span>';
    }).join('') + '</div>';
    document.getElementById('settings-content').innerHTML = html;
  });
}

function addEmp() {
  var code = document.getElementById('adm-emp-code').value.trim();
  var name = document.getElementById('adm-emp-name').value.trim();
  var dept = document.getElementById('adm-emp-dept').value.trim();
  if (!code || !name) { alert('กรุณากรอกรหัสและชื่อ'); return; }
  gas('saveEmployee', [code, name, dept, currentAdmin], function(res) {
    if (res.ok) { showToast('✅ เพิ่มพนักงานแล้ว', '#16a34a'); renderSettingsEmp(); }
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

function delEmp(code) {
  if (!confirm('ลบพนักงาน ' + code + '?')) return;
  gas('deleteEmployee', [code, currentAdmin], function(res) {
    if (res.ok) { renderSettingsEmp(); }
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

function renderSettingsDept() {
  gas('getDepartments', [], function(res) {
    var depts = res.ok ? res.data : [];
    _cache['departments'] = depts;
    var html = '<div style="display:flex;gap:8px;margin-bottom:8px"><input type="text" id="adm-dept-input" placeholder="ชื่อแผนก" style="flex:1"><button class="btn btn-blue btn-sm" onclick="addDept()">➕ เพิ่ม</button></div>';
    html += '<div class="tag-list">' + depts.map(function(d) {
      return '<span class="tag">' + d + '<button onclick="delDept(\'' + d.replace(/'/g, "\\'") + '\')">×</button></span>';
    }).join('') + '</div>';
    document.getElementById('settings-content').innerHTML = html;
  });
}

function addDept() {
  var v = document.getElementById('adm-dept-input').value.trim();
  if (!v) return;
  gas('saveDepartment', [v, currentAdmin], function(res) {
    if (res.ok) { showToast('✅ เพิ่มแผนกแล้ว', '#16a34a'); renderSettingsDept(); }
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

function delDept(name) {
  if (!confirm('ลบแผนก "' + name + '"?')) return;
  gas('deleteDepartment', [name, currentAdmin], function(res) {
    if (res.ok) renderSettingsDept();
    else showToast('❌ ' + res.message, '#dc2626');
  });
}

function renderSettingsPw() {
  document.getElementById('settings-content').innerHTML =
    '<div class="grid2"><div><label>รหัสผ่านเดิม</label><input type="password" id="adm-old-pw"></div>' +
    '<div><label>รหัสผ่านใหม่</label><input type="password" id="adm-new-pw"></div>' +
    '<div><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="adm-new-pw2"></div></div>' +
    '<button class="btn btn-blue btn-sm" style="margin-top:8px" onclick="changePw()">🔑 เปลี่ยนรหัสผ่าน</button>';
}

function changePw() {
  var old = document.getElementById('adm-old-pw').value;
  var n1  = document.getElementById('adm-new-pw').value;
  var n2  = document.getElementById('adm-new-pw2').value;
  if (!old || !n1) { alert('กรุณากรอกรหัสผ่านให้ครบ'); return; }
  if (n1 !== n2) { alert('รหัสผ่านใหม่ไม่ตรงกัน'); return; }
  gas('changePassword', [old, n1, currentAdmin], function(res) {
    if (res.ok) { showToast('✅ เปลี่ยนรหัสผ่านสำเร็จ', '#16a34a'); renderSettingsPw(); }
    else showToast('❌ ' + (res.message || 'เปลี่ยนไม่สำเร็จ'), '#dc2626');
  });
}

function renderSettingsLogs() {
  gas('getAdminLogs', [100], function(res) {
    var logs = res.ok ? res.data : [];
    var html = '<div style="font-size:12px;color:#888;margin-bottom:8px">แสดง ' + logs.length + ' รายการล่าสุด (จากทั้งหมด ' + (res.total || '?') + ')</div>';
    html += '<div style="overflow-x:auto"><table><thead><tr style="background:#1e293b;color:#fff"><th>เวลา</th><th>แอดมิน</th><th>กิจกรรม</th><th>รายละเอียด</th></tr></thead><tbody>';
    logs.forEach(function(l, idx) {
      html += '<tr style="background:' + (idx % 2 === 0 ? '#fafafa' : '#fff') + '"><td style="font-size:11px;white-space:nowrap">' + l.timestamp + '</td><td><b>' + l.adminName + '</b></td><td><span class="badge badge-ok">' + l.activity + '</span></td><td style="font-size:12px;color:#888">' + l.detail + '</td></tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('settings-content').innerHTML = html;
  });
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ============================================================
//  REPORTS — สรุปค่าใช้จ่ายพนักงาน
// ============================================================
var _deductSearched = false; // true เมื่อกดยืนยันพร้อมกรอกวันที่ครบแล้วเท่านั้น
var _deductData = []; // cache ข้อมูลดิบทั้งหมด

function renderDeductionReport() {
  var col = '#b45309';
  document.getElementById('app-content').innerHTML =
    '<div class="card">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px">' +
        '<div style="flex:1;min-width:160px"><label>🔍 ค้นหา (ชื่อ/รหัส/สินค้า/แผนก)</label><input type="text" id="rpt-q" placeholder="พิมพ์เพื่อค้นหา..."></div>' +
        '<div><label>วันที่เริ่ม *</label><input type="date" id="rpt-df"></div>' +
        '<div><label>วันที่สิ้นสุด</label><input type="date" id="rpt-dt"></div>' +
        '<button class="btn btn-green btn-sm" style="align-self:flex-end" onclick="exportDeductExcel()">📥 Export Excel</button>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px">' +
          '<div style="flex:1;min-width:160px"><label>👤 ชื่อพนักงาน</label>' +
          '<div class="sw"><input type="text" id="rpt-emp-search" placeholder="พิมพ์ชื่อ..." autocomplete="off" oninput="filterRptEmpDD()">' +
          '<input type="hidden" id="rpt-emp-val"><div class="ddl" id="rpt-emp-list"></div></div></div>' +
        '<div style="width:130px"><label>รหัสพนักงาน</label><input type="text" id="rpt-emp-code" readonly class="af-box"></div>' +
        '<div style="width:160px"><label>แผนก (ของพนักงาน)</label><input type="text" id="rpt-emp-dept" readonly class="af-box"></div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px">' +
        '<div style="min-width:160px"><label>📦 หมวดหมู่สินค้า</label>' +
          '<select id="rpt-cat"><option value="">-- ทั้งหมด --</option>' +
          '<option value="office">Office</option><option value="medicine">Medicine</option>' +
          '<option value="machine">Machine</option><option value="uniform">Uniform</option></select></div>' +
        '<div style="min-width:160px"><label>🏢 แผนก (ทั้งแผนก)</label>' +
          '<select id="rpt-dept"><option value="">-- ทั้งหมด --</option></select></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-blue btn-sm" onclick="loadDeductData()">🔍 ยืนยัน / ค้นหา</button>' +
        '<button class="btn btn-gray btn-sm" onclick="resetDeductFilter()">✖ ล้างค่าทั้งหมด</button>' +
      '</div>' +
    '</div>' +
    '<div class="card" style="padding-bottom:60px">' +
      '<div style="overflow-x:auto"><table>' +
        '<thead><tr style="background:' + col + ';color:#fff">' +
          '<th>วันที่</th><th>แผนก</th><th>รหัสพนักงาน</th><th>ชื่อพนักงาน</th><th>หมวดหมู่</th>' +
          '<th>รหัสสินค้า</th><th>รายการที่เบิก</th><th>Part No.</th><th>ราคา/หน่วย</th>' +
          '<th>จำนวนเบิก</th><th>ยอดรวม</th><th>หมายเหตุ</th>' +
        '</tr></thead>' +
        '<tbody id="rpt-tbody"><tr><td colspan="12" style="text-align:center;color:#888;padding:30px">กรุณาเลือก "วันที่เริ่ม" แล้วกด "ยืนยัน / ค้นหา"</td></tr></tbody>' +
      '</table></div>' +
    '</div>' +
    '<div id="rpt-footer" style="position:fixed;bottom:0;left:0;right:0;background:#eacc25;color:#1e293b;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:15px;box-shadow:0 -2px 10px rgba(0,0,0,.15);z-index:500">' +
      '<span>💰 ยอดรวมเงินทั้งหมด </span><span id="rpt-total">— บาท</span>' +
    '</div>';

  var emps = _cache['employees'];
  if (emps) _initRptEmpSearch(emps);
  else gas('getEmployees', [], function(res) {
    if (res.ok) { _cache['employees'] = res.data; _initRptEmpSearch(res.data); }
  });

  gas('getDepartments', [], function(res) {
    if (!res.ok) return;
    var sel = document.getElementById('rpt-dept');
    res.data.forEach(function(d) { sel.innerHTML += '<option value="' + d + '">' + d + '</option>'; });
  });
}

function _initRptEmpSearch(emps) {
  window._rptEmps = emps;
}

function filterRptEmpDD() {
  var q = (document.getElementById('rpt-emp-search').value || '').toLowerCase();
  var emps = window._rptEmps || [];
  var lst = document.getElementById('rpt-emp-list');
  var filtered = q ? emps.filter(function(e){ return (e.name||'').toLowerCase().includes(q)||(e.code||'').toLowerCase().includes(q); }) : [];
  lst.innerHTML = filtered.map(function(e){
    return '<div class="ddi" onmousedown="selectRptEmp(\'' + e.code.replace(/'/g,"\\'") + '\',\'' + e.name.replace(/'/g,"\\'") + '\',\'' + (e.department||'').replace(/'/g,"\\'") + '\')">' + e.name + ' (' + e.code + ')</div>';
  }).join('');
  lst.style.display = filtered.length ? 'block' : 'none';
}

function selectRptEmp(code, name, dept) {
  document.getElementById('rpt-emp-search').value = name;
  document.getElementById('rpt-emp-val').value = code;
  document.getElementById('rpt-emp-code').value = code;
  document.getElementById('rpt-emp-dept').value = dept;
  document.getElementById('rpt-emp-list').style.display = 'none';
  // ลบบรรทัด applyDeductFilter(); ทิ้ง — ต้องรอกด "ยืนยัน" เท่านั้น
}

function _initRptDeptDD(emps) {
  var depts = [];
  emps.forEach(function(e){ if (e.department && depts.indexOf(e.department) === -1) depts.push(e.department); });
  var sel = document.getElementById('rpt-dept');
  if (!sel) return;
  depts.forEach(function(d){ sel.innerHTML += '<option value="' + d + '">' + d + '</option>'; });
}

function loadDeductData() {
  var df = (document.getElementById('rpt-df')||{}).value || '';
  var dt = (document.getElementById('rpt-dt')||{}).value || '';
  if (!df) {
    showToast('⚠️ กรุณาเลือก "วันที่เริ่ม" ก่อนค้นหา', '#dc2626');
    _deductSearched = false;
    applyDeductFilter();
    return;
  }
  _deductSearched = true;
  showLoading(true, '⏳ กำลังดึงข้อมูล...');
  gas('getDeductionReport', [df, dt], function(res) {
    _deductData = res.ok ? res.data : [];
    if (!res.ok) showToast('❌ ดึงข้อมูลไม่ได้: ' + (res.message||''), '#dc2626');
    applyDeductFilter();
  });
}

function applyDeductFilter() {
  var tbody = document.getElementById('rpt-tbody');
  var totalEl = document.getElementById('rpt-total');
  if (!_deductSearched) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#888;padding:30px">กรุณาเลือก "วันที่เริ่ม" แล้วกด "ยืนยัน / ค้นหา"</td></tr>';
    if (totalEl) totalEl.textContent = '— บาท';
    return;
  }

  var q       = ((document.getElementById('rpt-q')||{}).value||'').toLowerCase();
  var empCode = ((document.getElementById('rpt-emp-val')||{}).value||'');
  var cat     = ((document.getElementById('rpt-cat')||{}).value||'');
  var dept    = ((document.getElementById('rpt-dept')||{}).value||'');

  var filtered = _deductData.filter(function(r) {
    var matchQ   = !q || (r.empName||'').toLowerCase().includes(q)
                      || (r.empCode||'').toLowerCase().includes(q)
                      || (r.department||'').toLowerCase().includes(q)
                      || (r.itemName||'').toLowerCase().includes(q)
                      || (r.itemCode||'').toLowerCase().includes(q);
    var matchEmp  = !empCode || r.empCode === empCode;
    var matchCat  = !cat || r.stockType === cat;
    var matchDept = !dept || r.department === dept;
    return matchQ && matchEmp && matchCat && matchDept;
  });

  var STOCK_LABEL = { office:'Office', machine:'Machine', uniform:'Uniform', medicine:'Medicine' };
  var total = 0;
  var rows = filtered.map(function(r, idx) {
    total += r.totalAmount;
    return '<tr style="background:' + (idx%2===0?'#fafafa':'#fff') + '">' +
      '<td style="white-space:nowrap">' + toDisplayDate(r.date) + '</td>' +
      '<td>' + (r.department||'-') + '</td>' +
      '<td style="text-align:center">' + (r.empCode||'-') + '</td>' +
      '<td>' + (r.empName||'-') + '</td>' +
      '<td style="text-align:center"><span class="badge badge-ok">' + (STOCK_LABEL[r.stockType]||r.stockType) + '</span></td>' +
      '<td style="text-align:center;font-size:12px">' + (r.itemCode||'-') + '</td>' +
      '<td>' + (r.itemName||'-') + '</td>' +
      '<td style="text-align:center;color:#0070c0;font-size:12px">' + (r.partNo||'-') + '</td>' +
      '<td style="text-align:right">' + (r.pricePerUnit > 0 ? r.pricePerUnit.toLocaleString('th-TH',{minimumFractionDigits:2}) : '-') + '</td>' +
      '<td style="text-align:center;font-weight:bold">' + r.qty + '</td>' +
      '<td style="text-align:right;font-weight:bold;color:#b45309">' + r.totalAmount.toLocaleString('th-TH',{minimumFractionDigits:2}) + '</td>' +
      '<td style="color:#888;font-size:12px">' + (r.note||'-') + '</td>' +
    '</tr>';
  }).join('');

  if (tbody) tbody.innerHTML = rows || '<tr><td colspan="12" style="text-align:center;color:#888;padding:20px">ไม่พบข้อมูล</td></tr>';
  if (totalEl) totalEl.textContent = total.toLocaleString('th-TH',{minimumFractionDigits:2}) + ' บาท';
}

function resetDeductFilter() {
  ['rpt-q','rpt-df','rpt-dt','rpt-emp-val','rpt-emp-code','rpt-emp-dept','rpt-cat','rpt-dept'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value='';
  });
  var s = document.getElementById('rpt-emp-search'); if(s) s.value='';
  _deductData = [];
  _deductSearched = false;
  applyDeductFilter();
}

function exportDeductExcel() {
  if (!_deductSearched) { showToast('⚠️ กรุณาค้นหาข้อมูลก่อน Export', '#dc2626'); return; }
  var q       = ((document.getElementById('rpt-q')||{}).value||'').toLowerCase();
  var empCode = ((document.getElementById('rpt-emp-val')||{}).value||'');
  var cat     = ((document.getElementById('rpt-cat')||{}).value||'');
  var dept    = ((document.getElementById('rpt-dept')||{}).value||'');

  var filtered = _deductData.filter(function(r) {
    var matchQ   = !q || (r.empName||'').toLowerCase().includes(q) || (r.empCode||'').toLowerCase().includes(q)
                      || (r.department||'').toLowerCase().includes(q) || (r.itemName||'').toLowerCase().includes(q)
                      || (r.itemCode||'').toLowerCase().includes(q);
    return matchQ && (!empCode || r.empCode === empCode) && (!cat || r.stockType === cat) && (!dept || r.department === dept);
  });

  var BOM = '\uFEFF';
  var header = 'วันที่,แผนก,รหัสพนักงาน,ชื่อพนักงาน,หมวดหมู่,รหัสสินค้า,รายการ,Part No.,ราคา/หน่วย,จำนวน,ยอดรวม,หมายเหตุ\n';
  var rows = filtered.map(function(r) {
    return [toDisplayDate(r.date), r.department, r.empCode, r.empName, r.stockType, r.itemCode, r.itemName, r.partNo, r.pricePerUnit, r.qty, r.totalAmount, r.note]
      .map(function(v){ return '"' + (v||'').toString().replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');

  var blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var df = (document.getElementById('rpt-df')||{}).value||'', dt = (document.getElementById('rpt-dt')||{}).value||'';
  a.href = url; a.download = 'deduction_report_' + (df||'all') + '_' + (dt||'all') + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ============================================================
//  REPORTS — Dashboard กราฟ
// ============================================================
var _dashCharts = {}; // เก็บ Chart instances เพื่อ destroy ก่อน re-render

function _destroyCharts() {
  Object.keys(_dashCharts).forEach(function(k) { if(_dashCharts[k]) { _dashCharts[k].destroy(); delete _dashCharts[k]; } });
}

function renderSummaryDashboard() {
  var col = '#b45309';
  document.getElementById('app-content').innerHTML =
    '<div class="card">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
        '<div><label>วันที่เริ่ม</label><input type="date" id="db-df"></div>' +
        '<div><label>วันที่สิ้นสุด</label><input type="date" id="db-dt"></div>' +
        '<div style="min-width:220px"><label>ประเภทกราฟ</label>' +
          '<select id="db-type" onchange="renderDashChart()">' +
            '<option value="1">1 — อัตราการเบิกจ่ายอะไหล่</option>' +
            '<option value="2">2 — การเบิกอะไหล่ตามเครื่องจักร</option>' +
            '<option value="3">3 — รวมอัตราค่าใช้จ่าย</option>' +
            '<option value="4">4 — ค่าใช้จ่ายรายปี (ทุกปี)</option>' +
          '</select></div>' +
        '<button class="btn btn-blue btn-sm" style="align-self:flex-end" onclick="loadDashData()">🔍 โหลดข้อมูล</button>' +
      '</div>' +
    '</div>' +
    '<div id="db-content"><div style="text-align:center;padding:40px;color:#888">เลือกช่วงวันที่แล้วกด "โหลดข้อมูล"</div></div>';
}

var _dashData = null;

function loadDashData() {
  var df = (document.getElementById('db-df')||{}).value||'';
  var dt = (document.getElementById('db-dt')||{}).value||'';
  var type = (document.getElementById('db-type')||{}).value||'1';
  // ประเภท 4 ไม่ใช้ filter วันที่
  if (type === '4') { df = ''; dt = ''; }
  showLoading(true, '⏳ กำลังดึงข้อมูล...');
  gas('getDashboardReport', [df, dt], function(res) {
    if (!res.ok) { showToast('❌ ' + (res.message||'ดึงข้อมูลไม่ได้'), '#dc2626'); return; }
    _dashData = res;
    renderDashChart();
  });
}

function renderDashChart() {
  if (!_dashData) return;
  var type = (document.getElementById('db-type')||{}).value||'1';
  _destroyCharts();
  if (type === '1') _renderChart1(_dashData);
  else if (type === '2') _renderChart2(_dashData);
  else if (type === '3') _renderChart3(_dashData);
  else if (type === '4') _renderChart4(_dashData);
}

// ---- ประเภท 1: อัตราการเบิกจ่ายอะไหล่ ----
function _renderChart1(d) {
  var TYPES = ['office','machine','uniform','medicine'];
  var LABELS = {office:'Office',machine:'Machine',uniform:'Uniform',medicine:'Medicine'};
  var COLORS = ['#0070c0','#ea580c','#7c3aed','#16a34a'];

  var qtyByType = {office:0,machine:0,uniform:0,medicine:0};
  d.issueRows.forEach(function(r){ qtyByType[r._stockType] = (qtyByType[r._stockType]||0) + (Number(r.qty)||0); });
  var totalQty = TYPES.reduce(function(s,t){ return s + qtyByType[t]; }, 0);

  // grouping per-type top items
  var itemsByType = {};
  TYPES.forEach(function(st){ itemsByType[st] = {}; });
  d.issueRows.forEach(function(r){
    var m = itemsByType[r._stockType];
    if(!m[r.item_code]) m[r.item_code] = { name: r.item_name||r.item_code, qty: 0 };
    m[r.item_code].qty += Number(r.qty)||0;
  });

  var html = '<div class="card"><div class="card-title" style="color:#b45309">📊 สัดส่วนการเบิกจ่ายตามหมวด</div>' +
    '<div style="max-width:360px;margin:0 auto"><canvas id="ch-pie"></canvas></div></div>' +
    '<div class="grid2">';
  TYPES.forEach(function(st, i) {
    var items = Object.values(itemsByType[st]).sort(function(a,b){ return b.qty-a.qty; }).slice(0,10);
    html += '<div class="card"><div class="card-title" style="color:' + COLORS[i] + '">' + LABELS[st] + '</div>' +
      '<canvas id="ch-bar-' + st + '" height="200"></canvas>' +
      '<div style="font-size:12px;color:#555;margin-top:10px">รวมเบิก: <b>' + qtyByType[st].toLocaleString() + '</b> หน่วย' +
      (totalQty > 0 ? ' (' + (qtyByType[st]/totalQty*100).toFixed(1) + '%)' : '') + '</div></div>';
  });
  html += '</div>';
  document.getElementById('db-content').innerHTML = html;

  // Pie
  _dashCharts['pie'] = new Chart(document.getElementById('ch-pie'), {
    type: 'pie',
    data: { labels: TYPES.map(function(t){ return LABELS[t]; }), datasets: [{ data: TYPES.map(function(t){ return qtyByType[t]; }), backgroundColor: COLORS }] },
    options: { plugins: { legend: { position:'bottom' } } }
  });

  // Bar per type
  TYPES.forEach(function(st, i) {
    var items = Object.values(itemsByType[st]).sort(function(a,b){ return b.qty-a.qty; }).slice(0,10);
    var el = document.getElementById('ch-bar-' + st);
    if (!el || !items.length) return;
    _dashCharts['bar-'+st] = new Chart(el, {
      type: 'bar',
      data: { labels: items.map(function(x){ return x.name.length>12?x.name.slice(0,12)+'…':x.name; }), datasets: [{ label: 'จำนวนเบิก', data: items.map(function(x){ return x.qty; }), backgroundColor: COLORS[i]+'cc' }] },
      options: { plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
    });
  });
}

// ---- ประเภท 2: เครื่องจักร ----
function _renderChart2(d) {
  var machMap = {};
  d.issueRows.filter(function(r){ return r._stockType==='machine' && r.machine_code; }).forEach(function(r){
    machMap[r.machine_code] = (machMap[r.machine_code]||0) + (Number(r.qty)||0);
  });
  var sorted = Object.entries(machMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,15);

  document.getElementById('db-content').innerHTML =
    '<div class="card"><div class="card-title" style="color:#ea580c">⚙️ เครื่องจักรที่เบิกอะไหล่มากที่สุด</div>' +
    '<canvas id="ch-mach" height="120"></canvas>' +
    '<div id="db-mach-summary" style="margin-top:14px;font-size:13px"></div></div>';

  if (!sorted.length) { document.getElementById('db-content').innerHTML += '<div style="color:#888;text-align:center">ไม่มีข้อมูล</div>'; return; }

  _dashCharts['mach'] = new Chart(document.getElementById('ch-mach'), {
    type: 'bar',
    data: { labels: sorted.map(function(x){ return x[0]; }), datasets: [{ label: 'จำนวนชิ้น', data: sorted.map(function(x){ return x[1]; }), backgroundColor: '#ea580ccc' }] },
    options: { plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
  });

  var rows = sorted.map(function(x,i){ return '<tr><td>'+(i+1)+'</td><td>'+x[0]+'</td><td style="text-align:right">'+x[1].toLocaleString()+'</td></tr>'; }).join('');
  document.getElementById('db-mach-summary').innerHTML = '<table><thead><tr style="background:#ea580c;color:#fff"><th>#</th><th>รหัสเครื่องจักร</th><th>จำนวนเบิก (ชิ้น)</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

// ---- ประเภท 3: รวมค่าใช้จ่าย ----
function _renderChart3(d) {
  var EMP_TYPES = ['self','new']; // พนักงานจ่าย
  var companyCost = 0, empByDept = {}, totalEmp = 0;

  d.issueRows.forEach(function(r) {
    var amt = Number(r.total_amount) || (Number(r.price_snapshot)||0)*(Number(r.qty)||0);
    var isEmp = EMP_TYPES.indexOf(r.issue_type) !== -1;
    if (isEmp) {
      var dept = r.department || 'ไม่ระบุแผนก';
      empByDept[dept] = (empByDept[dept]||0) + amt;
      totalEmp += amt;
    } else {
      companyCost += amt;
    }
  });

  // ต้นทุนสินค้าคงเหลือ
  var receiveMap = {}, issueMap = {}, latestPrice = {};
  d.receiveRows.forEach(function(r){
    receiveMap[r.item_code] = (receiveMap[r.item_code]||0) + (Number(r.qty)||0);
    if (Number(r.price) > 0 && !latestPrice[r.item_code]) latestPrice[r.item_code] = Number(r.price);
  });
  d.issueRows.forEach(function(r){ issueMap[r.item_code] = (issueMap[r.item_code]||0) + (Number(r.qty)||0); });
  var inventoryCost = 0;
  d.products.forEach(function(p){
    var balance = (receiveMap[p.item_code]||0) - (issueMap[p.item_code]||0);
    var price = latestPrice[p.item_code] || Number(p.price) || 0;
    if (balance > 0) inventoryCost += balance * price;
  });

  var depts = Object.keys(empByDept).sort(function(a,b){ return empByDept[b]-empByDept[a]; });
  var grandTotal = companyCost + totalEmp;

  var barLabels = ['ค่าใช้จ่ายบริษัท'].concat(depts);
  var barData = [companyCost].concat(depts.map(function(d){ return empByDept[d]; }));
  var barColors = ['#0070c0'].concat(depts.map(function(_,i){ return ['#ea580c','#7c3aed','#16a34a','#dc2626','#d97706'][i%5]; }));

  document.getElementById('db-content').innerHTML =
    '<div class="card"><div class="card-title" style="color:#0070c0">💰 รวมอัตราค่าใช้จ่าย</div>' +
    '<canvas id="ch-cost" height="100"></canvas>' +
    '<div id="db-cost-summary" style="margin-top:14px;font-size:13px"></div></div>';

  _dashCharts['cost'] = new Chart(document.getElementById('ch-cost'), {
    type: 'bar',
    data: { labels: barLabels, datasets: [{ label: 'ยอด (บาท)', data: barData, backgroundColor: barColors }] },
    options: { plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
  });

  var deptRows = depts.map(function(dept){
    var pct = grandTotal > 0 ? (empByDept[dept]/grandTotal*100).toFixed(1) : '0.0';
    return '<tr><td>'+dept+'</td><td style="text-align:right">'+empByDept[dept].toLocaleString('th-TH',{minimumFractionDigits:2})+'</td><td style="text-align:center">'+pct+'%</td></tr>';
  }).join('');

  document.getElementById('db-cost-summary').innerHTML =
    '<table><thead><tr style="background:#1e293b;color:#fff"><th>รายการ</th><th>ยอด (บาท)</th><th>%</th></tr></thead><tbody>' +
    '<tr style="background:#dbeafe"><td><b>ค่าใช้จ่ายบริษัท</b></td><td style="text-align:right"><b>'+companyCost.toLocaleString('th-TH',{minimumFractionDigits:2})+'</b></td><td style="text-align:center">'+(grandTotal>0?(companyCost/grandTotal*100).toFixed(1):'0.0')+'%</td></tr>' +
    deptRows +
    '<tr style="background:#fef9c3"><td><b>รวมค่าใช้จ่ายพนักงาน</b></td><td style="text-align:right"><b>'+totalEmp.toLocaleString('th-TH',{minimumFractionDigits:2})+'</b></td><td style="text-align:center">'+(grandTotal>0?(totalEmp/grandTotal*100).toFixed(1):'0.0')+'%</td></tr>' +
    '<tr style="background:#f0fdf4"><td><b>ต้นทุนสินค้าคงเหลือ</b></td><td style="text-align:right"><b>'+inventoryCost.toLocaleString('th-TH',{minimumFractionDigits:2})+'</b></td><td>—</td></tr>' +
    '<tr style="background:#1e293b;color:#fff"><td><b>ยอดรวมทั้งหมด</b></td><td style="text-align:right"><b>'+(grandTotal+inventoryCost).toLocaleString('th-TH',{minimumFractionDigits:2})+'</b></td><td>—</td></tr>' +
    '</tbody></table>';
}

// ---- ประเภท 4: รายปี (ไม่ filter วันที่) ----
function _renderChart4(d) {
  var yearMap = {};
  d.issueRows.forEach(function(r){
    var yr = (r.date||'').slice(0,4);
    if (!yr) return;
    var amt = Number(r.total_amount) || (Number(r.price_snapshot)||0)*(Number(r.qty)||0);
    yearMap[yr] = (yearMap[yr]||0) + amt;
  });
  var years = Object.keys(yearMap).sort();
  var vals = years.map(function(y){ return yearMap[y]; });
  var grandTotal = vals.reduce(function(s,v){ return s+v; }, 0);

  document.getElementById('db-content').innerHTML =
    '<div class="card"><div class="card-title" style="color:#b45309">📈 ค่าใช้จ่ายรายปี</div>' +
    '<canvas id="ch-year" height="100"></canvas>' +
    '<div id="db-year-summary" style="margin-top:14px;font-size:13px"></div></div>';

  if (!years.length) { document.getElementById('db-content').querySelector('#db-year-summary').textContent = 'ไม่มีข้อมูล'; return; }

  _dashCharts['year'] = new Chart(document.getElementById('ch-year'), {
    type: 'line',
    data: { labels: years, datasets: [{ label: 'ยอด (บาท)', data: vals, borderColor:'#b45309', backgroundColor:'#b4530922', tension:0.3, fill:true }] },
    options: { scales:{ y:{ beginAtZero:true } } }
  });

  var rows = years.map(function(yr){
    var pct = grandTotal > 0 ? (yearMap[yr]/grandTotal*100).toFixed(1) : '0.0';
    return '<tr><td>'+yr+'</td><td style="text-align:right">'+yearMap[yr].toLocaleString('th-TH',{minimumFractionDigits:2})+'</td><td style="text-align:center">'+pct+'%</td></tr>';
  }).join('');
  document.getElementById('db-year-summary').innerHTML =
    '<table><thead><tr style="background:#b45309;color:#fff"><th>ปี</th><th>ยอด (บาท)</th><th>% ของรวม</th></tr></thead><tbody>'+rows+
    '<tr style="background:#fef9c3"><td><b>รวม</b></td><td style="text-align:right"><b>'+grandTotal.toLocaleString('th-TH',{minimumFractionDigits:2})+'</b></td><td>100%</td></tr></tbody></table>';
}
