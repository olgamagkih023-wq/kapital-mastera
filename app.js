// Капитал Мастера — Application JavaScript
// Version: 2026-06-12

// Simple but reliable password hash (no external dependency)
function simpleHash(str) {
  var hash = 0;
  var full = str + 'km_salt_2025_secure';
  for (var i = 0; i < full.length; i++) {
    var chr = full.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  // Make it longer and more unique
  var h2 = hash * 2654435761;
  h2 |= 0;
  var h3 = hash ^ (hash >>> 16);
  return 'h_' + Math.abs(hash).toString(36) + '_' + Math.abs(h2).toString(36) + '_' + Math.abs(h3).toString(36);
}

// ── PBKDF2 Strong Password Hash (Web Crypto API) ─────────────────────────────
async function strongHash(password, saltHex){
  var saltBytes = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map(function(b){ return parseInt(b,16); }))
    : crypto.getRandomValues(new Uint8Array(16));
  var saltHexOut = Array.from(saltBytes).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  var key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveBits']
  );
  var bits = await crypto.subtle.deriveBits(
    {name:'PBKDF2', salt:saltBytes, iterations:100000, hash:'SHA-256'}, key, 256
  );
  var hashHex = Array.from(new Uint8Array(bits)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  return {hash:hashHex, salt:saltHexOut};
}
async function verifyStrongHash(password, storedHash, salt){
  var result = await strongHash(password, salt);
  return result.hash === storedHash;
}

// ── Telegram via secure proxy (/api/notify on Vercel) ────────────────────────
function sendTgViaProxy(text){
  fetch('/api/notify', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:text, parse_mode:'Markdown'})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){ if(!d.ok) console.warn('TG:', d.description||d.error); })
  .catch(function(e){ console.warn('TG proxy error:', e.message); });
}
function sendTgMsg(text){ sendTgViaProxy(text); }


// ===== STORAGE HELPERS =====
var hsh = simpleHash;
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn('store error',e)}}
function load(k,d){try{var v=localStorage.getItem(k);return v!==null?JSON.parse(v):d}catch(e){return d}}

// ════════════════════════════════════════════
// FIREBASE FULL-PROFILE SYNC
// ════════════════════════════════════════════
var FB_UID = '';  // set after login
var FB_SYNC_PENDING = false;

function fbRef(path){
  if(!FB_UID || typeof db === 'undefined') return null;
  return db.ref('users/' + FB_UID + '/' + path);
}

// Write to Firebase (debounced — batch writes)
var FB_WRITE_TIMERS = {};
function fbWrite(path, data){
  var ref = fbRef(path);
  if(!ref) return;
  clearTimeout(FB_WRITE_TIMERS[path]);
  FB_WRITE_TIMERS[path] = setTimeout(function(){
    ref.set(data).catch(function(e){ console.warn('FB write error ['+path+']:', e.message); });
  }, 600);  // 600ms debounce — batch rapid changes
}

// Load full profile from Firebase on login
function fbLoadProfile(uid, callback){
  if(typeof db === 'undefined'){ callback(); return; }
  db.ref('users/' + uid).once('value')
    .then(function(snap){
      var data = snap.val();
      if(!data){ callback(); return; }
      // Restore to localStorage
      if(data.tx)        store('km_tx', data.tx);
      if(data.appts)     store('km_appts', data.appts);
      if(data.settings)  store('km_settings', data.settings);
      if(data.hours)     store('km_hours', data.hours);
      if(data.capital)   store('km_capital', data.capital);
      if(data.pulse)     store('km_pulse', data.pulse);
      if(data.blog)      store('km_blog', data.blog);
      if(data.booking)   store('km_booking_settings', data.booking);
      console.log('✓ Profile loaded from Firebase');
      callback();
    })
    .catch(function(e){
      console.warn('FB load error:', e.message);
      callback();  // proceed with local data
    });
}

// Patched save functions — write local + sync to Firebase
function getTx(){ return load('km_tx',[]); }
function saveTx(a){
  store('km_tx', a);
  fbWrite('tx', a);
}
function getAppts(){ return load('km_appts',[]); }
function saveAppts(a){
  store('km_appts', a);
  fbWrite('appts', a);
}
function getSettings(){
  return load('km_settings',{
    goal:300000, monthly:20000, yield:12, income:100000,
    categories:['Клиент','Материалы','Аренда','Обучение','Маркетинг','Продукты','Транспорт','Развлечения','Здоровье','Инвестиции','Прочее']
  });
}
function saveSettings(s){
  store('km_settings', s);
  fbWrite('settings', s);
}

// Hour logs
function getHours(){ return load('km_hours',[]); }
function saveHours(h){
  store('km_hours', h);
  fbWrite('hours', h);
}

// Capital/investments — intercept store calls for capital keys
var _origStore = store;
function store(k, v){
  try{ localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.warn('store error',e); }
  // Sync capital data to Firebase
  if(FB_UID && typeof db !== 'undefined'){
    var fbMap = {
      'km_capital':          'capital',
      'km_pulse':            'pulse',
      'km_blog':             'blog',
      'km_booking_settings': 'booking',
    };
    if(fbMap[k]) fbWrite(fbMap[k], v);
  }
}



// ===== AUTH =====
const authScreen=document.getElementById('authScreen');
var appEl=document.getElementById('app');

function getUsers(){return load('km_users',[])}
function saveUsers(u){store('km_users',u)}

function doRegister(){
  const name=document.getElementById('rName').value.trim();
  const prof=document.getElementById('rProf').value;
  const phone=document.getElementById('rPhone').value.trim();
  const pass=document.getElementById('rPass').value;
  const errEl=document.getElementById('regErr');
  errEl.style.display='none';
  if(!name){showErr(errEl,'Введите имя');return}
  if(!phone){showErr(errEl,'Введите телефон');return}
  if(pass.length<6){showErr(errEl,'Пароль минимум 6 символов');return}
  const users=getUsers();
  if(users.find(u=>u.phone===phone)){showErr(errEl,'Телефон уже зарегистрирован');return}
  const id='u_'+Date.now();
  users.push({id,name,prof,phone,ph:hsh(pass),created:Date.now()});
  saveUsers(users);
  launchApp({id,name,prof});
}
function doLogin(){
  const phone=document.getElementById('lPhone').value.trim();
  const pass=document.getElementById('lPass').value;
  const errEl=document.getElementById('loginErr');
  errEl.style.display='none';
  const users=getUsers();
  const user=users.find(u=>u.phone===phone);
  if(!user){showErr(errEl,'Пользователь не найден');return}
  if(user.ph!==hsh(pass)){showErr(errEl,'Неверный пароль');return}
  launchApp({id:user.id,name:user.name,prof:user.prof});
}
function showErr(el,msg){el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',3000)}

function launchApp(user){
  store('km_session', user);
  FB_UID = user.id || '';

  document.getElementById('sidebarName').textContent = user.name || 'Мастер';
  document.getElementById('sidebarProf').textContent = user.prof || 'Специалист';

  // Show app immediately with local data, then sync Firebase in background
  function showAppNow(){
    authScreen.style.display = 'none';
    appEl.style.display = 'flex';
    appEl.classList.add('visible');
    setTimeout(function(){
      if(HELP_CONTENT && HELP_CONTENT['dashboard']){
        var t = document.getElementById('pageTitle');
        if(t) t.innerHTML = 'Обзор <button class="help-btn" onclick="openHelp(\'dashboard\')" title="Как это работает">?</button>';
      }
    }, 200);
    refreshAll();
  }

  // Try Firebase with 3s timeout — show app regardless
  var shown = false;
  var timer = setTimeout(function(){
    if(!shown){ shown = true; showAppNow(); }
  }, 3000);

  fbLoadProfile(FB_UID, function(){
    clearTimeout(timer);
    if(!shown){ shown = true; showAppNow(); }
  });
}


// ════════════════════════════════════════════
// AUTH FUNCTIONS — clean unified
// ════════════════════════════════════════════

function showAuthTab(tab){
  var isLogin = tab === 'login';
  var fl = document.getElementById('formLogin');
  var fr = document.getElementById('formReg');
  var tl = document.getElementById('tabLogin');
  var tr = document.getElementById('tabReg');
  if(fl) fl.style.display = isLogin ? 'block' : 'none';
  if(fr) fr.style.display = isLogin ? 'none'  : 'block';
  if(tl) tl.className = 'auth-tab-btn' + (isLogin ? ' active' : '');
  if(tr) tr.className = 'auth-tab-btn' + (!isLogin ? ' active' : '');
  ['loginErr','regErr'].forEach(function(id){
    var e = document.getElementById(id);
    if(e){ e.style.display='none'; e.textContent=''; }
  });
}

// Keep old names as aliases
function authShowPanel(w){ showAuthTab(w === 'reg' ? 'reg' : 'login'); }

function doAuthLogin(){
  var phone = (document.getElementById('lPhone')||{}).value;
  var pass  = (document.getElementById('lPass')||{}).value;
  var errEl = document.getElementById('loginErr');
  var btn   = document.getElementById('btnLogin');
  phone = phone ? phone.trim() : '';
  pass  = pass  ? pass : '';
  if(errEl){ errEl.style.display='none'; errEl.textContent=''; }
  if(!phone){ showAuthErr('loginErr','Введите номер телефона'); return; }
  if(!pass){  showAuthErr('loginErr','Введите пароль'); return; }
  try{
    var users = JSON.parse(localStorage.getItem('km_users')||'[]');
    var user = users.find(function(u){ return u.phone === phone; });
    if(!user){ showAuthErr('loginErr','Номер не зарегистрирован'); return; }
    if(user.ph !== simpleHash(pass)){ showAuthErr('loginErr','Неверный пароль'); return; }
    if(btn){ btn.textContent='Входим...'; btn.disabled=true; }
    setTimeout(function(){ launchApp({id:user.id, name:user.name, prof:user.prof||''}); }, 50);
  } catch(e){
    showAuthErr('loginErr','Ошибка: '+e.message);
  }
}

function doAuthRegister(){
  var name  = (document.getElementById('rName')||{}).value;
  var prof  = (document.getElementById('rProf')||{}).value;
  var phone = (document.getElementById('rPhone')||{}).value;
  var pass  = (document.getElementById('rPass')||{}).value;
  var btn   = document.getElementById('btnReg');
  name  = name  ? name.trim()  : '';
  phone = phone ? phone.trim() : '';
  pass  = pass  ? pass : '';
  if(!name){  showAuthErr('regErr','Введите имя'); return; }
  if(!phone){ showAuthErr('regErr','Введите телефон'); return; }
  if(pass.length < 4){ showAuthErr('regErr','Пароль минимум 4 символа'); return; }
  try{
    var users = JSON.parse(localStorage.getItem('km_users')||'[]');
    if(users.find(function(u){ return u.phone===phone; })){
      showAuthErr('regErr','Телефон уже зарегистрирован'); return;
    }
    var id = 'u_'+Date.now();
    users.push({id:id, name:name, prof:prof, phone:phone, ph:simpleHash(pass), created:Date.now()});
    localStorage.setItem('km_users', JSON.stringify(users));
    if(btn){ btn.textContent='Создаём...'; btn.disabled=true; }
    setTimeout(function(){ launchApp({id:id, name:name, prof:prof||'Специалист'}); }, 50);
  } catch(e){
    showAuthErr('regErr','Ошибка: '+e.message);
  }
}

function showAuthErr(errId, msg){
  var el = document.getElementById(errId);
  if(el){ el.textContent=msg; el.style.display='block'; }
  var b1=document.getElementById('btnLogin');
  var b2=document.getElementById('btnReg');
  if(b1){ b1.textContent='Войти'; b1.disabled=false; }
  if(b2){ b2.textContent='Создать аккаунт'; b2.disabled=false; }
}

// Enter key support
document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter') return;
  var auth = document.getElementById('authScreen');
  if(!auth || auth.style.display === 'none') return;
  var fr = document.getElementById('formReg');
  if(fr && fr.style.display !== 'none') doAuthRegister();
  else doAuthLogin();
});

function checkSession(){
  var s = load('km_session', null);
  if(s && s.id){
    var users = getUsers();
    var validUser = users.find(function(u){ return u.id === s.id; });
    if(validUser){
      launchApp({id:validUser.id, name:validUser.name, prof:validUser.prof});
      return;
    }
  }
  // No session — show auth screen
  // (no auto-login even if one user exists — user must log in manually)
}

// ===== AUTH FUNCTIONS (global, called from HTML onclick) =====






var doLogin = authDoLogin;
var doRegister = authDoRegister;
var showPanel = authShowPanel;

document.getElementById('logoutBtn').onclick = function() {
  localStorage.removeItem('km_session');
  IS_DEMO = false;
  FB_UID = '';
  appEl.classList.remove('visible');
  appEl.style.display = 'none';
  // Show demo banner hidden
  var banner = document.getElementById('demoBanner');
  if(banner) banner.style.display = 'none';
  // Show auth screen
  authScreen.style.display = 'block';
  authShowPanel('login');
  authScreen.scrollTop = 0;
};

// ===== NAVIGATION =====
const pageTitles={dashboard:'Обзор',finances:'Финансы',capital:'Капитал',calendar:'Календарь',settings:'Настройки'};
document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-'+btn.dataset.page).classList.add('active');
    document.getElementById('pageTitle').textContent=pageTitles[btn.dataset.page];
    if(btn.dataset.page==='calendar')renderCalendar();
    if(btn.dataset.page==='capital')renderCapital();
    if(btn.dataset.page==='dashboard')renderDashboard();
    if(btn.dataset.page==='settings')loadSettings();
  };
});

// ===== DATA KEYS =====
function uid(){return 't_'+Date.now()+'_'+Math.random().toString(36).substr(2,5)}
function getTx(){return load('km_tx',[])}
function saveTx(a){store('km_tx',a)}
function getAppts(){return load('km_appts',[])}
function saveAppts(a){store('km_appts',a)}
function getInvests(){return load('km_invest',[])}
function saveInvests(a){store('km_invest',a)}
function getSettings(){return load('km_settings',{goal:300000,monthly:20000,yield:12,income:100000,categories:['Клиент','Материалы','Аренда','Обучение','Маркетинг','Продукты','Транспорт','Развлечения','Здоровье','Инвестиции','Прочее']})}
function saveSettings(s){store('km_settings',s)}

// ===== TOAST =====
function toast(msg,type='success'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='show '+(type==='success'?'success':'error');
  setTimeout(()=>t.className='',2500);
}

// ===== FINANCES =====
let txFilter='all';
let qeType='income';
let qeSegment='business';

// Quick entry buttons
document.getElementById('qeIncome').onclick=function(){
  qeType='income';
  this.className='qe-type-btn active-income';
  document.getElementById('qeExpense').className='qe-type-btn';
};
document.getElementById('qeExpense').onclick=function(){
  qeType='expense';
  this.className='qe-type-btn active-expense';
  document.getElementById('qeIncome').className='qe-type-btn';
};
document.getElementById('segBiz').onclick=function(){
  qeSegment='business';
  this.className='qe-seg-btn active';
  document.getElementById('segPers').className='qe-seg-btn';
};
document.getElementById('segPers').onclick=function(){
  qeSegment='personal';
  this.className='qe-seg-btn active';
  document.getElementById('segBiz').className='qe-seg-btn';
};

document.getElementById('qeAmount').onkeydown=function(e){
  if(e.key==='Enter'&&!e.shiftKey){qeType='income';addTransaction()}
  if(e.key==='Enter'&&e.shiftKey){qeType='expense';addTransaction()}
};

document.getElementById('qeSubmit').onclick=addTransaction;
document.getElementById('quickEntryBtn').onclick=()=>{
  document.querySelector('[data-page="finances"]').click();
  setTimeout(()=>document.getElementById('qeAmount').focus(),100);
};

function addTransaction(){
  const amount=parseFloat(document.getElementById('qeAmount').value);
  const desc=document.getElementById('qeDesc').value.trim()||'Операция';
  const cat=document.getElementById('qeCategory').value;
  if(!amount||amount<=0){toast('Введите сумму','error');return}
  const tx={id:uid(),date:new Date().toISOString(),amount,desc,cat,type:qeType,segment:qeSegment};
  const txs=getTx();
  txs.unshift(tx);
  saveTx(txs);
  document.getElementById('qeAmount').value='';
  document.getElementById('qeDesc').value='';
  toast(qeType==='income'?`+${fmt(amount)} добавлено`:`-${fmt(amount)} записано`);
  renderFinances();
  renderDashboard();
  updateCapitalRing();
}

function fmt(n){return Math.round(n).toLocaleString('ru-RU')}
function fmtDate(iso){const d=new Date(iso);return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`}
function thisMonth(iso){const d=new Date(iso),n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()}

function renderFinances(){
  const txs=getTx();
  const tbody=document.getElementById('txTableBody');
  let filtered=txs;
  if(txFilter==='business')filtered=txs.filter(t=>t.segment==='business');
  else if(txFilter==='personal')filtered=txs.filter(t=>t.segment==='personal');
  else if(txFilter==='income')filtered=txs.filter(t=>t.type==='income');
  else if(txFilter==='expense')filtered=txs.filter(t=>t.type==='expense');

  if(!filtered.length){tbody.innerHTML='<div class="empty"><div class="empty-icon">◎</div><div class="empty-text">Нет операций. Добавьте первую!</div></div>';return}

  const LIMIT=5;
  const visible=txShowAll?filtered:filtered.slice(0,LIMIT);
  const hidden=filtered.length-LIMIT;

  var txHTML='';
  for(var ti=0;ti<visible.length;ti++){
    var t=visible[ti];
    txHTML+='<div class="tx-row">'+
      '<span class="tx-date-cell">'+fmtDate(t.date)+'</span>'+
      '<span class="tx-desc-cell">'+t.desc+'</span>'+
      '<span><span class="tx-cat-badge '+(t.segment==='business'?'badge-biz':'badge-pers')+'">'+t.cat+'</span></span>'+
      '<span class="tx-segment">'+(t.segment==='business'?'Бизнес':'Личное')+'</span>'+
      '<span class="tx-amount-cell '+t.type+'">'+(t.type==='income'?'+':'−')+fmt(t.amount)+' ₽</span>'+
      '<button class="tx-del" data-txid="'+t.id+'">×</button>'+
    '</div>';
  }
  tbody.innerHTML=txHTML;
  tbody.querySelectorAll('.tx-del').forEach(function(btn){
    btn.onclick=function(){deleteTx(this.getAttribute('data-txid'))};
  });

  // Toggle button
  var toggleEl=document.getElementById('txToggleBtn');
  if(!toggleEl){
    toggleEl=document.createElement('div');
    toggleEl.id='txToggleBtn';
    tbody.parentElement.appendChild(toggleEl);
  }
  if(filtered.length>LIMIT){
    var btnBg = txShowAll ? '#F0E9DC' : '#0D6E4A';
    var btnClr = txShowAll ? '#0C0D0A' : '#ffffff';
    var btnTxt = txShowAll ? '▲ Скрыть операции' : '▼ Показать все ' + filtered.length + ' операций';
    toggleEl.innerHTML = '';
    var tb = document.createElement('button');
    tb.style.cssText = 'width:100%;padding:16px;background:' + btnBg + ';color:' + btnClr + ';border:none;font-size:0.9rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;cursor:pointer';
    tb.textContent = btnTxt;
    tb.onclick = function(){ txShowAll = !txShowAll; renderFinances(); };
    toggleEl.appendChild(tb);
  } else {
    toggleEl.innerHTML = '';
  }

  // Summary
  const monthTx=txs.filter(t=>thisMonth(t.date));
  const bizInc=monthTx.filter(t=>t.type==='income'&&t.segment==='business').reduce((a,t)=>a+t.amount,0);
  const bizExp=monthTx.filter(t=>t.type==='expense'&&t.segment==='business').reduce((a,t)=>a+t.amount,0);
  const persInc=monthTx.filter(t=>t.type==='income'&&t.segment==='personal').reduce((a,t)=>a+t.amount,0);
  const persExp=monthTx.filter(t=>t.type==='expense'&&t.segment==='personal').reduce((a,t)=>a+t.amount,0);
  const netBiz=bizInc-bizExp;
  const netPers=persInc-persExp;
  document.getElementById('monthlySummary').innerHTML=`
    <div class="sum-row"><span class="sum-key">Бизнес-доход</span><span class="sum-val pos">+${fmt(bizInc)} ₽</span></div>
    <div class="sum-row"><span class="sum-key">Бизнес-расходы</span><span class="sum-val neg">−${fmt(bizExp)} ₽</span></div>
    <div class="sum-row"><span class="sum-key">Прибыль бизнеса</span><span class="sum-val ${netBiz>=0?'pos':'neg'}">${netBiz>=0?'+':''}${fmt(netBiz)} ₽</span></div>
    <div class="sum-row"><span class="sum-key">Личные доходы</span><span class="sum-val pos">+${fmt(persInc)} ₽</span></div>
    <div class="sum-row"><span class="sum-key">Личные расходы</span><span class="sum-val neg">−${fmt(persExp)} ₽</span></div>
    <div class="sum-row"><span class="sum-key">Итого</span><span class="sum-val ${(netBiz+netPers)>=0?'pos':'neg'}">${fmt(netBiz+netPers)} ₽</span></div>`;
  updateCapitalRing();
}

function deleteTx(id){
  const txs=getTx().filter(t=>t.id!==id);
  saveTx(txs);
  renderFinances();
  renderDashboard();
  toast('Операция удалена');
}

// Segment filter
document.querySelectorAll('.seg-btn').forEach(btn=>{
  btn.onclick=function(){
    document.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');
    txFilter=this.dataset.seg;
    txShowAll=false;
    renderFinances();
  };
});

function updateCapitalRing(){
  const txs=getTx();
  const totalIncome=txs.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0);
  const capitalAmount=totalIncome*0.2;
  const settings=getSettings();
  const goal=settings.goal||300000;
  const pct=Math.min(capitalAmount/goal,1);
  const circumference=251.2;
  const offset=circumference-(pct*circumference);
  const ring=document.getElementById('capRingFill');
  if(ring){ring.style.strokeDashoffset=offset}
  const valEl=document.getElementById('capRingVal');
  const pctEl=document.getElementById('capRingPct');
  const goalEl=document.getElementById('capRingGoal');
  if(valEl)valEl.textContent=fmt(capitalAmount)+' ₽';
  if(pctEl)pctEl.textContent=Math.round(pct*100)+'%';
  if(goalEl)goalEl.textContent='Цель: '+fmt(goal)+' ₽';
}

// ===== DASHBOARD =====
function renderDashboard(){
  const txs=getTx();
  const monthTx=txs.filter(t=>thisMonth(t.date));
  const bizInc=monthTx.filter(t=>t.type==='income'&&t.segment==='business').reduce((a,t)=>a+t.amount,0);
  const persExp=monthTx.filter(t=>t.type==='expense'&&t.segment==='personal').reduce((a,t)=>a+t.amount,0);
  const totalIncome=txs.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0);
  const capital=totalIncome*0.2;
  const appts=getAppts();
  const monthAppts=appts.filter(a=>{const d=new Date(a.date);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()});

  document.getElementById('kpi-biz-income').innerHTML=fmt(bizInc)+' <small>₽</small>';
  document.getElementById('kpi-pers-exp').innerHTML=fmt(persExp)+' <small>₽</small>';
  document.getElementById('kpi-capital').innerHTML=fmt(capital)+' <small>₽</small>';
  document.getElementById('kpi-appts').textContent=monthAppts.length;

  // Recent tx
  const recent=txs.slice(0,5);
  const recentEl=document.getElementById('recentTx');
  if(!recent.length){recentEl.innerHTML='<div class="empty"><div class="empty-icon">◎</div><div class="empty-text">Нет операций</div></div>';return}
  recentEl.innerHTML=recent.map(t=>`
    <div class="tx-item">
      <div class="tx-icon ${t.type}">${t.type==='income'?'↑':'↓'}</div>
      <div><div class="tx-name">${t.desc}</div><div class="tx-cat">${t.cat} · ${t.segment==='business'?'Бизнес':'Личное'}</div></div>
      <div class="tx-amount ${t.type}">${t.type==='income'?'+':'−'}${fmt(t.amount)} ₽</div>
    </div>`).join('');

  // Chart — last 6 months
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);months.push({m:d.getMonth(),y:d.getFullYear(),label:d.toLocaleString('ru-RU',{month:'short'})})}
  const maxVal=Math.max(...months.map(m=>{
    const inc=txs.filter(t=>{const d=new Date(t.date);return d.getMonth()===m.m&&d.getFullYear()===m.y&&t.type==='income'}).reduce((a,t)=>a+t.amount,0);
    const exp=txs.filter(t=>{const d=new Date(t.date);return d.getMonth()===m.m&&d.getFullYear()===m.y&&t.type==='expense'}).reduce((a,t)=>a+t.amount,0);
    return Math.max(inc,exp);
  }),1);
  document.getElementById('dashChart').innerHTML=months.map(m=>{
    const inc=txs.filter(t=>{const d=new Date(t.date);return d.getMonth()===m.m&&d.getFullYear()===m.y&&t.type==='income'}).reduce((a,t)=>a+t.amount,0);
    const exp=txs.filter(t=>{const d=new Date(t.date);return d.getMonth()===m.m&&d.getFullYear()===m.y&&t.type==='expense'}).reduce((a,t)=>a+t.amount,0);
    const ih=Math.max((inc/maxVal)*72,2);const eh=Math.max((exp/maxVal)*72,2);
    return`<div class="bar-group"><div class="bar biz" style="height:${ih}px" title="${fmt(inc)} ₽"></div><div class="bar pers" style="height:${eh}px" title="${fmt(exp)} ₽"></div></div>`;
  }).join('');
  document.getElementById('dashChartLabels').innerHTML=months.map(m=>`<span class="bar-label">${m.label}</span>`).join('');

  // 50/30/20
  const income=getSettings().income||bizInc||100000;
  const splits=[
    {name:'Жизнь (50%)',pct:50,color:var_em(),amount:income*0.5},
    {name:'Желания (30%)',pct:30,color:var_gold(),amount:income*0.3},
    {name:'Капитал (20%)',pct:20,color:var_blue(),amount:income*0.2},
  ];
  document.getElementById('splitBars').innerHTML=splits.map(s=>`
    <div class="split-row">
      <div class="split-top">
        <span class="split-name">${s.name}</span>
        <span class="split-pct">${fmt(s.amount)} ₽</span>
      </div>
      <div class="split-track"><div class="split-fill" style="width:${s.pct}%;background:${s.color}"></div></div>
    </div>`).join('');

  // Upcoming appointments
  const now=new Date();
  const upcoming=appts.filter(a=>new Date(a.date+' '+a.time)>=now&&a.status!=='cancelled')
    .sort((a,b)=>new Date(a.date+' '+a.time)-new Date(b.date+' '+b.time)).slice(0,3);
  const upEl=document.getElementById('upcomingAppts');
  if(!upcoming.length){upEl.innerHTML='<div class="empty"><div class="empty-icon">◐</div><div class="empty-text">Нет записей</div></div>';return}
  upEl.innerHTML=upcoming.map(a=>`
    <div class="appt-item ${a.status||'confirmed'}">
      <div class="appt-name">${a.client}</div>
      <div class="appt-time">${a.date} · ${a.time} · ${a.service}${a.price?' · '+fmt(a.price)+' ₽':''}</div>
    </div>`).join('');
}
function var_em(){return'#0D6E4A'}
function var_gold(){return'#D4AF70'}
function var_blue(){return'#2471A3'}

// ===== CALENDAR =====
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth();

var selectedCalDate = '';
function renderCalendar(){
  var months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  document.getElementById('calMonthLabel').textContent=months[calMonth]+' '+calYear;
  var appts=getAppts();
  var firstDay=new Date(calYear,calMonth,1);
  var startDow=firstDay.getDay()||7;
  var daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  var daysInPrev=new Date(calYear,calMonth,0).getDate();
  var today=new Date();
  var isMob=window.innerWidth<=860;
  var html='';
  // Prev month padding
  for(var i=startDow-1;i>0;i--){
    html+='<div class="cal-day other-month"><div class="cal-day-num">'+(daysInPrev-i+1)+'</div></div>';
  }
  for(var d=1;d<=daysInMonth;d++){
    var isToday=d===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
    var dateStr=calYear+'-'+((calMonth+1).toString().padStart(2,'0'))+'-'+(d.toString().padStart(2,'0'));
    var dayAppts=appts.filter(function(a){return a.date===dateStr});
    var isSelected=dateStr===selectedCalDate;
    // Desktop: show event text; Mobile: show dots only
    var innerHtml='<div class="cal-day-num">'+d+'</div>';
    if(isMob){
      if(dayAppts.length>0){
        var dots=dayAppts.slice(0,3).map(function(a){
          return '<span class="cal-dot '+(a.status||'confirmed')+'"></span>';
        }).join('');
        innerHtml+='<div class="cal-day-dots">'+dots+'</div>';
      }
    } else {
      var evHtml=dayAppts.slice(0,3).map(function(a){
        return '<div class="cal-event '+(a.status||'confirmed')+'" title="'+a.client+' — '+a.service+'">'+a.time+' '+a.client+'</div>';
      }).join('');
      innerHtml+=evHtml;
      if(dayAppts.length>3) innerHtml+='<div style="font-size:0.65rem;color:var(--muted)">+'+( dayAppts.length-3)+'</div>';
    }
    var dayClass='cal-day'+(isToday?' today':'')+(isSelected?' selected':'');
    html+='<div class="'+dayClass+'" data-date="'+dateStr+'" onclick="selectCalDay(this.dataset.date)">'+innerHtml+'</div>';
  }
  // Next month padding
  var totalCells=startDow-1+daysInMonth;
  var remaining=(7-totalCells%7)%7;
  for(var i=1;i<=remaining;i++){html+='<div class="cal-day other-month"><div class="cal-day-num">'+i+'</div></div>';}
  document.getElementById('calDays').innerHTML=html;
  if(isMob){renderMobileApptPanel()}else{renderApptList();}
}

function renderMobileApptPanel(){
  var panel=document.getElementById('mobileApptPanel');
  if(!panel) return;
  panel.style.display='block';
  var appts=getAppts();
  var mapTitle=document.getElementById('mapTitle');
  var mapDate=document.getElementById('mapDate');
  var mapList=document.getElementById('mapList');
  if(!selectedCalDate){
    // Show today's or upcoming
    var today=new Date().toISOString().split('T')[0];
    var todayAppts=appts.filter(function(a){return a.date===today});
    mapTitle.textContent='Сегодня';
    mapDate.textContent=today.split('-').reverse().join('.');
    if(!todayAppts.length){
      mapList.innerHTML='<div class="map-empty">Записей нет — нажми на день в календаре</div>';
    } else {
      mapList.innerHTML=todayAppts.map(renderMobileApptItem).join('');
    }
    return;
  }
  var dayAppts=appts.filter(function(a){return a.date===selectedCalDate});
  var parts=selectedCalDate.split('-');
  mapTitle.textContent='Записи на '+(+parts[2])+' '+['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][+parts[1]-1];
  mapDate.textContent=selectedCalDate.split('-').reverse().join('.');
  if(!dayAppts.length){
    mapList.innerHTML='<div class="map-empty">Нет записей. <a onclick="addApptForDate()" style="color:var(--em);cursor:pointer">Добавить →</a></div>';
  } else {
    mapList.innerHTML=dayAppts.map(renderMobileApptItem).join('');
  }
}

function addApptForDate(){
  var el=document.getElementById('apptDate');
  if(el) el.value=selectedCalDate;
  var cl=document.getElementById('apptClient');
  if(cl){cl.focus();cl.scrollIntoView({behavior:'smooth',block:'start'});}
}
function renderMobileApptItem(a){
  var colors={confirmed:' style="border-left-color:var(--em)"',pending:' style="border-left-color:var(--gold)"',cancelled:' style="border-left-color:var(--red);opacity:0.6"'};
  var div = document.createElement('div');
  div.className = 'appt-item ' + (a.status||'confirmed');
  if(colors[a.status]) div.setAttribute('style', colors[a.status].replace(' style="','').replace('"',''));
  var paid = a.paid;
  var hasPriceAndNotCancelled = a.price && a.status !== 'cancelled';
  div.innerHTML =
    '<div class="appt-name">'+a.client+'</div>'+
    '<div class="appt-time">'+a.time+' · '+a.service+(a.price?' · '+Math.round(a.price).toLocaleString('ru-RU')+' ₽':'')+'</div>'+
    (a.phone ? '<div style="font-size:0.72rem;color:var(--muted);margin-top:2px">📞 '+a.phone+'</div>' : '');
  if(hasPriceAndNotCancelled){
    var incBtn = document.createElement('button');
    incBtn.className = paid ? 'appt-action-btn paid-btn' : 'appt-action-btn income-btn';
    incBtn.style.marginTop = '8px';
    incBtn.textContent = paid ? '✓ Зачислено в доход' : '💰 ' + Math.round(a.price).toLocaleString('ru-RU') + ' ₽ → Зачислить';
    incBtn.disabled = !!paid;
    if(!paid){
      incBtn.onclick = (function(appt){ return function(){ chargeApptIncome(appt, this); }; })(a);
    }
    div.appendChild(incBtn);
  }
  return div.outerHTML;
}

// ── Charge appointment income into finances ──────────────────────────────
function chargeApptIncome(appt, btn){
  var price = parseFloat(appt.price)||0;
  if(!price){ toast('У записи не указана стоимость','error'); return; }
  // Add income transaction
  var txs = getTx();
  txs.push({
    id: uid(),
    date: appt.date || new Date().toISOString().split('T')[0],
    desc: appt.service + ' — ' + appt.client,
    cat: 'Клиент',
    type: 'income',
    segment: 'business',
    amount: price
  });
  saveTx(txs);
  // Mark appointment as paid
  var appts = getAppts();
  var found = appts.find(function(x){ return x.id === appt.id; });
  if(found){ found.paid = true; saveAppts(appts); }
  // Update button instantly
  if(btn){
    btn.textContent = '✓ Зачислено';
    btn.className = 'appt-action-btn paid-btn';
    btn.disabled = true;
  }
  // Refresh finances
  renderFinances();
  renderDashboard && renderDashboard();
  toast('💰 ' + Math.round(price).toLocaleString('ru-RU') + ' ₽ добавлено в доход!');
}

function selectCalDay(dateStr){
  selectedCalDate=dateStr;
  document.getElementById('apptDate').value=dateStr;
  if(window.innerWidth<=860){
    renderMobileApptPanel();
    // Update selected highlight
    document.querySelectorAll('.cal-day').forEach(function(d){d.classList.remove('selected')});
    var calDays=document.getElementById('calDays');
    if(calDays){
      var allDays=calDays.querySelectorAll('.cal-day:not(.other-month)');
      var dayNum=parseInt(dateStr.split('-')[2]);
      allDays.forEach(function(d){
        var n=d.querySelector('.cal-day-num');
        if(n&&parseInt(n.textContent)===dayNum)d.classList.add('selected');
      });
    }
    // Scroll form into view
    var form=document.getElementById('apptForm');
    if(form) setTimeout(function(){form.scrollIntoView({behavior:'smooth',block:'start'})},150);
  } else {
    document.getElementById('apptClient').focus();
  }
}

function renderApptList(filterDate){
  const appts=getAppts().sort((a,b)=>new Date(a.date+' '+a.time)-new Date(b.date+' '+b.time));
  const list=filterDate?appts.filter(a=>a.date===filterDate):appts;
  document.getElementById('apptListTitle').textContent=filterDate?'Записи на '+filterDate:'Все записи';
  const el=document.getElementById('apptListContainer');
  if(!list.length){el.innerHTML='<div class="empty"><div class="empty-icon">◐</div><div class="empty-text">Записей нет</div></div>';return}
  el.innerHTML='';
  list.forEach(function(a){
    var paid = a.paid;
    var hasPriceAndNotCancelled = a.price && a.status !== 'cancelled';
    var div = document.createElement('div');
    div.className = 'appt-item ' + (a.status||'confirmed');
    div.id = 'appt-' + a.id;
    div.innerHTML =
      '<div class="appt-name">' + a.client + '</div>' +
      '<div class="appt-time">' + a.date + ' · ' + a.time + ' · ' + a.service +
        (a.price ? ' · ' + fmt(a.price) + ' ₽' : '') + '</div>' +
      (a.phone ? '<div style="font-size:0.75rem;color:var(--muted);margin-top:3px">📞 ' + a.phone + '</div>' : '') +
      (a.note ? '<div style="font-size:0.75rem;color:var(--muted);margin-top:3px">' + a.note + '</div>' : '') +
      '<div class="appt-actions"></div>';
    var actions = div.querySelector('.appt-actions');
    // Confirm / Cancel / Delete
    var confBtn = document.createElement('button');
    confBtn.className = 'appt-action-btn';
    confBtn.textContent = '✓ Подтвердить';
    confBtn.onclick = (function(id){ return function(){ confirmAppt(id); }; })(a.id);
    var canBtn = document.createElement('button');
    canBtn.className = 'appt-action-btn cancel';
    canBtn.textContent = '✕ Отменить';
    canBtn.onclick = (function(id){ return function(){ cancelAppt(id); }; })(a.id);
    var delBtn = document.createElement('button');
    delBtn.className = 'appt-action-btn cancel';
    delBtn.textContent = 'Удалить';
    delBtn.onclick = (function(id){ return function(){ deleteAppt(id); }; })(a.id);
    actions.appendChild(confBtn);
    actions.appendChild(canBtn);
    actions.appendChild(delBtn);
    // ✦ INCOME BUTTON
    if(hasPriceAndNotCancelled){
      var incBtn = document.createElement('button');
      incBtn.className = 'appt-action-btn' + (paid ? ' paid-btn' : ' income-btn');
      incBtn.textContent = paid ? '✓ Зачислено' : '💰 ' + fmt(a.price) + ' ₽ → Доход';
      incBtn.disabled = !!paid;
      if(!paid){
        incBtn.title = 'Добавить ' + fmt(a.price) + ' ₽ в финансы как доход';
        incBtn.onclick = (function(appt){ return function(){ chargeApptIncome(appt, this); }; })(a);
      }
      actions.appendChild(incBtn);
    }
    el.appendChild(div);
  });
}

document.getElementById('calPrev').onclick=()=>{calMonth--;if(calMonth<0){calMonth=11;calYear--}renderCalendar()};
document.getElementById('calToday')?.addEventListener('click',()=>{var n=new Date();calYear=n.getFullYear();calMonth=n.getMonth();renderCalendar()});
document.getElementById('calNext').onclick=()=>{calMonth++;if(calMonth>11){calMonth=0;calYear++}renderCalendar()};

document.getElementById('saveAppt').onclick=function(){
  const client=document.getElementById('apptClient').value.trim();
  const service=document.getElementById('apptService').value.trim();
  const date=document.getElementById('apptDate').value;
  const time=document.getElementById('apptTime').value;
  const price=parseFloat(document.getElementById('apptPrice').value)||0;
  const note=document.getElementById('apptNote').value.trim();
  if(!client||!date){toast('Введите имя клиента и дату','error');return}
  const appts=getAppts();
  appts.push({id:uid(),client,service:service||'Услуга',date,time,price,note,status:'confirmed',created:Date.now()});
  saveAppts(appts);
  document.getElementById('apptClient').value='';
  document.getElementById('apptService').value='';
  document.getElementById('apptPrice').value='';
  document.getElementById('apptNote').value='';
  toast('Запись добавлена ✓');
  renderCalendar();
  renderDashboard();
};

document.getElementById('addApptBtn').onclick=()=>{
  document.querySelector('[data-page="calendar"]').click();
  setTimeout(()=>document.getElementById('apptClient').focus(),100);
};

function confirmAppt(id){const a=getAppts();const idx=a.findIndex(x=>x.id===id);if(idx>-1){a[idx].status='confirmed';saveAppts(a);renderCalendar();toast('Запись подтверждена')}}
function cancelAppt(id){const a=getAppts();const idx=a.findIndex(x=>x.id===id);if(idx>-1){a[idx].status='cancelled';saveAppts(a);renderCalendar();toast('Запись отменена')}}
function deleteAppt(id){const a=getAppts().filter(x=>x.id!==id);saveAppts(a);renderCalendar();renderDashboard();toast('Запись удалена')}

// ===== CAPITAL =====
function renderCapital(){
  const txs=getTx();
  const totalIncome=txs.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0);
  const capital=totalIncome*0.2;
  const settings=getSettings();
  const income=settings.income||100000;
  const goal=settings.goal||300000;

  // Cushion progress
  const monthlyExpenses=txs.filter(t=>thisMonth(t.date)&&t.type==='expense').reduce((a,t)=>a+t.amount,0)||30000;
  const cushionGoal=monthlyExpenses*4;
  const cushionPct=Math.min((capital/cushionGoal)*100,100);
  document.getElementById('cushionProgress').innerHTML=`
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:0.88rem;font-weight:500">Подушка безопасности</span>
        <span style="font-size:0.88rem;color:var(--muted)">${fmt(capital)} / ${fmt(cushionGoal)} ₽</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${cushionPct}%;background:var(--em)"></div></div>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:8px">${Math.round(cushionPct)}% — цель 4 месяца расходов</div>
    </div>
    <div class="forecast-row"><span class="forecast-year">Накоплено сейчас</span><span class="forecast-amount">${fmt(capital)} ₽</span></div>
    <div class="forecast-row"><span class="forecast-year">Цель (4 мес.)</span><span class="forecast-amount">${fmt(cushionGoal)} ₽</span></div>
    <div class="forecast-row"><span class="forecast-year">Осталось</span><span class="forecast-amount" style="color:var(--red)">${fmt(Math.max(cushionGoal-capital,0))} ₽</span></div>`;

  // 50/30/20 rules
  document.getElementById('rulesList').innerHTML=[
    {pct:50,name:'Жизнь',desc:'Базовые потребности',color:'#0D6E4A',bg:'rgba(13,110,74,0.1)'},
    {pct:30,name:'Желания',desc:'Радость и развитие',color:'#B8975A',bg:'rgba(184,151,90,0.12)'},
    {pct:20,name:'Капитал',desc:'Инвестиции и накопления',color:'#2471A3',bg:'rgba(36,113,163,0.1)'},
  ].map(r=>`
    <div class="rule-item">
      <div class="rule-pct-circle" style="background:${r.bg};color:${r.color}">${r.pct}%</div>
      <div><div class="rule-name">${r.name}</div><div class="rule-desc">${r.desc}</div></div>
      <div class="rule-amount" style="color:${r.color}">${fmt(income*r.pct/100)} ₽</div>
    </div>`).join('');

  // Forecast
  const yld=(settings.yield||12)/100;
  const monthly=(settings.monthly||20000);
  document.getElementById('forecastList').innerHTML=[1,3,5,10].map(yrs=>{
    let v=capital;for(let m=0;m<yrs*12;m++)v=(v+monthly)*(1+yld/12);
    return`<div class="forecast-row"><span class="forecast-year">${yrs} ${yrs===1?'год':yrs<5?'года':'лет'}</span><span class="forecast-amount">${fmt(v)} ₽</span></div>`;
  }).join('');

  // Investments
  renderInvestments();

  // Goal calculator
  document.getElementById('goalInput').value=settings.goal||300000;
  document.getElementById('monthlyInput').value=settings.monthly||20000;
  document.getElementById('yieldInput').value=settings.yield||12;
}

document.getElementById('calcGoal').onclick=function(){
  const goal=parseFloat(document.getElementById('goalInput').value)||300000;
  const monthly=parseFloat(document.getElementById('monthlyInput').value)||20000;
  const yld=(parseFloat(document.getElementById('yieldInput').value)||12)/100;
  const settings=getSettings();settings.goal=goal;settings.monthly=monthly;settings.yield=yld*100;saveSettings(settings);
  let v=0,months=0;
  while(v<goal&&months<360){v=(v+monthly)*(1+yld/12);months++}
  const yrs=Math.floor(months/12);const mns=months%12;
  document.getElementById('goalResult').innerHTML=`
    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:4px">До цели ${fmt(goal)} ₽</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:500;color:var(--em)">${yrs > 0 ? yrs+' л. ':''} ${mns} мес.</div>
    <div style="font-size:0.8rem;color:var(--muted);margin-top:4px">При вложении ${fmt(monthly)} ₽/мес под ${Math.round(yld*100)}% годовых</div>`;
  updateCapitalRing();
};

function renderInvestments(){
  const invests=getInvests();
  const el=document.getElementById('investList');
  if(!invests.length){el.innerHTML='<div class="empty"><div class="empty-icon">▣</div><div class="empty-text">Добавьте первый актив</div></div>';return}
  el.innerHTML=invests.map(inv=>{
    const ret=((inv.current-inv.amount)/inv.amount*100);
    return`<div class="invest-row">
      <div><div class="invest-name">${inv.name}</div><div class="invest-type">${inv.type}</div></div>
      <div class="invest-val">${fmt(inv.amount)} ₽</div>
      <div class="invest-val">${fmt(inv.current)} ₽</div>
      <div class="invest-return ${ret>=0?'pos':'neg'}">${ret>=0?'+':''}${ret.toFixed(1)}%</div>
      <div class="invest-risk"><span class="risk-dot risk-${inv.risk}"></span></div>
    </div>`;
  }).join('');
}

document.getElementById('addInvestBtn').onclick=()=>document.getElementById('investModal').classList.add('open');
document.getElementById('closeInvestModal').onclick=()=>document.getElementById('investModal').classList.remove('open');
document.getElementById('investModal').onclick=function(e){if(e.target===this)this.classList.remove('open')};
document.getElementById('saveInvest').onclick=function(){
  const name=document.getElementById('invName').value.trim();
  const type=document.getElementById('invType').value;
  const amount=parseFloat(document.getElementById('invAmount').value)||0;
  const current=parseFloat(document.getElementById('invCurrent').value)||amount;
  const risk=document.getElementById('invRisk').value;
  if(!name||!amount){toast('Заполните название и сумму','error');return}
  const invests=getInvests();
  invests.push({id:uid(),name,type,amount,current,risk,created:Date.now()});
  saveInvests(invests);
  document.getElementById('investModal').classList.remove('open');
  document.getElementById('invName').value='';document.getElementById('invAmount').value='';document.getElementById('invCurrent').value='';
  toast('Актив добавлен');
  renderInvestments();
};

// ===== SETTINGS =====
function loadSettings(){
  const s=getSettings();
  const sess=load('km_session',{});
  document.getElementById('settName').value=sess.name||'';
  document.getElementById('settProf').value=sess.prof||'';
  document.getElementById('settIncome').value=s.income||'';
  renderCategories(s.categories||[]);
}
document.getElementById('saveProfile').onclick=function(){
  const name=document.getElementById('settName').value.trim();
  const prof=document.getElementById('settProf').value.trim();
  const income=parseFloat(document.getElementById('settIncome').value)||0;
  const sess=load('km_session',{});
  sess.name=name;sess.prof=prof;store('km_session',sess);
  const s=getSettings();s.income=income;saveSettings(s);
  document.getElementById('sidebarName').textContent=name;
  document.getElementById('sidebarProf').textContent=prof;
  toast('Профиль сохранён');
};

document.querySelectorAll('.toggle').forEach(t=>{
  // bookingToggle has its own onclick handler — skip it
  if(t.id === 'bookingToggle') return;
  t.onclick=function(){this.classList.toggle('on')}
});

function renderCategories(cats){
  document.getElementById('categoriesList').innerHTML=cats.map(c=>
    `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--cream2);border:1px solid var(--border);font-size:0.8rem">${c} <button onclick="deleteCat('${c}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:0.9rem;line-height:1">×</button></span>`
  ).join('');
}
function deleteCat(name){
  const s=getSettings();s.categories=s.categories.filter(c=>c!==name);saveSettings(s);renderCategories(s.categories);
}
document.getElementById('addCatBtn').onclick=function(){
  const val=document.getElementById('newCatInput').value.trim();
  if(!val)return;
  const s=getSettings();if(!s.categories.includes(val)){s.categories.push(val);saveSettings(s)}
  document.getElementById('newCatInput').value='';renderCategories(s.categories);
};

document.getElementById('exportCSV').onclick=function(){
  const txs=getTx();
  if(!txs.length){toast('Нет данных для экспорта','error');return}
  const rows=['Дата,Описание,Категория,Сегмент,Тип,Сумма',...txs.map(t=>`${t.date},${t.desc},${t.cat},${t.segment},${t.type},${t.amount}`)];
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='kapital_mastera.csv';a.click();
  toast('CSV скачан');
};
document.getElementById('resetData').onclick=function(){
  if(confirm('Удалить все транзакции? Это действие нельзя отменить.')){
    saveTx([]);renderDashboard();renderFinances();toast('Данные сброшены');
  }
};

// ===== SEED DEMO DATA =====
function seedDemo(){
  var t = today();
  var yr = t.slice(0,4);
  var mo = t.slice(5,7);
  // Helper: date N days from today
  function d(offset){
    var dt = new Date(); dt.setDate(dt.getDate()+offset);
    return dt.toISOString().split('T')[0];
  }
  // Current month YYYY-MM
  var ym = yr+'-'+mo;
  // Previous months
  var now = new Date();
  function prevMonth(n){
    var dt = new Date(now.getFullYear(), now.getMonth()-n, 1);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  }

  // ── TRANSACTIONS ─────────────────────────────────────────────
  var txs = [
    // This month — income
    {id:'d1',date:ym+'-05',desc:'Маникюр — Анна К.',cat:'Клиент',type:'income',segment:'business',amount:3500},
    {id:'d2',date:ym+'-06',desc:'Педикюр + гель — Мария С.',cat:'Клиент',type:'income',segment:'business',amount:4200},
    {id:'d3',date:ym+'-08',desc:'Маникюр + дизайн — Ольга В.',cat:'Клиент',type:'income',segment:'business',amount:4800},
    {id:'d4',date:ym+'-10',desc:'Наращивание — Юлия П.',cat:'Клиент',type:'income',segment:'business',amount:6500},
    {id:'d5',date:ym+'-12',desc:'Коррекция бровей',cat:'Клиент',type:'income',segment:'business',amount:2200},
    {id:'d6',date:ym+'-14',desc:'Маникюр — Светлана Р.',cat:'Клиент',type:'income',segment:'business',amount:3500},
    {id:'d7',date:ym+'-15',desc:'Консультация онлайн',cat:'Клиент',type:'income',segment:'business',amount:1500},
    // This month — expenses
    {id:'d8',date:ym+'-02',desc:'Гель-лак OPI набор',cat:'Материалы',type:'expense',segment:'business',amount:4200},
    {id:'d9',date:ym+'-01',desc:'Аренда кабинета',cat:'Аренда',type:'expense',segment:'business',amount:8000},
    {id:'d10',date:ym+'-03',desc:'Продукты на неделю',cat:'Продукты',type:'expense',segment:'personal',amount:3200},
    {id:'d11',date:ym+'-07',desc:'Маркетинг Instagram',cat:'Маркетинг',type:'expense',segment:'business',amount:2000},
    {id:'d12',date:ym+'-09',desc:'Кофе и транспорт',cat:'Транспорт',type:'expense',segment:'personal',amount:1800},
    // Previous months
    {id:'d13',date:prevMonth(1)+'-20',desc:'Маникюр — клиенты (14 шт)',cat:'Клиент',type:'income',segment:'business',amount:52000},
    {id:'d14',date:prevMonth(1)+'-25',desc:'Материалы и расходники',cat:'Материалы',type:'expense',segment:'business',amount:5600},
    {id:'d15',date:prevMonth(1)+'-01',desc:'Аренда кабинета',cat:'Аренда',type:'expense',segment:'business',amount:8000},
    {id:'d16',date:prevMonth(2)+'-20',desc:'Маникюр — клиенты',cat:'Клиент',type:'income',segment:'business',amount:47500},
    {id:'d17',date:prevMonth(2)+'-05',desc:'Обучение — курс по нейл-арту',cat:'Обучение',type:'expense',segment:'business',amount:9000},
    {id:'d18',date:prevMonth(3)+'-18',desc:'Маникюр — клиенты',cat:'Клиент',type:'income',segment:'business',amount:44000},
    {id:'d19',date:prevMonth(3)+'-01',desc:'Аренда',cat:'Аренда',type:'expense',segment:'business',amount:8000},
    {id:'d20',date:prevMonth(4)+'-22',desc:'Доход за месяц',cat:'Клиент',type:'income',segment:'business',amount:41000},
    {id:'d21',date:prevMonth(5)+'-20',desc:'Доход за месяц',cat:'Клиент',type:'income',segment:'business',amount:38000},
  ];
  saveTx(txs);

  // ── APPOINTMENTS ─────────────────────────────────────────────
  var appts = [
    {id:'a1',client:'Анна Козлова',phone:'+7 916 123-45-67',service:'Маникюр с покрытием',date:d(1),time:'10:00',price:3500,status:'confirmed',source:'manual'},
    {id:'a2',client:'Мария Смирнова',phone:'+7 903 234-56-78',service:'Педикюр + гель',date:d(1),time:'12:30',price:4200,status:'confirmed',source:'online'},
    {id:'a3',client:'Юлия Петрова',phone:'+7 925 345-67-89',service:'Наращивание ногтей',date:d(2),time:'11:00',price:6500,status:'pending',source:'online'},
    {id:'a4',client:'Светлана Романова',phone:'+7 917 456-78-90',service:'Маникюр + дизайн',date:d(3),time:'14:00',price:4800,status:'confirmed',source:'manual'},
    {id:'a5',client:'Ольга Васильева',phone:'+7 916 567-89-01',service:'Коррекция',date:d(5),time:'10:00',price:2800,status:'confirmed',source:'manual'},
    {id:'a6',client:'Анна Козлова',phone:'+7 916 123-45-67',service:'Маникюр с покрытием',date:ym+'-10',time:'10:00',price:3500,status:'confirmed',source:'manual',paid:true},
    {id:'a7',client:'Мария Смирнова',phone:'+7 903 234-56-78',service:'Педикюр',date:ym+'-06',time:'12:00',price:3200,status:'confirmed',source:'online',paid:true},
    {id:'a8',client:'Юлия Петрова',phone:'+7 925 345-67-89',service:'Наращивание',date:ym+'-12',time:'11:00',price:6500,status:'confirmed',source:'online'},
  ];
  saveAppts(appts);

  // ── SETTINGS ─────────────────────────────────────────────────
  var settings = getSettings();
  settings.income  = 60000;
  settings.goal    = 300000;
  settings.monthly = 12000;
  settings.yield   = 12;
  saveSettings(settings);

  // ── BOOKING SETTINGS ─────────────────────────────────────────
  var bs = getBookingSettings();
  bs.isOpen      = true;
  bs.masterName  = 'Мастер';
  bs.masterProf  = 'Nail-мастер';
  bs.workDays    = [1,2,3,4,5];
  bs.workStart   = '10:00';
  bs.workEnd     = '19:00';
  bs.services    = [
    {id:'s1',name:'Маникюр с покрытием',dur:90, price:3500},
    {id:'s2',name:'Педикюр',            dur:60, price:3200},
    {id:'s3',name:'Наращивание ногтей', dur:150,price:6500},
    {id:'s4',name:'Коррекция',          dur:60, price:2800},
    {id:'s5',name:'Дизайн ногтей',      dur:30, price:1200},
  ];
  saveBookingSettingsData(bs);
}

// Set today's date as default for appointments
document.getElementById('apptDate').value=new Date().toISOString().split('T')[0];




// ════════════════════════════════════════════
// HELP SYSTEM
// ════════════════════════════════════════════
var HELP_CONTENT = {

  dashboard:{
    tag:'Раздел',
    title:'Обзор — твой финансовый пульт',
    lead:'Одна страница, где видно всё самое важное: сколько заработал, сколько накопил, кто записан и куда уходят деньги.',
    sections:[
      {title:'Как пользоваться',steps:[
        {n:1,text:'Открывай <strong>каждое утро</strong> — это твой ежедневный брифинг'},
        {n:2,text:'4 карточки вверху — следи как растут цифры месяц к месяцу'},
        {n:3,text:'График 6 месяцев показывает тренд: ты растёшь или стагнируешь'},
        {n:4,text:'Блок 50/30/20 — проверяй, правильно ли распределяются деньги'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'📊',text:'Вся картина за 10 секунд — не нужно открывать 5 приложений'},
        {icon:'📈',text:'График роста мотивирует — ты видишь прогресс визуально'},
        {icon:'🎯',text:'Напоминает про ближайшие записи — не забудешь клиента'},
        {icon:'💡',text:'Показывает аномалии — резкий рост расходов сразу виден'},
      ]},
    ],
    tip:'<strong>Совет:</strong> Открывай обзор каждый понедельник — это займёт 2 минуты и даст ясность на всю неделю.',
  },

  finances:{
    tag:'Раздел',
    title:'Финансы — учёт доходов и расходов',
    lead:'Раздельный учёт бизнеса и личного. Ты видишь реальную прибыль, а не просто остаток на карте.',
    sections:[
      {title:'Как вводить операции',steps:[
        {n:1,text:'Нажми <strong>↑ Доход</strong> или <strong>↓ Расход</strong> — выбери тип'},
        {n:2,text:'Введи сумму в большое поле. <strong>Enter = доход, Shift+Enter = расход</strong>'},
        {n:3,text:'Укажи описание и категорию — потом сможешь фильтровать'},
        {n:4,text:'Выбери сегмент: <strong>Бизнес</strong> (от клиентов) или <strong>Личное</strong> (для себя)'},
        {n:5,text:'Нажми «Добавить» — операция появится в таблице мгновенно'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'🔍',text:'Видишь реальную прибыль бизнеса, а не просто выручку'},
        {icon:'📂',text:'Бизнес и личное раздельно — налоговая отчётность без боли'},
        {icon:'⚡',text:'5 секунд на операцию — быстрее чем в любом банковском приложении'},
        {icon:'📉',text:'Фильтр по категориям показывает на что реально уходят деньги'},
      ]},
    ],
    tip:'<strong>Правило мастера-миллионера:</strong> записывай каждую операцию в день когда она произошла. Не копи на потом — теряется 30% данных.',
  },

  capital:{
    tag:'Раздел',
    title:'Капитал — деньги, которые работают на тебя',
    lead:'Разница между мастером и предпринимателем — у второго деньги работают пока он спит. Этот раздел строит этот фундамент.',
    sections:[
      {title:'Как строить капитал',steps:[
        {n:1,text:'Задай <strong>финансовую цель</strong> — конкретную сумму и срок'},
        {n:2,text:'Настрой <strong>ежемесячный взнос</strong> — даже 5 000 ₽ это начало'},
        {n:3,text:'Добавь <strong>инвестиционные активы</strong> — депозит, фонды, облигации'},
        {n:4,text:'Смотри прогноз на 1/3/5/10 лет — сложный процент творит чудеса'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'🏦',text:'Подушка безопасности — 4 месяца без паники если нет клиентов'},
        {icon:'📈',text:'Прогноз показывает конкретную дату когда ты станешь финансово свободным'},
        {icon:'💎',text:'Правило 50/30/20 распределяет деньги автоматически'},
        {icon:'🔢',text:'Калькулятор сложного процента — почувствуй силу времени'},
      ]},
    ],
    tip:'<strong>Эйнштейн говорил:</strong> сложный процент — восьмое чудо света. 10 000 ₽ в месяц под 12% годовых = 2,4 млн ₽ за 10 лет.',
  },

  calendar:{
    tag:'Раздел',
    title:'Записи — твой рабочий календарь',
    lead:'Всё расписание в одном месте. Добавил запись — она появилась на календаре и в статистике выручки одновременно.',
    sections:[
      {title:'Как работать с записями',steps:[
        {n:1,text:'Нажми на любой день в календаре — дата подставится в форму автоматически'},
        {n:2,text:'Введи имя клиента, услугу, время и стоимость'},
        {n:3,text:'Запись появится на календаре цветным блоком'},
        {n:4,text:'<strong>Зелёный</strong> — подтверждено, <strong>жёлтый</strong> — ожидает, <strong>красный</strong> — отменено'},
        {n:5,text:'После визита подтверди — запись учтётся в выручке'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'📅',text:'Никогда не забудешь клиента — всё перед глазами'},
        {icon:'💰',text:'Стоимость записи автоматически считается в выручку месяца'},
        {icon:'📊',text:'Видишь загрузку: когда окна, когда пиковые дни'},
        {icon:'🔄',text:'История клиентов — кто ходит чаще всего'},
      ]},
    ],
    tip:'<strong>Лайфхак:</strong> заполняй стоимость услуги при создании записи — тогда статистика выручки считается сама, без ручного ввода.',
  },

  hour:{
    tag:'Мышление',
    title:'Цена часа — твоя главная метрика',
    lead:'Большинство мастеров считают клиентов в день. Предприниматель считает стоимость своего часа. Эта цифра показывает, растёшь ты или стоишь на месте.',
    sections:[
      {title:'Как считать цену часа',steps:[
        {n:1,text:'После каждого рабочего дня введи: <strong>сколько заработал</strong> и <strong>сколько часов работал</strong>'},
        {n:2,text:'Приложение посчитает ₽/час автоматически'},
        {n:3,text:'Смотри на <strong>динамику</strong> — цена часа должна расти каждые 2-3 месяца'},
        {n:4,text:'Используй инсайт внизу — он скажет что делать дальше'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'⏰',text:'Видишь реальную ценность своего времени — не иллюзию'},
        {icon:'💡',text:'Поднять цену на 20% = рост ₽/час без новых клиентов'},
        {icon:'🎯',text:'Ставишь цель х2 — и видишь за сколько месяцев достигнешь'},
        {icon:'🧠',text:'Мышление переключается с "я устала" на "мой час стал дороже"'},
      ]},
    ],
    tip:'<strong>Ориентир:</strong> бьюти-мастер среднего уровня — 800-1200 ₽/час. Топ-специалист в Москве — 3000-8000 ₽/час. Где ты сейчас?',
  },

  owner:{
    tag:'Мышление',
    title:'Зарплата владельца — ты босс своего бизнеса',
    lead:'Пока ты берёшь из кассы "сколько осталось" — ты работаешь наёмным сотрудником у самого себя. Фиксированная зарплата владельца меняет это навсегда.',
    sections:[
      {title:'Как настроить',steps:[
        {n:1,text:'Введи <strong>выручку бизнеса</strong> за месяц — всё что пришло от клиентов'},
        {n:2,text:'Укажи <strong>расходы бизнеса</strong> — материалы, аренда, реклама'},
        {n:3,text:'Назначь себе <strong>фиксированную зарплату</strong> — 40-60% от выручки'},
        {n:4,text:'Остаток — прибыль бизнеса. Реинвестируй её или отложи в капитал'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'💼',text:'Видишь: бизнес прибыльный или нет — честный ответ'},
        {icon:'🧾',text:'Налог индивидуального предпринимателя считается автоматически — не будет сюрпризов'},
        {icon:'📐',text:'Анализ маржинальности — понимаешь здоровье бизнеса'},
        {icon:'🚀',text:'Прибыль бизнеса = ресурс для роста, а не просто "лишние деньги"'},
      ]},
    ],
    tip:'<strong>Золотое правило:</strong> зарплата владельца = 40-60% выручки. Если меньше 30% — ты эксплуатируешь себя. Если больше 70% — бизнес не развивается.',
  },

  pulse:{
    tag:'Мышление',
    title:'Финансовый пульс — еженедельная рефлексия',
    lead:'3 вопроса раз в неделю меняют финансовое мышление глубже, чем любой курс. Рефлексия превращает действия в привычки, а привычки — в результаты.',
    sections:[
      {title:'Как проходить',steps:[
        {n:1,text:'Каждую <strong>пятницу или воскресенье</strong> открывай этот раздел — 3 минуты'},
        {n:2,text:'Честно отвечай на 3 вопроса — система не осуждает'},
        {n:3,text:'Получи анализ недели и конкретный совет'},
        {n:4,text:'Отмечай <strong>ежедневные привычки</strong> — 21 день делают их автоматическими'},
        {n:5,text:'Пиши в <strong>финансовый дневник</strong> — выгружай мысли о деньгах'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'🔥',text:'Серия недель — мощная мотивация не прерывать полезные привычки'},
        {icon:'🧠',text:'Рефлексия меняет денежные убеждения на глубинном уровне'},
        {icon:'📓',text:'Дневник помогает найти страхи и блоки вокруг денег'},
        {icon:'📈',text:'Через 8 недель финансовое поведение меняется измеримо'},
      ]},
    ],
    tip:'<strong>Исследования показывают:</strong> люди которые ведут финансовый дневник, накапливают на 23% больше за год. Мысли о деньгах меняют поведение.',
  },

  booking:{
    tag:'Онлайн-запись',
    title:'Онлайн-запись — клиент записывается сам',
    lead:'Никаких звонков и переписки туда-обратно. Клиент открывает ссылку, выбирает услугу, дату и время — заявка приходит тебе мгновенно.',
    sections:[
      {title:'Как создать ссылку — пошагово',steps:[
        {n:1,text:'Перейди в раздел <strong>«🔗 Онлайн-запись»</strong> в боковом меню'},
        {n:2,text:'Добавь <strong>услуги</strong> — название, длительность в минутах и цену'},
        {n:3,text:'Укажи <strong>рабочие дни</strong> (нажми нужные кнопки Пн–Вс) и <strong>часы работы</strong> (с / до)'},
        {n:4,text:'Введи свой <strong>номер телефона</strong> в поле «Телефон для записи» — клиент сможет написать в WhatsApp или MAX'},
        {n:5,text:'Включи тумблер <strong>«Приём заявок активен»</strong> — появится твоя ссылка'},
        {n:6,text:'Нажми <strong>«📋 Скопировать»</strong> — ссылка готова к отправке'},
      ]},
      {title:'Куда отправить ссылку',benefits:[
        {icon:'💬',text:'WhatsApp / Telegram — вставь в переписку с клиентом'},
        {icon:'📸',text:'Instagram — поставь в шапку профиля (Bio)'},
        {icon:'📲',text:'Stories — добавь как наклейку-ссылку'},
        {icon:'🖨️',text:'QR-код — распечатай и поставь на рабочем месте'},
      ]},
      {title:'Как работает для клиента',steps:[
        {n:1,text:'Клиент открывает ссылку в браузере — видит <strong>твоё имя и список услуг</strong>'},
        {n:2,text:'Выбирает <strong>услугу → дату → время</strong> из доступных слотов'},
        {n:3,text:'Вводит <strong>имя и телефон</strong>, при желании — комментарий'},
        {n:4,text:'Нажимает «Записаться» — заявка сразу появляется у тебя во <strong>«Входящих заявках»</strong>'},
        {n:5,text:'Клиент видит кнопки <strong>«Написать в WhatsApp»</strong> и <strong>«Написать в MAX»</strong> — нажимает и отправляет тебе готовое сообщение с деталями'},
      ]},
    ],
    tip:'<strong>Лайфхак:</strong> добавь ссылку в шапку Instagram один раз — и клиенты будут записываться сами, даже ночью. Ты проснёшься с готовыми заявками в приложении.',
  },

  blog:{
    tag:'Сообщество',
    title:'Блог — учись у тех, кто уже сделал',
    lead:'Окружение — самый мощный инструмент изменения мышления. Читай истории других мастеров, делись своими победами, задавай вопросы.',
    sections:[
      {title:'Как участвовать',steps:[
        {n:1,text:'Читай публикации — фильтруй по темам которые актуальны сейчас'},
        {n:2,text:'Ставь лайки на истории которые вдохновляют — авторам важна обратная связь'},
        {n:3,text:'Комментируй — задавай вопросы, делись опытом'},
        {n:4,text:'<strong>Напиши свою историю</strong> — выбери тег, заголовок и поделись'},
      ]},
      {title:'О чём писать',benefits:[
        {icon:'🏆',text:'Победа: поднял цену, заработал первый миллион, открыл счёт'},
        {icon:'💡',text:'Инсайт: что изменило твоё мышление о деньгах'},
        {icon:'⏰',text:'Цена часа: как ты её считаешь и к чему стремишься'},
        {icon:'🧠',text:'Мышление: что мешало богатеть и как ты это преодолел'},
      ]},
    ],
    tip:'<strong>Эффект сообщества:</strong> "Покажи мне 5 своих друзей — я скажу сколько ты зарабатываешь." Окружи себя людьми с мышлением роста.',
  },

  settings:{
    tag:'Раздел',
    title:'Настройки — персонализируй систему',
    lead:'Чем точнее настроено приложение под тебя, тем полезнее оно работает. Потрать 5 минут один раз — получай точные данные постоянно.',
    sections:[
      {title:'Что настроить',steps:[
        {n:1,text:'<strong>Профиль:</strong> укажи имя, профессию и ожидаемый доход'},
        {n:2,text:'<strong>Финансовые правила:</strong> включи 50/30/20 и подушку безопасности'},
        {n:3,text:'<strong>Категории:</strong> добавь свои — «Краска», «Аренда кресла», «Курсы»'},
        {n:4,text:'<strong>Экспорт:</strong> скачай CSV для бухгалтера или налоговой'},
      ]},
      {title:'В чём польза',benefits:[
        {icon:'🎯',text:'Персональные категории = точная аналитика по твоей профессии'},
        {icon:'📊',text:'Реальный доход в настройках = правильный расчёт 50/30/20'},
        {icon:'📁',text:'Экспорт CSV — для самозанятых при подаче отчётности'},
        {icon:'🔒',text:'Все данные только на твоём устройстве — никаких серверов'},
      ]},
    ],
    tip:'<strong>Первый шаг:</strong> введи свой средний доход в месяц. Тогда блок 50/30/20 покажет реальные суммы, а не абстрактные проценты.',
  },

};

function openHelp(key){
  var d=HELP_CONTENT[key];
  if(!d)return;
  var html='<div class="help-tag">'+d.tag+'</div>';
  html+='<div class="help-title">'+d.title+'</div>';
  html+='<div class="help-lead">'+d.lead+'</div>';
  (d.sections||[]).forEach(function(sec){
    html+='<div class="help-section">';
    html+='<div class="help-section-title">'+sec.title+'</div>';
    if(sec.steps){
      html+='<div class="help-steps">';
      sec.steps.forEach(function(s){
        html+='<div class="help-step"><div class="help-step-num">'+s.n+'</div><div class="help-step-text">'+s.text+'</div></div>';
      });
      html+='</div>';
    }
    if(sec.benefits){
      html+='<div class="help-benefits">';
      sec.benefits.forEach(function(b){
        html+='<div class="help-benefit"><span class="help-benefit-icon">'+b.icon+'</span>'+b.text+'</div>';
      });
      html+='</div>';
    }
    html+='</div>';
  });
  if(d.tip) html+='<div class="help-tip">'+d.tip+'</div>';
  html+='<button class="help-close-btn" onclick="closeHelp()">Понятно, закрыть</button>';
  document.getElementById('helpContent').innerHTML=html;
  document.getElementById('helpOverlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeHelp(e){
  if(e&&e.target!==document.getElementById('helpOverlay'))return;
  document.getElementById('helpOverlay').classList.remove('open');
  document.body.style.overflow='';
}


// ════════════════════════════════════════════
// THEME — LIGHT / DARK
// ════════════════════════════════════════════
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('km_theme', theme);
  var isDark = theme === 'dark';
  var icon = isDark ? '☀️' : '🌙';
  var btn = document.getElementById('themeToggleBtn');
  var mob = document.getElementById('themeToggleMob');
  if(btn) btn.textContent = icon;
  if(mob) mob.textContent = icon;
}
function toggleTheme(){
  var current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
// Apply saved theme on load
(function(){
  var saved = localStorage.getItem('km_theme') || 'light';
  applyTheme(saved);
})();

// Telegram notify for master app (Firebase listener)
// Telegram notify for master app
function notifyTelegramNewAppt(appt){
  var nl = '\n';
  var parts = [
    '🔔 *Новая заявка!*', '',
    '👤 *' + (appt.client||'') + '*',
    appt.phone ? '📞 ' + appt.phone : null,
    '💆 ' + (appt.service||'—'),
    '📅 ' + (appt.date||'') + '  🕐 ' + (appt.time||''),
    appt.price ? '💰 ' + Math.round(appt.price).toLocaleString('ru-RU') + ' ₽' : null
  ].filter(function(x){ return x !== null; });
  sendTgViaProxy(parts.join(nl));
}

// Firebase connection status indicator
function updateFbStatus(ok, msg){
  var dot = document.getElementById('fbSyncDot');
  var txt = document.getElementById('fbSyncStatus');
  if(dot) dot.style.background = ok ? 'var(--em)' : 'var(--red)';
  if(txt) txt.textContent = msg || (ok ? 'Данные синхронизируются между устройствами' : 'Работаем офлайн — данные сохранены локально');
}

// Check Firebase connection on load
if(typeof db !== 'undefined'){
  db.ref('.info/connected').on('value', function(snap){
    updateFbStatus(!!snap.val(), snap.val()
      ? '✓ Синхронизация активна — данные на всех устройствах'
      : '⚠ Офлайн — данные сохраняются локально');
  });
}


// ════════════════════════════════════════════
// FIREBASE — BOOKING SYNC
// ════════════════════════════════════════════

// Save master booking settings to Firebase under their user ID
function fbSaveBookingSettings(s){
  var sess = load('km_session', {});
  var uid = sess.id || 'default';
  if(typeof db === 'undefined') return;
  db.ref('masters/' + uid + '/settings').set({
    isOpen:       s.isOpen || false,
    masterName:   s.masterName || '',
    masterProf:   s.masterProf || '',
    masterPhone:  s.masterPhone || '',
    masterTelegram: s.masterTelegram || '',
    services:     s.services || [],
    workDays:     s.workDays || [1,2,3,4,5],
    workStart:    s.workStart || '10:00',
    workEnd:      s.workEnd || '19:00',
    customSlug:   s.customSlug || '',
    updatedAt:    Date.now()
  }).then(function(){
    console.log('Firebase: settings saved');
  }).catch(function(e){ console.warn('Firebase save error:', e); });
}

// Save incoming appointment to Firebase (from booking.html)
function fbSaveAppointment(masterUid, appt){
  if(typeof db === 'undefined') return Promise.reject('no db');
  return db.ref('masters/' + masterUid + '/appointments/' + appt.id).set(appt);
}

// Load master settings from Firebase by UID
function fbLoadMasterSettings(masterUid){
  if(typeof db === 'undefined') return Promise.resolve(null);
  return db.ref('masters/' + masterUid + '/settings').once('value').then(function(snap){
    return snap.val();
  });
}

// Listen for new appointments in real-time
function fbListenAppointments(){
  var sess = load('km_session', {});
  var uid = sess.id || 'default';
  if(typeof db === 'undefined') return;
  db.ref('masters/' + uid + '/appointments').on('value', function(snap){
    var fbAppts = snap.val() || {};
    // Merge Firebase appointments with local
    var local = getAppts().filter(function(a){ return a.source !== 'online'; });
    var online = Object.values(fbAppts);
    saveAppts(local.concat(online));
    // Refresh if booking page is open
    var bookPage = document.getElementById('page-booking');
    if(bookPage && bookPage.classList.contains('active')){
      renderIncomingList();
    }
    // Update pending badge
    var pending = online.filter(function(a){ return a.status === 'pending'; });
    ['pendingCount','pendingCountMob'].forEach(function(id){
      var b = document.getElementById(id);
      if(b){ b.textContent=pending.length; b.style.display=pending.length?'inline-flex':'none'; }
    });
  });
}

// Sync status confirm/cancel to Firebase
function fbUpdateApptStatus(apptId, status){
  var sess = load('km_session', {});
  var uid = sess.id || 'default';
  if(typeof db === 'undefined') return;
  db.ref('masters/' + uid + '/appointments/' + apptId + '/status').set(status);
}

// ════════════════════════════════════════════
// BOOKING SYSTEM — NEW CLEAN VERSION
// ════════════════════════════════════════════

function getBookingSettings(){
  return load('km_booking_settings',{
    isOpen:false, services:[], workDays:[1,2,3,4,5],
    workStart:'10:00', workEnd:'19:00',
    masterName:'', masterProf:'',
    masterPhone:'', masterTelegram:'', customSlug:''
  });
}
function saveBookingSettingsData(d){
  store('km_booking_settings', d);
  fbSaveBookingSettings(d);  // sync to Firebase
}

function switchBookTab(n){
  [1,2,3].forEach(function(i){
    document.getElementById('bookTab'+i).style.display = i===n ? 'block' : 'none';
    var btn = document.getElementById('btab'+i);
    if(btn) btn.classList.toggle('active', i===n);
  });
  if(n===1) renderIncomingList();
  if(n===2) renderBookingSettings();
  if(n===3) renderBookingLink();
}

function renderBookingPage(){
  renderIncomingList();
  renderBookingSettings();
  renderBookingLink();
}

// ── TAB 2: Settings ─────────────────────────────────────────
function renderBookingSettings(){
  var s = getBookingSettings();
  var mp = document.getElementById('masterPhone');
  var ws = document.getElementById('workStart');
  var we = document.getElementById('workEnd');
  var slugEl = document.getElementById('customSlug');
  if(mp && s.masterPhone) mp.value = s.masterPhone;
  var tgEl2 = document.getElementById('masterTelegram');
  if(tgEl2 && s.masterTelegram) tgEl2.value = s.masterTelegram;
  if(ws) ws.value = s.workStart || '10:00';
  if(we) we.value = s.workEnd || '19:00';
  if(slugEl && s.customSlug) slugEl.value = s.customSlug;
  // Work day chips
  document.querySelectorAll('#bookTab2 .slot-chip[data-day]').forEach(function(btn){
    var day = parseInt(btn.dataset.day);
    btn.classList.toggle('active', (s.workDays||[]).indexOf(day) > -1);
  });
  renderServiceList();
}

function saveBookingSettings(){
  var s = getBookingSettings();
  var mp = document.getElementById('masterPhone');
  var ws = document.getElementById('workStart');
  var we = document.getElementById('workEnd');
  var slugEl = document.getElementById('customSlug');
  if(mp) s.masterPhone = mp.value.trim();
  if(ws) s.workStart = ws.value;
  if(we) s.workEnd = we.value;
  if(slugEl) s.customSlug = slugEl.value.trim();
  var sess = load('km_session', {});
  s.masterName = sess.name || 'Мастер';
  s.masterProf = sess.prof || 'Специалист';
  saveBookingSettingsData(s);
}

function onSlugInput(el){
  el.value = el.value.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/\s/g,'-').replace(/-{2,}/g,'-');
  saveBookingSettings();
  renderBookingLink();
}

// ── TAB 3: Link ──────────────────────────────────────────────
function renderBookingLink(){
  var s = getBookingSettings();
  var tog = document.getElementById('bookingToggle');
  var statusText = document.getElementById('bookStatusText');
  var linkDiv = document.getElementById('bookLinkUrl');
  var linkResult = document.getElementById('bookLinkResult');
  var slugEl = document.getElementById('customSlug');
  var slugPreview = document.getElementById('slugPreview');
  var slug = (slugEl ? slugEl.value.trim() : '') || s.customSlug || '';

  // Toggle state
  if(tog){ if(s.isOpen) tog.classList.add('on'); else tog.classList.remove('on'); }

  if(s.isOpen){
    var sess2 = load('km_session', {});
    var uid2 = sess2.id || 'default';
    var fullUrl = window.location.origin + '/booking.html?master=' + uid2;
    // Short beautiful URL — redirects to booking.html via Vercel
    var url = window.location.origin + '/%D0%BE%D0%BD%D0%BB%D0%B0%D0%B9%D0%BD-%D0%B7%D0%B0%D0%BF%D0%B8%D1%81%D1%8C?master=' + uid2;
    var displayUrl = window.location.origin + '/онлайн-запись';
    var display = slug
      ? window.location.origin + '/b/' + slug
      : url;
    if(statusText) statusText.textContent = '✅ Клиенты могут записаться по ссылке';
    if(linkDiv){
      linkDiv.textContent = display;
      linkDiv.style.color = 'var(--em)';
      linkDiv.style.fontWeight = '600';
    }
    if(linkResult){
      linkResult.style.borderLeftColor = 'var(--em)';
      linkResult.style.background = 'rgba(13,110,74,0.06)';
    }
    // Update KPI status
    var bs = document.getElementById('bookStatus');
    if(bs) bs.textContent = '✅ Открыта';
  } else {
    if(statusText) statusText.textContent = 'Выключено — клиенты не могут записаться';
    if(linkDiv){
      linkDiv.textContent = 'Включи приём заявок чтобы получить ссылку';
      linkDiv.style.color = 'var(--muted)';
      linkDiv.style.fontWeight = '400';
    }
    if(linkResult){
      linkResult.style.borderLeftColor = 'var(--border)';
      linkResult.style.background = 'var(--cream2)';
    }
    var bs2 = document.getElementById('bookStatus');
    if(bs2) bs2.textContent = '⏸ Выкл';
  }

  if(slugPreview && slug){
    slugPreview.innerHTML = 'Красивая ссылка: <strong style="color:var(--em)">' +
      window.location.origin + '/b/' + slug + '</strong>';
  }
}

function toggleBooking(){
  var s = getBookingSettings();
  s.isOpen = !s.isOpen;
  var sess = load('km_session', {});
  s.masterName = sess.name || 'Мастер';
  s.masterProf = sess.prof || 'Специалист';
  saveBookingSettingsData(s);
  renderBookingLink();
  renderIncomingList();
  toast(s.isOpen ? '✅ Приём заявок включён' : '⏸ Приём заявок выключен');
}

function copyBookLink(){
  var s = getBookingSettings();
  if(!s.isOpen){ toast('Сначала включи приём заявок','error'); return; }
  var sess = load('km_session', {});
  var uid = sess.id || 'default';
  // Copy beautiful short URL that redirects correctly
  var url = window.location.origin + '/%D0%BE%D0%BD%D0%BB%D0%B0%D0%B9%D0%BD-%D0%B7%D0%B0%D0%BF%D0%B8%D1%81%D1%8C?master=' + uid;
  if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(function(){ toast('✓ Ссылка скопирована! Отправь клиентам'); });
  } else {
    var inp = document.createElement('input');
    inp.value = url; document.body.appendChild(inp); inp.select();
    document.execCommand('copy'); document.body.removeChild(inp);
    toast('✓ Ссылка скопирована!');
  }
}

// ── Services ─────────────────────────────────────────────────
function addService(){
  var name = (document.getElementById('svcName')||{}).value;
  name = name ? name.trim() : '';
  var dur = parseInt((document.getElementById('svcDur')||{}).value)||60;
  var price = parseFloat((document.getElementById('svcPrice')||{}).value)||0;
  if(!name){ toast('Введите название услуги','error'); return; }
  var s = getBookingSettings();
  if(!s.services) s.services = [];
  s.services.push({id:uid(), name:name, dur:dur, price:price});
  saveBookingSettingsData(s);
  if(document.getElementById('svcName')) document.getElementById('svcName').value='';
  if(document.getElementById('svcDur')) document.getElementById('svcDur').value='60';
  if(document.getElementById('svcPrice')) document.getElementById('svcPrice').value='';
  renderServiceList();
  toast('Услуга добавлена ✓');
}

function renderServiceList(){
  var s = getBookingSettings();
  var el = document.getElementById('serviceList');
  if(!el) return;
  if(!s.services || !s.services.length){
    el.innerHTML = '<div style="font-size:0.85rem;color:var(--muted);padding:8px 0">Добавьте услуги ниже</div>';
    return;
  }
  el.innerHTML = '';
  s.services.forEach(function(svc){
    var row = document.createElement('div');
    row.className = 'service-item';
    row.innerHTML =
      '<div><div class="service-name">'+svc.name+'</div><div class="service-dur">'+svc.dur+' мин</div></div>'+
      '<div class="service-price">'+Math.round(svc.price).toLocaleString('ru-RU')+' ₽</div>';
    var delBtn = document.createElement('button');
    delBtn.className = 'service-del';
    delBtn.title = 'Удалить';
    delBtn.textContent = '×';
    delBtn.onclick = (function(id){ return function(){ deleteService(id); }; })(svc.id);
    row.appendChild(delBtn);
    el.appendChild(row);
  });
}

function deleteService(id){
  var s = getBookingSettings();
  s.services = s.services.filter(function(x){ return x.id !== id; });
  saveBookingSettingsData(s);
  renderServiceList();
}

// ── Incoming requests ────────────────────────────────────────
function renderIncomingList(){
  var el = document.getElementById('incomingList');
  if(!el) return;
  var appts = getAppts().filter(function(a){ return a.source === 'online'; });
  var pending = appts.filter(function(a){ return a.status === 'pending'; });
  var pendingBadges = ['pendingCount','pendingCountMob'];
  pendingBadges.forEach(function(id){
    var b = document.getElementById(id);
    if(b){ b.textContent=pending.length; b.style.display=pending.length?'inline-flex':'none'; }
  });
  var bookPending = document.getElementById('bookPending');
  var bookTotal = document.getElementById('bookTotal');
  var bookRevenue = document.getElementById('bookRevenue');
  if(bookPending) bookPending.textContent = pending.length;
  if(bookTotal) bookTotal.textContent = appts.length;
  if(bookRevenue){
    var rev = pending.reduce(function(a,x){ return a+(+x.price||0); },0);
    bookRevenue.innerHTML = rev.toLocaleString('ru-RU')+' <small>₽</small>';
  }
  if(!appts.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Заявок пока нет.<br>Отправь ссылку клиентам — они запишутся сами.</div></div>';
    return;
  }
  el.innerHTML = '';
  var sorted = appts.slice().sort(function(a,b){ return (b.created||0)-(a.created||0); });
  sorted.forEach(function(a){
    var sc = {pending:'var(--gold)', confirmed:'var(--em)', cancelled:'var(--red)'}[a.status]||'var(--muted)';
    var sl = {pending:'Ожидает', confirmed:'Подтверждена', cancelled:'Отменена'}[a.status]||a.status;
    var phone = a.phone ? a.phone.replace(/\D/g,'') : '';
    var nl = '%0A';
    var msg = 'text='+encodeURIComponent('Здравствуйте, '+a.client+'! Запись подтверждена. Услуга: '+a.service+'. '+a.date+' в '+a.time+(a.price?' Стоимость: '+Math.round(a.price).toLocaleString('ru-RU')+' руб.':''));
    var div = document.createElement('div');
    div.style.cssText = 'padding:16px;border-left:3px solid '+sc+';margin-bottom:10px;background:var(--cream)';
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'+
        '<div><div style="font-size:0.95rem;font-weight:700;color:var(--ink)">'+a.client+'</div>'+
        (a.phone?'<div style="font-size:0.78rem;color:var(--muted)">📞 '+a.phone+'</div>':'')+
        '</div>'+
        '<span style="font-size:0.68rem;font-weight:700;padding:3px 10px;background:'+sc+';color:#fff">'+sl+'</span>'+
      '</div>'+
      '<div style="font-size:0.82rem;color:var(--muted);margin-bottom:10px">'+a.service+' · '+a.date+' в '+a.time+(a.price?' · '+Math.round(a.price).toLocaleString('ru-RU')+' ₽':'')+'</div>'+
      (a.note?'<div style="font-size:0.78rem;font-style:italic;color:var(--muted);margin-bottom:8px">💬 '+a.note+'</div>':'')+
      '<div class="appt-actions" style="display:flex;gap:6px;flex-wrap:wrap"></div>';
    var actions = div.querySelector('.appt-actions');
    if(a.status==='pending'){
      var confBtn = document.createElement('button');
      confBtn.style.cssText = 'flex:1;padding:8px;background:var(--em);color:#fff;border:none;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif';
      confBtn.textContent = '✓ Подтвердить';
      confBtn.onclick = (function(id){ return function(){ confirmAppt(id); }; })(a.id);
      var canBtn = document.createElement('button');
      canBtn.style.cssText = 'flex:1;padding:8px;background:none;border:1.5px solid var(--border);color:var(--muted);font-size:0.78rem;cursor:pointer;font-family:DM Sans,sans-serif';
      canBtn.textContent = '✕ Отменить';
      canBtn.onclick = (function(id){ return function(){ cancelAppt(id); }; })(a.id);
      actions.appendChild(confBtn);
      actions.appendChild(canBtn);
    }
    if(phone){
      var waA = document.createElement('a');
      waA.href = 'https://wa.me/'+phone+'?'+msg;
      waA.target = '_blank';
      waA.style.cssText = 'padding:8px 12px;background:#25D366;color:#fff;font-size:0.75rem;font-weight:700;text-decoration:none';
      waA.textContent = 'WA';
      var maxA = document.createElement('a');
      maxA.href = 'https://max.ru/chat/'+phone+'?'+msg;
      maxA.target = '_blank';
      maxA.style.cssText = 'padding:8px 12px;background:#005BFF;color:#fff;font-size:0.75rem;font-weight:700;text-decoration:none';
      maxA.textContent = 'MAX';
      actions.appendChild(waA);
      actions.appendChild(maxA);
    }
    el.appendChild(div);
  });
}

function confirmAppt(id){
  var appts = getAppts();
  var a = appts.find(function(x){ return x.id===id; });
  if(a){
    a.status='confirmed'; saveAppts(appts);
    fbUpdateApptStatus(id, 'confirmed');
    toast('Запись подтверждена ✓'); renderIncomingList(); renderCalendar();
  }
}
function cancelAppt(id){
  var appts = getAppts();
  var a = appts.find(function(x){ return x.id===id; });
  if(a){
    a.status='cancelled'; saveAppts(appts);
    fbUpdateApptStatus(id, 'cancelled');
    toast('Запись отменена'); renderIncomingList(); renderCalendar();
  }
}

// ── Calendar: phone input + notification ─────────────────────
document.getElementById('apptPhone') && document.getElementById('apptPhone').addEventListener('input', function(){
  var phone = this.value.trim();
  var waBtn = document.getElementById('sendWaBtn');
  var maxBtn = document.getElementById('sendMaxBtn');
  if(waBtn) waBtn.style.display = phone.length > 5 ? 'block' : 'none';
  if(maxBtn) maxBtn.style.display = phone.length > 5 ? 'block' : 'none';
});

function buildApptMessage(a){
  var sess = load('km_session', {});
  var nl = '\n';
  return encodeURIComponent(
    'Здравствуйте, '+a.client+'! Вы записаны:'+nl+
    'Дата: '+a.date+' в '+a.time+nl+
    'Услуга: '+a.service+nl+
    (a.price ? 'Стоимость: '+Math.round(a.price).toLocaleString('ru-RU')+' руб.'+nl : '')+
    'Мастер: '+(sess.name||'Мастер')+nl+
    'Ждём вас!'
  );
}

function sendApptWhatsApp(){
  var phone = (document.getElementById('apptPhone')||{}).value||'';
  var client = (document.getElementById('apptClient')||{}).value||'';
  var service = (document.getElementById('apptService')||{}).value||'';
  var date = (document.getElementById('apptDate')||{}).value||'';
  var time = (document.getElementById('apptTime')||{}).value||'';
  var price = (document.getElementById('apptPrice')||{}).value||'';
  var phoneClean = phone.replace(/\D/g,'');
  if(!phoneClean){ toast('Введи телефон клиента','error'); return; }
  var msg = buildApptMessage({client:client,service:service,date:date,time:time,price:price});
  window.open('https://wa.me/'+phoneClean+'?text='+msg,'_blank');
}

function sendApptMax(){
  var phone = (document.getElementById('apptPhone')||{}).value||'';
  var client = (document.getElementById('apptClient')||{}).value||'';
  var service = (document.getElementById('apptService')||{}).value||'';
  var date = (document.getElementById('apptDate')||{}).value||'';
  var time = (document.getElementById('apptTime')||{}).value||'';
  var price = (document.getElementById('apptPrice')||{}).value||'';
  var phoneClean = phone.replace(/\D/g,'');
  if(!phoneClean){ toast('Введи телефон клиента','error'); return; }
  var msg = buildApptMessage({client:client,service:service,date:date,time:time,price:price});
  window.open('https://max.ru/chat/'+phoneClean+'?text='+msg,'_blank');
}

// After save appt — show notify panel
(function(){
  var saveBtn = document.getElementById('saveAppt');
  if(!saveBtn) return;
  var origOnclick = saveBtn.onclick;
  saveBtn.addEventListener('click', function(){
    setTimeout(function(){
      var phone = (document.getElementById('apptPhone')||{}).value||'';
      var panel = document.getElementById('notifyPanel');
      if(panel && phone.trim().length > 5){
        panel.style.display = 'block';
        var phoneClean = phone.replace(/\D/g,'');
        var client = (document.getElementById('apptClient')||{}).value||'';
        var service = (document.getElementById('apptService')||{}).value||'';
        var date = (document.getElementById('apptDate')||{}).value||'';
        var time = (document.getElementById('apptTime')||{}).value||'';
        var price = (document.getElementById('apptPrice')||{}).value||'';
        var msg = buildApptMessage({client:client,service:service,date:date,time:time,price:price});
        var waBtn = document.getElementById('notifyWaBtn');
        var maxBtn = document.getElementById('notifyMaxBtn');
        if(waBtn) waBtn.onclick = function(){ window.open('https://wa.me/'+phoneClean+'?text='+msg,'_blank'); };
        if(maxBtn) maxBtn.onclick = function(){ window.open('https://max.ru/chat/'+phoneClean+'?text='+msg,'_blank'); };
      }
    }, 300);
  });
})();

// toggleDay for booking settings
function toggleDay(btn){
  btn.classList.toggle('active');
  var s = getBookingSettings();
  var day = parseInt(btn.dataset.day);
  var idx = s.workDays.indexOf(day);
  if(idx>-1) s.workDays.splice(idx,1);
  else s.workDays.push(day);
  s.workDays.sort();
  saveBookingSettingsData(s);
}

// ════════════════════════════════════════════
// MOBILE NAVIGATION
// ════════════════════════════════════════════
function isMobile(){return window.innerWidth<=860}


// ── Floating page help button ──────────────────────────────────────────────
var PAGE_HELP_MAP = {
  'dashboard':'dashboard','finances':'finances','capital':'capital',
  'calendar':'calendar','clients':'clients','booking':'booking',
  'hour':'hour','owner':'owner','pulse':'pulse','blog':'blog','settings':'settings'
};

function updatePageHelpFab(page){
  var fab = document.getElementById('pageHelpFab');
  if(!fab) return;
  var key = PAGE_HELP_MAP[page];
  if(key && HELP_CONTENT && HELP_CONTENT[key]){
    fab.style.display = 'flex';
    fab.dataset.helpKey = key;
  } else {
    fab.style.display = 'none';
  }
}

function openPageHelp(){
  var fab = document.getElementById('pageHelpFab');
  if(!fab) return;
  var key = fab.dataset.helpKey;
  if(key && typeof openHelp === 'function') openHelp(key);
}

function navigateTo(pg){
  // Hide all pages
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  // Show target
  const pageEl=document.getElementById('page-'+pg);
  if(pageEl)pageEl.classList.add('active');

  // Update sidebar nav (desktop)
  document.querySelectorAll('.nav-item[data-page]').forEach(b=>{
    b.classList.toggle('active',b.dataset.page===pg);
  });
  // Update mobile bottom nav
  document.querySelectorAll('.mob-nav-btn[data-page]').forEach(b=>{
    b.classList.toggle('active',b.dataset.page===pg);
  });

  // Page title
  const titles={dashboard:'Обзор',finances:'Финансы',capital:'Капитал',
    calendar:'Записи',settings:'Настройки',hour:'Цена часа',
    owner:'Зарплата владельца',pulse:'Финансовый пульс',blog:'Блог'};
  const titleEl=document.getElementById('pageTitle');
  if(titleEl)titleEl.textContent=titles[pg]||pg;

  // Render logic
  if(pg==='calendar')renderCalendar();
  if(pg==='capital')renderCapital();
  if(pg==='dashboard')renderDashboard();
  if(pg==='settings')loadSettings();
  if(pg==='finances'){renderFinances();updateCapitalRing();}
  if(pg==='hour'){document.getElementById('hlDate').value=new Date().toISOString().split('T')[0];renderHourPage();}
  if(pg==='owner')renderOwnerPage();
  if(pg==='pulse')renderPulsePage();
  if(pg==='blog')renderBlogPage();

  // Scroll to top
  const main=document.querySelector('.main');
  if(main)main.scrollTop=0;
}

// Wire mobile bottom nav
document.querySelectorAll('.mob-nav-btn').forEach(btn=>{
  btn.onclick=function(){
    const pg=this.dataset.page;
    if(pg==='more'){openMoreDrawer();return}
    navigateTo(pg);
  };
});

// Wire desktop sidebar nav (override previous handler)
document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  btn.onclick=function(){navigateTo(this.dataset.page)};
});

// Wire more-drawer items
document.querySelectorAll('.more-item[data-page]').forEach(btn=>{
  btn.onclick=function(){
    closeMoreDrawer();
    navigateTo(this.dataset.page);
    // show active on bottom nav "more" button
    document.querySelectorAll('.mob-nav-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.mob-nav-btn[data-page="more"]')?.classList.add('active');
  };
});

function openMoreDrawer(){
  document.getElementById('moreDrawer').style.display='block';
  requestAnimationFrame(()=>{
    document.getElementById('morePanel').style.transform='translateY(0)';
  });
}
function closeMoreDrawer(e){
  if(e&&e.target!==document.getElementById('moreDrawer'))return;
  document.getElementById('moreDrawer').style.display='none';
}
document.getElementById('quickEntryBtn')?.addEventListener('click',()=>{
  navigateTo('finances');
  setTimeout(()=>document.getElementById('qeAmount')?.focus(),150);
});
document.getElementById('addApptBtn')?.addEventListener('click',()=>{
  navigateTo('calendar');
  setTimeout(()=>document.getElementById('apptClient')?.focus(),150);
});

// ════════════════════════════════════════════
// MODULE: БЛОГ
// ════════════════════════════════════════════
function focusComposer(){const el=document.getElementById('postTitleInput');if(el)el.focus();}
function getBlogPosts(){return load('km_blog',[])}
function saveBlogPosts(d){store('km_blog',d)}
const AVATAR_COLORS=['#0D6E4A','#2471A3','#7D3C98','#B8975A','#C0392B','#1A5276','#117864','#6E2F0D'];
function avatarColor(str){let h=0;for(let c of(str||'M'))h=(h<<5)-h+c.charCodeAt(0);return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]}
function initials(name){return(name||'М').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
let selectedTag='',blogFilter='all',blogSearch='';
const expandedPosts=new Set();

document.querySelectorAll('.tag-pill').forEach(btn=>{
  btn.onclick=function(){
    document.querySelectorAll('.tag-pill').forEach(b=>b.classList.remove('sel'));
    if(selectedTag===this.dataset.tag){selectedTag=''}else{this.classList.add('sel');selectedTag=this.dataset.tag}
  };
});
document.querySelectorAll('.ftag-btn').forEach(btn=>{
  btn.onclick=function(){
    document.querySelectorAll('.ftag-btn').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');blogFilter=this.dataset.filter;renderBlogFeed();
  };
});
document.getElementById('blogSearch').oninput=function(){blogSearch=this.value.toLowerCase().trim();renderBlogFeed()};
document.getElementById('publishPost').onclick=function(){
  const title=document.getElementById('postTitleInput').value.trim();
  const body=document.getElementById('postBodyInput').value.trim();
  if(!title){toast('Добавь заголовок','error');return}
  if(body.length<20){toast('Напиши хотя бы несколько предложений','error');return}
  const sess=load('km_session',{});
  const post={id:uid(),authorId:sess.id||'anon',authorName:sess.name||'Мастер',authorProf:sess.prof||'Специалист',title,body,tag:selectedTag||'Опыт',date:new Date().toISOString(),likes:[],comments:[],views:0};
  const posts=getBlogPosts();posts.unshift(post);saveBlogPosts(posts);
  document.getElementById('postTitleInput').value='';
  document.getElementById('postBodyInput').value='';
  document.querySelectorAll('.tag-pill').forEach(b=>b.classList.remove('sel'));
  selectedTag='';toast('Публикация опубликована ✓');renderBlogFeed();
};
function fmtPostDate(iso){
  const d=new Date(iso),n=new Date(),diff=Math.floor((n-d)/1000);
  if(diff<60)return'только что';if(diff<3600)return Math.floor(diff/60)+' мин. назад';
  if(diff<86400)return Math.floor(diff/3600)+' ч. назад';if(diff<604800)return Math.floor(diff/86400)+' дн. назад';
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
}
const TAG_COLORS={'Опыт':'rgba(13,110,74,0.12)|color:#0D6E4A','Инсайт':'rgba(36,113,163,0.12)|color:#2471A3','Цена часа':'rgba(184,151,90,0.15)|color:#8A6A1A','Капитал':'rgba(125,60,152,0.12)|color:#7D3C98','Клиенты':'rgba(192,57,43,0.1)|color:#C0392B','Мышление':'rgba(13,196,126,0.12)|color:#0D6E4A','Победа':'rgba(212,175,112,0.18)|color:#8A6A1A'};
function tagBg(tag){return(TAG_COLORS[tag]||'rgba(100,100,100,0.1)|color:#555').split('|')[0]}
function tagClr(tag){return(TAG_COLORS[tag]||'rgba(100,100,100,0.1)|color:#555').split('|')[1]}
function renderBlogFeed(){
  const sess=load('km_session',{});
  let posts=getBlogPosts();
  if(blogFilter!=='all')posts=posts.filter(p=>p.tag===blogFilter);
  if(blogSearch)posts=posts.filter(p=>(p.title+p.body+(p.authorName||'')).toLowerCase().includes(blogSearch));
  const all=getBlogPosts();
  document.getElementById('blogPostCount').innerHTML=all.length+'<span>+</span>';
  document.getElementById('blogAuthorCount').innerHTML=new Set(all.map(p=>p.authorId)).size+'<span>+</span>';
  const feedEl=document.getElementById('blogFeed');
  if(!posts.length){
    feedEl.innerHTML='<div class="blog-empty"><div class="blog-empty-icon">✐</div><div class="blog-empty-text">Пока нет публикаций'+(blogFilter!=='all'?' в этой категории':'')+'</div><button class="publish-btn" onclick="focusComposer()">Написать первым →</button></div>';
    renderBlogSidebar();return;
  }
  feedEl.innerHTML=posts.map(function(post){
    var isLiked=(post.likes||[]).includes(sess.id);
    var isExp=expandedPosts.has(post.id);
    var short=post.body.length>220&&!isExp;
    var cc=(post.comments||[]).length;
    var bodyHtml=post.body.split('\n').join('<br>');
    var titleSafe=post.title.replace(/</g,'&lt;');
    var commHtml=(post.comments||[]).map(function(c){
      return '<div class="comment-item"><div class="comment-avatar" style="background:'+avatarColor(c.authorName)+'">'+initials(c.authorName)+'</div><div class="comment-bubble"><div class="comment-author">'+c.authorName+' <span style="font-weight:300;color:var(--muted);font-size:0.72rem">· '+fmtPostDate(c.date)+'</span></div><div class="comment-text">'+c.text+'</div></div></div>';
    }).join('');
    var delBtn=post.authorId===sess.id?'<button class="post-action" onclick="doDeletePost(\''+post.id+'\')" style="margin-left:auto;color:var(--border)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path></svg> Удалить</button>':'';
    var readMoreBtn=short?'<button class="post-read-more" onclick="toggleExp(\''+post.id+'\')">Читать далее →</button>':'';
    var likedFill=isLiked?'currentColor':'none';
    var likedCls=isLiked?' liked':'';
    var shortCls=short?' collapsed':'';
    return '<div class="post-card" id="pc-'+post.id+'">'+
      '<div class="post-meta">'+
        '<div class="post-avatar" style="background:'+avatarColor(post.authorName)+'">'+initials(post.authorName)+'</div>'+
        '<div><div class="post-author">'+post.authorName+'</div><div class="post-date">'+fmtPostDate(post.date)+'</div></div>'+
        '<div class="post-prof">'+(post.authorProf||'')+'</div>'+
        '<span class="post-tag-badge" style="background:'+tagBg(post.tag)+';'+tagClr(post.tag)+'">'+post.tag+'</span>'+
      '</div>'+
      '<div class="post-title" onclick="toggleExp(\''+post.id+'\')">'+titleSafe+'</div>'+
      '<div class="post-body'+shortCls+'">'+bodyHtml+'</div>'+
      '<div class="post-footer">'+
        '<button class="post-action'+likedCls+'" onclick="doLike(\''+post.id+'\')">'+
          '<svg viewBox="0 0 24 24" fill="'+likedFill+'" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> '+
          (post.likes||[]).length+' лайков</button>'+
        '<button class="post-action" onclick="doToggleComments(\''+post.id+'\')">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> '+
          cc+' комментариев</button>'+
        delBtn+readMoreBtn+
      '</div></div>'+
      '<div class="post-comments" id="cmt-'+post.id+'">'+
        '<div class="comment-list">'+commHtml+'</div>'+
        '<div class="comment-form">'+
          '<div class="comment-avatar" style="background:'+avatarColor(sess.name||'М')+'">'+initials(sess.name||'М')+'</div>'+
          '<input class="comment-input" id="ci-'+post.id+'" placeholder="Добавь комментарий..." onkeydown="if(event.key===\'Enter\')doComment(\''+post.id+'\')">'+
          '<button class="comment-submit" onclick="doComment(\''+post.id+'\')">→</button>'+
        '</div></div>';
  }).join('');
  renderBlogSidebar();
}
function toggleExp(id){if(expandedPosts.has(id))expandedPosts.delete(id);else expandedPosts.add(id);renderBlogFeed()}
function doLike(id){
  const sess=load('km_session',{});
  const posts=getBlogPosts();const p=posts.find(x=>x.id===id);if(!p)return;
  if(!p.likes)p.likes=[];const i=p.likes.indexOf(sess.id);
  if(i>-1)p.likes.splice(i,1);else p.likes.push(sess.id);
  saveBlogPosts(posts);renderBlogFeed();
}
function doToggleComments(id){const el=document.getElementById('cmt-'+id);if(el){el.classList.toggle('open');if(el.classList.contains('open'))document.getElementById('ci-'+id)?.focus()}}
function doComment(id){
  const inp=document.getElementById('ci-'+id);const text=inp?.value.trim();
  if(!text){toast('Напиши комментарий','error');return}
  const sess=load('km_session',{});const posts=getBlogPosts();const p=posts.find(x=>x.id===id);if(!p)return;
  if(!p.comments)p.comments=[];
  p.comments.push({id:uid(),authorId:sess.id||'anon',authorName:sess.name||'Мастер',text,date:new Date().toISOString()});
  saveBlogPosts(posts);inp.value='';toast('Комментарий добавлен');
  renderBlogFeed();setTimeout(()=>{const el=document.getElementById('cmt-'+id);if(el)el.classList.add('open')},50);
}
function doDeletePost(id){if(!confirm('Удалить публикацию?'))return;saveBlogPosts(getBlogPosts().filter(p=>p.id!==id));toast('Удалено');renderBlogFeed()}
function renderBlogSidebar(){
  const posts=getBlogPosts();
  const top=[...posts].sort((a,b)=>(b.likes||[]).length-(a.likes||[]).length).slice(0,5);
  document.getElementById('blogTopPosts').innerHTML=top.length?top.map(p=>`<div class="top-post-item" onclick="toggleExp('${p.id}');renderBlogFeed()"><div class="tp-title">${p.title}</div><div class="tp-meta">❤ ${(p.likes||[]).length} · ${p.tag} · ${fmtPostDate(p.date)}</div></div>`).join(''):'<div style="font-size:0.85rem;color:var(--muted)">Пока нет публикаций</div>';
  const tc=posts.reduce((a,p)=>a+(p.comments||[]).length,0);
  const tl=posts.reduce((a,p)=>a+(p.likes||[]).length,0);
  document.getElementById('bStatPosts').textContent=posts.length;
  document.getElementById('bStatComments').textContent=tc;
  document.getElementById('bStatAuthors').textContent=new Set(posts.map(p=>p.authorId)).size;
  document.getElementById('bStatLikes').textContent=tl;
}
function seedBlog(){
  if(getBlogPosts().length>0)return;
  var d0=Date.now();
  var nl='\\n';
  var demo=[
    {id:uid(),authorId:'d1',authorName:'Анна К.',authorProf:'Визажист',
     title:'Как я подняла цену вдвое и не потеряла клиентов',
     body:'Три месяца назад я боялась поднять цену даже на 500 рублей. Казалось, все уйдут. Сделала это — ушли двое. Пришли пятеро новых с бюджетом выше. Выручка за месяц выросла на 40%.'+nl+nl+'Главный сдвиг: я начала думать о трансформации, которую даю клиенту, а не о часах работы. Теперь я продаю результат, а не время.',
     tag:'Победа',date:new Date(d0-86400000*2).toISOString(),
     likes:['d2','d3','d4'],
     comments:[{id:uid(),authorId:'d2',authorName:'Мария П.',text:'Анна, это вдохновляет! Как ты психологически готовилась?',date:new Date(d0-86400000).toISOString()}],
     views:0},
    {id:uid(),authorId:'d2',authorName:'Максим С.',authorProf:'Барбер',
     title:'Мой первый месяц с правилом 50/30/20',
     body:'Раньше деньги просто исчезали. Хороший месяц — спускал всё. Плохой — занимал.'+nl+nl+'Попробовал систему: 50% на жизнь, 30% на развитие, 20% в капитал. Первый месяц — положил 18 000 рублей на накопительный счёт. Это первые деньги за 4 года работы, которые не потратил сразу.'+nl+nl+'Чувство безопасности изменилось.',
     tag:'Опыт',date:new Date(d0-86400000*5).toISOString(),
     likes:['d1','d3'],comments:[],views:0},
    {id:uid(),authorId:'d3',authorName:'Елена В.',authorProf:'Маникюрист',
     title:'Инсайт: моя цена часа была ниже уборщицы',
     body:'Записала все рабочие часы за месяц. Получилось 220 часов. При заработке 90 000 рублей — это 409 рублей в час.'+nl+nl+'Минимальная ставка уборщицы в Москве — выше.'+nl+nl+'Это был шок. Начала считать стоимость часа, а не количество клиентов. Цель на этот год — 1500 рублей в час. Уже на 800.',
     tag:'Цена часа',date:new Date(d0-86400000*8).toISOString(),
     likes:['d1','d2','d4'],
     comments:[{id:uid(),authorId:'d4',authorName:'Ольга Н.',text:'Именно этот инсайт перевернул и моё мышление. Считать надо часы!',date:new Date(d0-86400000*7).toISOString()}],
     views:0}
  ];
  saveBlogPosts(demo);
}
function renderBlogPage(){
  seedBlog();
  const sess=load('km_session',{});
  const av=document.getElementById('composerAvatar');
  if(av){av.textContent=initials(sess.name||'М');av.style.background=avatarColor(sess.name||'М')}
  renderBlogFeed();
}

// ════════════════════════════════════════════
// MODULE: ЦЕНА ЧАСА
// ════════════════════════════════════════════
function getHourLogs(){return load('km_hour_logs',[])}
function saveHourLogs(d){store('km_hour_logs',d)}

document.getElementById('hlDate').value = new Date().toISOString().split('T')[0];

document.getElementById('addHourLog').onclick = function(){
  const date = document.getElementById('hlDate').value;
  const earned = parseFloat(document.getElementById('hlEarned').value)||0;
  const hours = parseFloat(document.getElementById('hlHours').value)||8;
  if(!earned){toast('Введи сумму заработка','error');return}
  const logs = getHourLogs();
  logs.unshift({id:uid(), date, earned, hours, rph: Math.round(earned/hours)});
  saveHourLogs(logs);
  document.getElementById('hlEarned').value='';
  document.getElementById('hlHours').value='';
  toast('День записан — ₽'+Math.round(earned/hours)+'/час');
  renderHourPage();
};

function renderHourPage(){
  const logs = getHourLogs();

  // KPI
  const latest = logs[0];
  const todayRph = latest ? latest.rph : 0;
  document.getElementById('hourToday').innerHTML = fmt(todayRph)+'<span> ₽</span>';

  const month30 = logs.filter(l=>{const d=new Date(l.date);const n=new Date();return (n-d)/(1000*60*60*24)<=30});
  const avgRph = month30.length ? Math.round(month30.reduce((a,l)=>a+l.rph,0)/month30.length) : 0;
  document.getElementById('hourAvg').innerHTML = fmt(avgRph)+'<span> ₽</span>';

  if(month30.length>1){
    const first = month30[month30.length-1].rph;
    const last = month30[0].rph;
    const growth = Math.round(((last-first)/first)*100);
    document.getElementById('hourGrowth').innerHTML = (growth>=0?'+':'')+growth+'<span>%</span>';
    document.getElementById('hourTodayChange').textContent = growth>=0?'↑ растёт — ты на верном пути':'↓ просел — время поднять цену';
    document.getElementById('hourTodayChange').className = 'hour-stat-change '+(growth>=0?'up':'down');
  }

  // History table
  const histEl = document.getElementById('hourHistory');
  if(!logs.length){
    histEl.innerHTML='<div class="empty"><div class="empty-icon">◑</div><div class="empty-text">Запиши первый рабочий день</div></div>';
  } else {
    histEl.innerHTML = logs.slice(0,10).map(l=>`
      <div class="hour-row">
        <span class="hour-row-date">${l.date.slice(5).replace('-','.')}</span>
        <span class="hour-row-desc">Рабочий день</span>
        <span class="hour-row-hours">${l.hours} ч</span>
        <span class="hour-row-val">${fmt(l.rph)} ₽/ч</span>
        <button style="background:none;border:none;color:var(--border);cursor:pointer;font-size:1rem" onclick="deleteHourLog('${l.id}')">×</button>
      </div>`).join('');
  }

  // Growth chart
  const chartLogs = [...logs].reverse().slice(-8);
  const maxRph = Math.max(...chartLogs.map(l=>l.rph),1);
  document.getElementById('hourGrowthChart').innerHTML = chartLogs.map(l=>{
    const h = Math.max((l.rph/maxRph)*88,4);
    return `<div class="g-bar-wrap">
      <div class="g-bar-amount">${Math.round(l.rph/1000)}k</div>
      <div class="g-bar" style="height:${h}px"></div>
      <div class="g-bar-label">${l.date.slice(5).replace('-','.')}</div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:0.85rem;padding:20px">Нет данных</div>';

  // Insight
  const insightEl = document.getElementById('hourInsight');
  if(!logs.length){
    insightEl.innerHTML='<div class="salary-insight"><p>Запиши <strong>3 рабочих дня</strong> — и я покажу динамику цены твоего часа и инсайты о росте.</p></div>';
  } else {
    const target = avgRph * 2;
    const years = avgRph > 0 ? Math.round((target / avgRph - 1) / 0.05) : 0;
    const insight = avgRph < 1000
      ? `Твой час стоит <strong>${fmt(avgRph)} ₽</strong>. Это ниже рыночного уровня для твоей профессии. Подъём цены на 20% = +${fmt(avgRph*0.2*8)} ₽ в день при тех же 8 часах.`
      : avgRph < 3000
      ? `Хорошая точка старта — <strong>${fmt(avgRph)} ₽/час</strong>. Мастер с мышлением предпринимателя удваивает эту цифру за 12–18 месяцев.`
      : `<strong>${fmt(avgRph)} ₽/час</strong> — ты уже выше среднего. Фокус сейчас: перейти от продажи времени к продаже трансформации.`;
    insightEl.innerHTML = `<div class="salary-insight"><p>${insight}</p></div>
    <div style="margin-top:16px;padding:16px;background:var(--cream2)">
      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Цель × 2 от сегодня</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:2rem;color:var(--em)">${fmt(target)} ₽/час</div>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:4px">При росте 5% в месяц — примерно ${years} мес.</div>
    </div>`;
  }
}

function deleteHourLog(id){
  saveHourLogs(getHourLogs().filter(l=>l.id!==id));
  renderHourPage();
  toast('Запись удалена');
}

// ════════════════════════════════════════════
// MODULE: ЗАРПЛАТА ВЛАДЕЛЬЦА
// ════════════════════════════════════════════
function renderOwnerPage(){
  const txs = getTx();
  const monthTx = txs.filter(t=>thisMonth(t.date));
  const revenue = monthTx.filter(t=>t.type==='income'&&t.segment==='business').reduce((a,t)=>a+t.amount,0);
  const expenses = monthTx.filter(t=>t.type==='expense'&&t.segment==='business').reduce((a,t)=>a+t.amount,0);
  const s = getSettings();
  const salary = s.ownerSalary || 0;
  const taxRate = s.taxRate || 6;
  const tax = revenue * taxRate / 100;
  const profit = revenue - expenses - salary - tax;

  document.getElementById('owRevenue').value = revenue || '';
  document.getElementById('owExpenses').value = expenses || '';
  document.getElementById('owSalary').value = salary || '';
  document.getElementById('owTax').value = taxRate;
  document.getElementById('ownerProfitVal').innerHTML = fmt(Math.max(profit,0))+'<span> ₽</span>';

  renderOwnerFlow(revenue, expenses, salary, tax, profit);
  renderOwnerInsight(revenue, expenses, salary, tax, profit);
  renderTaxCalc(revenue, taxRate);
}

function renderOwnerFlow(revenue, expenses, salary, tax, profit){
  document.getElementById('ownerFlow').innerHTML = `
    <div class="flow-row">
      <div><div class="flow-label">Выручка бизнеса</div><div class="flow-sublabel">Всё что пришло от клиентов</div></div>
      <div class="flow-val rev">+${fmt(revenue)} ₽</div>
    </div>
    <div class="flow-row">
      <div><div class="flow-label">Расходы бизнеса</div><div class="flow-sublabel">Материалы, аренда, реклама</div></div>
      <div class="flow-val exp">−${fmt(expenses)} ₽</div>
    </div>
    <div class="flow-row">
      <div><div class="flow-label">Твоя зарплата</div><div class="flow-sublabel">Ты — сотрудник своего бизнеса</div></div>
      <div class="flow-val sal">−${fmt(salary)} ₽</div>
    </div>
    <div class="flow-row">
      <div><div class="flow-label">Налог</div><div class="flow-sublabel">Честно отложено для ФНС</div></div>
      <div class="flow-val exp">−${fmt(Math.round(tax))} ₽</div>
    </div>
    <div class="flow-row" style="background:var(--cream2);margin:0 -0px;padding:14px 0">
      <div><div class="flow-label" style="font-weight:600">Прибыль бизнеса</div><div class="flow-sublabel">Реинвестируй или отложи в капитал</div></div>
      <div class="flow-val pro" style="${profit<0?'color:var(--red)':''}">${profit>=0?'+':''}${fmt(profit)} ₽</div>
    </div>`;
}

function renderTaxCalc(revenue, taxRate){
  const tax = Math.round(revenue * taxRate / 100);
  const monthly = Math.round(tax);
  document.getElementById('taxCalcResult').innerHTML = `
    <div class="oib-row" style="border-color:var(--cream2)">
      <span class="flow-label">Выручка</span>
      <span class="flow-val" style="font-size:1rem;color:var(--ink)">${fmt(revenue)} ₽</span>
    </div>
    <div class="oib-row" style="border-color:var(--cream2)">
      <span class="flow-label">Ставка</span>
      <span class="flow-val" style="font-size:1rem;color:var(--ink)">${taxRate}%</span>
    </div>
    <div class="oib-row" style="border-color:var(--cream2)">
      <span class="flow-label" style="font-weight:600">Отложи сейчас</span>
      <span style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:500;color:var(--red)">${fmt(monthly)} ₽</span>
    </div>
    <div style="font-size:0.78rem;color:var(--muted);margin-top:12px;line-height:1.6">Откладывай ${taxRate}% с каждого поступления сразу — тогда налог не будет сюрпризом.</div>`;
}

function renderOwnerInsight(revenue, expenses, salary, tax, profit){
  const margin = revenue > 0 ? Math.round((profit/revenue)*100) : 0;
  const salaryRatio = revenue > 0 ? Math.round((salary/revenue)*100) : 0;
  const expRatio = revenue > 0 ? Math.round((expenses/revenue)*100) : 0;
  const isHealthy = profit > 0 && salaryRatio >= 30 && salaryRatio <= 60;

  document.getElementById('ownerInsightRows').innerHTML = `
    <div class="oib-row">
      <span class="oib-label">Маржинальность бизнеса</span>
      <span class="oib-val ${margin>20?'highlight':''}">${margin}% <span class="roi-tag ${margin>15?'pos':'neg'}">${margin>20?'отлично':margin>10?'норма':'мало'}</span></span>
    </div>
    <div class="oib-row">
      <span class="oib-label">Зарплата от выручки</span>
      <span class="oib-val">${salaryRatio}% <span class="roi-tag ${salaryRatio>=30&&salaryRatio<=60?'pos':'neg'}">${salaryRatio<30?'мало платишь себе':salaryRatio>60?'много':'норма'}</span></span>
    </div>
    <div class="oib-row">
      <span class="oib-label">Расходы от выручки</span>
      <span class="oib-val">${expRatio}% <span class="roi-tag ${expRatio<40?'pos':'neg'}">${expRatio>60?'слишком много':expRatio>40?'контролируй':'хорошо'}</span></span>
    </div>
    <div class="oib-row">
      <span class="oib-label">Статус бизнеса</span>
      <span class="oib-val ${isHealthy?'highlight':''}">${
        profit < 0 ? '🔴 Бизнес убыточен' :
        salary === 0 ? '🟡 Нет зарплаты владельца' :
        isHealthy ? '🟢 Здоровый бизнес' : '🟡 Требует балансировки'
      }</span>
    </div>
    <div class="oib-row">
      <span class="oib-label">Совет</span>
      <span class="oib-val" style="font-size:0.85rem;color:rgba(255,255,255,0.6);max-width:280px;text-align:right;line-height:1.5">${
        profit < 0 ? 'Срочно снизь расходы или подними цены на 15–20%' :
        salary === 0 ? 'Назначь себе фиксированную зарплату — это меняет всё' :
        margin < 10 ? 'Маржа низкая — проверь скрытые расходы и подними прайс' :
        '✦ Продолжай — реинвестируй прибыль в активы'
      }</span>
    </div>`;
}

document.getElementById('calcOwner').onclick = function(){
  const revenue = parseFloat(document.getElementById('owRevenue').value)||0;
  const expenses = parseFloat(document.getElementById('owExpenses').value)||0;
  const salary = parseFloat(document.getElementById('owSalary').value)||0;
  const taxRate = parseFloat(document.getElementById('owTax').value)||6;
  const tax = revenue * taxRate / 100;
  const profit = revenue - expenses - salary - tax;

  const s = getSettings();
  s.ownerSalary = salary; s.taxRate = taxRate; saveSettings(s);
  document.getElementById('ownerProfitVal').innerHTML = fmt(Math.max(profit,0))+'<span> ₽</span>';
  renderOwnerFlow(revenue, expenses, salary, tax, profit);
  renderOwnerInsight(revenue, expenses, salary, tax, profit);
  renderTaxCalc(revenue, taxRate);
  toast('Расчёт обновлён');
};

// ════════════════════════════════════════════
// MODULE: ФИНАНСОВЫЙ ПУЛЬС
// ════════════════════════════════════════════
const HABITS_DEFAULT = [
  {id:'h1', text:'Записал все доходы и расходы', emoji:'💰'},
  {id:'h2', text:'Перевёл 20% в капитал', emoji:'📈'},
  {id:'h3', text:'Проверил баланс счетов', emoji:'👁️'},
  {id:'h4', text:'Заплатил себе зарплату', emoji:'🎯'},
  {id:'h5', text:'Не сделал импульсивную покупку', emoji:'🛑'},
  {id:'h6', text:'Почитал/посмотрел что-то о финансах', emoji:'📚'},
];
const DIARY_PROMPTS = [
  'Что меня сдерживает от подъёма цен?',
  'Когда я последний раз вложил деньги в своё развитие?',
  'Что бы я купил если бы у меня было 1 000 000 ₽?',
  'Почему деньги иногда вызывают у меня тревогу?',
  'Что я сделал сегодня, чтобы стать богаче?',
  'Какая моя самая умная трата за последний месяц?',
  'Чему меня научил этот месяц в финансах?',
  'Какую финансовую привычку я хочу выработать?',
];

function getPulseData(){return load('km_pulse',{answers:{},history:[],streak:0,lastWeek:'',habits:{},diary:[]})}
function savePulseData(d){store('km_pulse',d)}

const pulseAnswers = {salary:null, invest:null, passive:null};

document.querySelectorAll('.q-option').forEach(btn=>{
  btn.onclick = function(){
    const q = this.dataset.q;
    const val = parseInt(this.dataset.val);
    document.querySelectorAll(`.q-option[data-q="${q}"]`).forEach(b=>b.classList.remove('selected'));
    this.classList.add('selected');
    pulseAnswers[q] = val;
  };
});

document.getElementById('submitPulse').onclick = function(){
  if(pulseAnswers.salary===null||pulseAnswers.invest===null||pulseAnswers.passive===null){
    toast('Ответь на все 3 вопроса','error'); return;
  }
  const score = pulseAnswers.salary + pulseAnswers.invest + pulseAnswers.passive;
  const pdata = getPulseData();
  const weekKey = getWeekKey();

  if(pdata.lastWeek === weekKey){
    pdata.streak = (pdata.streak||0) + (pdata.streak===0?1:0);
  } else if(isLastWeek(pdata.lastWeek)){
    pdata.streak = (pdata.streak||0) + 1;
  } else {
    pdata.streak = 1;
  }
  pdata.lastWeek = weekKey;
  pdata.history.unshift({week:weekKey, score, answers:{...pulseAnswers}, date: new Date().toLocaleDateString('ru-RU')});
  savePulseData(pdata);
  document.getElementById('streakNum').textContent = pdata.streak;

  const levels = [
    {min:0,max:1,title:'Финансовый сон',icon:'😴',text:'Деньги управляют тобой, а не наоборот. Это честный ответ — и это первый шаг. Начни с одного: назначь себе зарплату на следующей неделе.'},
    {min:2,max:3,title:'Пробуждение',icon:'⚡',text:'Ты начинаешь думать как предприниматель. Есть правильные шаги, но ещё не система. Выбери один пункт и сделай его привычкой за 21 день.'},
    {min:4,max:5,title:'Мышление инвестора',icon:'🚀',text:'Ты уже мыслишь как состоятельный мастер. Деньги работают на тебя. Следующий уровень — автоматизировать всё это, чтобы не думать каждый раз.'},
    {min:6,max:6,title:'Мышление миллионера',icon:'💎',text:'Идеальная неделя. Ты платишь себе зарплату, инвестируешь и приумножаешь. Таких людей — единицы. Продолжай эту серию.'},
  ];
  const level = levels.find(l=>score>=l.min&&score<=l.max);
  document.getElementById('pulseScoreCircle').textContent = score+'/6';
  document.getElementById('pulseScoreTitle').textContent = level.icon+' '+level.title;
  document.getElementById('pulseResultTitle').textContent = level.title;
  document.getElementById('pulseResultText').textContent = level.text;
  document.getElementById('pulseResult').classList.add('show');
  renderPulseHistory();
};

function getWeekKey(){const d=new Date();const jan1=new Date(d.getFullYear(),0,1);return d.getFullYear()+'-W'+Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7)}
function isLastWeek(k){if(!k)return false;const d=new Date();d.setDate(d.getDate()-7);const jan1=new Date(d.getFullYear(),0,1);const lw=d.getFullYear()+'-W'+Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7);return k===lw}

function renderPulsePage(){
  const pdata = getPulseData();
  document.getElementById('streakNum').textContent = pdata.streak||0;
  const now = new Date();
  document.getElementById('pulseWeekLabel').textContent = 'неделя '+now.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});

  // Diary prompt
  document.getElementById('diaryPrompt').textContent = '💭 ' + DIARY_PROMPTS[Math.floor(Math.random()*DIARY_PROMPTS.length)];

  // Habit tracker
  const today = new Date().toISOString().split('T')[0];
  const todayHabits = pdata.habits[today]||{};
  document.getElementById('habitTracker').innerHTML = HABITS_DEFAULT.map(h=>`
    <div class="habit-item">
      <div class="habit-check ${todayHabits[h.id]?'done':''}" onclick="toggleHabit('${h.id}','${today}')">
        ${todayHabits[h.id]?'✓':''}
      </div>
      <div style="flex:1">
        <div class="habit-text">${h.emoji} ${h.text}</div>
      </div>
    </div>`).join('');

  // Diary entries
  renderDiary();
  renderPulseHistory();
}

function toggleHabit(hid, today){
  const pdata = getPulseData();
  if(!pdata.habits[today]) pdata.habits[today]={};
  pdata.habits[today][hid] = !pdata.habits[today][hid];
  savePulseData(pdata);
  const done = Object.values(pdata.habits[today]).filter(Boolean).length;
  if(done===HABITS_DEFAULT.length) toast('🎯 Все привычки выполнены сегодня!');
  renderPulsePage();
}

document.getElementById('saveDiary').onclick = function(){
  const text = document.getElementById('diaryText').value.trim();
  if(!text){toast('Напиши хоть пару строк','error');return}
  const pdata = getPulseData();
  pdata.diary.unshift({id:uid(), date: new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}), text});
  if(pdata.diary.length>20) pdata.diary.pop();
  savePulseData(pdata);
  document.getElementById('diaryText').value='';
  renderDiary();
  toast('Запись сохранена ✓');
};

function renderDiary(){
  const entries = getPulseData().diary||[];
  const el = document.getElementById('diaryEntries');
  if(!entries.length){el.innerHTML='<div class="empty"><div class="empty-icon">📓</div><div class="empty-text">Начни вести финансовый дневник</div></div>';return}
  el.innerHTML = entries.slice(0,5).map(e=>`
    <div class="diary-entry">
      <div class="diary-entry-date">${e.date}</div>
      <div class="diary-entry-text">${e.text}</div>
    </div>`).join('');
}

function renderPulseHistory(){
  const history = (getPulseData().history||[]).slice(0,5);
  const el = document.getElementById('pulseHistory');
  if(!history.length){el.innerHTML='<div class="empty"><div class="empty-icon">◎</div><div class="empty-text">Пройди первую проверку</div></div>';return}
  const icons=['😴','⚡','⚡','🚀','🚀','🚀','💎'];
  el.innerHTML = history.map(h=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--cream2)">
      <span style="font-size:0.82rem;color:var(--muted)">${h.date}</span>
      <span style="font-size:0.85rem;font-weight:500">${icons[h.score]} ${h.score}/6 баллов</span>
    </div>`).join('');
}

// ════════════════════════════════════════════
// NAVIGATION EXTENSION
// ════════════════════════════════════════════
// Extend pageTitles
const extraTitles = {hour:'Цена моего часа', owner:'Зарплата владельца', pulse:'Финансовый пульс', blog:'Блог сообщества'};
Object.assign(pageTitles, extraTitles);

// Extend nav handler to include new pages
document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  const orig = btn.onclick;
  btn.onclick = function(){
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    this.classList.add('active');
    const pg = this.dataset.page;
    const pageEl = document.getElementById('page-'+pg);
    if(pageEl) pageEl.classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[pg]||pg;
    if(pg==='calendar') renderCalendar();
    if(pg==='capital') renderCapital();
    if(pg==='dashboard') renderDashboard();
    if(pg==='settings') loadSettings();
    if(pg==='hour'){document.getElementById('hlDate').value=new Date().toISOString().split('T')[0];renderHourPage();}
    if(pg==='owner') renderOwnerPage();
    if(pg==='pulse') renderPulsePage();
    if(pg==='blog') renderBlogPage();
    if(pg==='booking') renderBookingPage();
    if(pg==='clients') renderClientBase();
    updatePageHelpFab(pg);
    if(pg==='clients') renderClientBase();
  };
});

// ===== INIT =====
function refreshAll(){
  // Reset auth buttons
  var b1 = document.querySelector('#aLogin .auth-btn-primary');
  var b2 = document.querySelector('#aReg .auth-btn-primary');
  if(b1){ b1.textContent = 'Войти'; b1.disabled = false; }
  if(b2){ b2.textContent = 'Создать аккаунт'; b2.disabled = false; }
  window.dispatchEvent(new Event("km_ready"));
  seedDemo();
  navigateTo('dashboard');
  renderFinances();
  // Start Firebase real-time listener for appointments
  setTimeout(fbListenAppointments, 500);
  // Show onboarding for new users
  setTimeout(showOnboarding, 800);
  // Start reminder cycle + request push permission
  setTimeout(startReminderCycle, 2000);
  setTimeout(requestPushPermission, 3000);
}

checkSession();

// ══════════════════════════════════════════════════════

// ════════════════════════════════════════════
// AUTO TAX HINT
// ════════════════════════════════════════════
var TAX_MODES = [
  {label:'УСН 6%',   rate:0.06},
  {label:'НПД 4%',   rate:0.04},
  {label:'НПД 6%',   rate:0.06},
  {label:'УСН 15%',  rate:0.15},
];
var taxModeIdx = 0;


// ── Quick amount suggestions ─────────────────────────────────
function showAmountSuggestions(){
  var el = document.getElementById('amountSuggestions');
  if(!el) return;
  var txs = getTx();
  // Get last 5 unique income amounts
  var seen = {};
  var amounts = [];
  txs.slice().reverse().forEach(function(t){
    if(t.type==='income' && t.amount && !seen[t.amount]){
      seen[t.amount] = 1;
      amounts.push(t.amount);
    }
  });
  amounts = amounts.slice(0,5);
  if(!amounts.length){ el.style.display='none'; return; }
  el.innerHTML = '';
  amounts.forEach(function(a){
    var btn = document.createElement('button');
    btn.style.cssText = 'padding:5px 12px;border:1.5px solid var(--border);background:var(--cream2);font-family:"DM Sans",sans-serif;font-size:0.8rem;font-weight:600;color:var(--ink);cursor:pointer;transition:all 0.15s;touch-action:manipulation';
    btn.textContent = Math.round(a).toLocaleString('ru-RU') + ' ₽';
    btn.onclick = function(){
      var inp = document.getElementById('qeAmount');
      if(inp){ inp.value = a; updateTaxHint(a); }
      el.style.display = 'none';
    };
    el.appendChild(btn);
  });
  el.style.display = 'flex';
}
// Hide suggestions after entry
document.addEventListener('click', function(e){
  var el = document.getElementById('amountSuggestions');
  var qe = document.getElementById('qeAmount');
  if(el && qe && !qe.contains(e.target) && !el.contains(e.target)){
    el.style.display='none';
  }
});

function updateTaxHint(val){
  var amount = parseFloat(val) || 0;
  var hint = document.getElementById('taxHint');
  var hintAmt = document.getElementById('taxHintAmt');
  var modeBtn = document.getElementById('taxModeBtn');
  if(!hint) return;
  if(amount > 0 && qeType === 'income'){
    var mode = TAX_MODES[taxModeIdx];
    var tax = Math.round(amount * mode.rate);
    hintAmt.textContent = tax.toLocaleString('ru-RU') + ' ₽';
    modeBtn.textContent = mode.label;
    hint.classList.add('show');
  } else {
    hint.classList.remove('show');
  }
}

function cycleTaxMode(){
  taxModeIdx = (taxModeIdx + 1) % TAX_MODES.length;
  var amount = parseFloat(document.getElementById('qeAmount').value) || 0;
  updateTaxHint(amount);
}

// Hide tax hint when switching to expense
var origQeExpense = document.getElementById('qeExpense');
if(origQeExpense){
  var origExpOnClick = origQeExpense.onclick;
  origQeExpense.onclick = function(){
    if(origExpOnClick) origExpOnClick.call(this);
    document.getElementById('taxHint').classList.remove('show');
  };
}

// ════════════════════════════════════════════
// REMINDERS — Daily check via Telegram bot
// Telegram notify — via /api/notify proxy
function sendTgMsg(text){ sendTgViaProxy(text); }

function checkDailyReminders(){
  var today = new Date().toISOString().split('T')[0];
  var lastCheck = localStorage.getItem('km_reminder_check');
  if(lastCheck === today) return;  // already checked today
  localStorage.setItem('km_reminder_check', today);

  var appts = getAppts();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = tomorrow.toISOString().split('T')[0];

  // 1. Find tomorrow's appointments — remind master
  var tomorrowAppts = appts.filter(function(a){
    return a.date === tomorrowStr && a.status !== 'cancelled';
  });

  if(tomorrowAppts.length > 0){
    var lines = ['📅 *Записи на завтра (' + tomorrowStr.split('-').reverse().join('.') + '):*', ''];
    tomorrowAppts.forEach(function(a){
      lines.push('🕐 ' + a.time + ' — *' + a.client + '*');
      lines.push('   ' + (a.service||'') + (a.price?' · '+Math.round(a.price).toLocaleString('ru-RU')+' ₽':''));
      if(a.phone) lines.push('   📞 ' + a.phone);
      lines.push('');
    });
    lines.push('Хорошей работы! ✨');
    sendTgMsg(lines.join('\n'));
  }

  // 2. Find today's appointments — morning briefing
  var todayAppts = appts.filter(function(a){
    return a.date === today && a.status !== 'cancelled';
  });
  if(todayAppts.length > 0 && new Date().getHours() < 10){
    var msg = '☀️ *Доброе утро! Расписание на сегодня:*\n\n';
    todayAppts.forEach(function(a){
      msg += '🕐 ' + a.time + ' — ' + a.client + '\n';
    });
    msg += '\nУдачного дня! 💚';
    sendTgMsg(msg);
  }
}

// Run on app start and then every hour
function startReminderCycle(){
  checkDailyReminders();
  setInterval(checkDailyReminders, 60 * 60 * 1000);  // every hour
}

// PWA push notification via Service Worker
function requestPushPermission(){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'default'){
    Notification.requestPermission().then(function(p){
      if(p === 'granted') console.log('Push notifications enabled');
    });
  }
}

function showPushNotification(title, body, icon){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  try{
    new Notification(title, {
      body: body,
      icon: icon || '/app/icons/icon-192.png',
      badge: '/app/icons/icon-72.png',
      vibrate: [200, 100, 200]
    });
  }catch(e){}
}

// ════════════════════════════════════════════
// DEMO MODE
// ════════════════════════════════════════════
var IS_DEMO = false;

function enterDemoMode(){
  IS_DEMO = true;
  FB_UID = '';

  var demoUser = {id:'demo_user', name:'Мастер', prof:'Демо-режим'};
  store('km_session', demoUser);
  saveTx([]);
  saveAppts([]);
  seedDemo();

  // Hide auth, show app — safely get elements
  var auth = document.getElementById('authScreen');
  var app  = document.getElementById('app');
  if(auth) auth.style.display = 'none';
  if(app){ app.style.display = 'flex'; app.classList.add('visible'); }

  // Sidebar
  var sn = document.getElementById('sidebarName');
  var sp = document.getElementById('sidebarProf');
  var av = document.getElementById('sidebarAv');
  if(sn) sn.textContent = 'Демо-режим';
  if(sp) sp.textContent = 'Данные не сохраняются';
  if(av) av.textContent = 'D';

  // Demo banner
  var banner = document.getElementById('demoBanner');
  if(banner) banner.style.display = 'flex';

  navigateTo('dashboard');
  setTimeout(refreshAll, 100);
}

function exitDemoToReg(){
  // Clear demo session, show auth in reg mode
  IS_DEMO = false;
  localStorage.removeItem('km_session');
  store('km_users', getUsers().filter(function(u){ return u.id !== 'demo_user'; }));
  appEl.classList.remove('visible');
  appEl.style.display='none';
  authScreen.style.removeProperty('display');
  var banner = document.getElementById('demoBanner');
  if(banner) banner.style.display='none';
  authShowPanel('reg');
  authScreen.scrollTop=0;
}

// ════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════
var ONB_STEP = 0;
var ONB_TOTAL = 3; // slides 0..3

function showOnboarding(){
  // Only show once per user
  var sess = load('km_session', {});
  var key = 'km_onb_done_' + (sess.id||'u');
  if(localStorage.getItem(key)) return;
  ONB_STEP = 0;
  onbRender();
  document.getElementById('onbOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOnboarding(){
  document.getElementById('onbOverlay').classList.remove('open');
  document.body.style.overflow = '';
  // Mark as done
  var sess = load('km_session', {});
  localStorage.setItem('km_onb_done_' + (sess.id||'u'), '1');
}

function onbRender(){
  // Move slides
  var slides = document.getElementById('onbSlides');
  if(slides) slides.style.transform = 'translateX(-' + (ONB_STEP * 100) + '%)';
  // Dots
  for(var i=0;i<=ONB_TOTAL;i++){
    var d = document.getElementById('od'+i);
    if(d) d.className = 'onb-dot' + (i===ONB_STEP?' active':'');
  }
  // Buttons
  var prev = document.getElementById('onbPrevBtn');
  var next = document.getElementById('onbNextBtn');
  if(prev) prev.style.display = ONB_STEP > 0 ? 'block' : 'none';
  if(next){
    if(ONB_STEP === 0) next.textContent = 'Начать →';
    else if(ONB_STEP === ONB_TOTAL) next.textContent = '🚀 Начать работу';
    else next.textContent = 'Дальше →';
  }
}

function onbNext(){
  if(ONB_STEP >= ONB_TOTAL){ closeOnboarding(); return; }
  ONB_STEP++;
  onbRender();
}
function onbPrev(){
  if(ONB_STEP <= 0) return;
  ONB_STEP--;
  onbRender();
}

function onbGoToFinances(){
  closeOnboarding();
  navigateTo('finances');
  // Focus quick entry
  setTimeout(function(){
    var el = document.getElementById('qeAmount');
    if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); }
  }, 400);
}
function onbGoToBooking(){
  closeOnboarding();
  navigateTo('booking');
  setTimeout(function(){ switchBookTab && switchBookTab(2); }, 400);
}
function onbGoToLink(){
  closeOnboarding();
  navigateTo('booking');
  setTimeout(function(){ switchBookTab && switchBookTab(3); }, 400);
}

// Close on background click
document.getElementById('onbOverlay').addEventListener('click', function(e){
  if(e.target === this) closeOnboarding();
});

// ════════════════════════════════════════════
// LEGAL DOCUMENTS
// ════════════════════════════════════════════
var LEGAL_DOCS = {

  privacy: {
    title: 'Политика конфиденциальности',
    date: 'Редакция от 1 сентября 2025 года',
    body: `
<h2>1. Общие положения</h2>
<p>Настоящая Политика конфиденциальности (далее — «Политика») разработана в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» (в редакции ФЗ от 24.06.2025 № 156-ФЗ) и регулирует порядок обработки персональных данных пользователей сервиса «Капитал Мастера».</p>
<p>Оператор персональных данных: ИП Мягких Ольга (далее — «Оператор»). Контакт: kapitalmastera@mail.ru</p>

<h2>2. Какие данные мы обрабатываем</h2>
<ul>
<li>Имя и фамилия пользователя (при регистрации)</li>
<li>Номер телефона (при регистрации)</li>
<li>Профессия/специализация (при регистрации, необязательно)</li>
<li>Финансовые данные, вводимые пользователем (доходы, расходы, транзакции)</li>
<li>Данные о записях клиентов, вводимые пользователем</li>
<li>Технические данные: тип браузера, тип устройства, ОС</li>
</ul>

<div class="highlight-box"><strong>Важно:</strong> Все финансовые данные хранятся исключительно в локальном хранилище вашего устройства (localStorage). Они не передаются на серверы Оператора и не доступны третьим лицам.</div>

<h2>3. Цели обработки данных</h2>
<ul>
<li>Идентификация пользователя в сервисе</li>
<li>Обеспечение работы персонального кабинета</li>
<li>Улучшение качества сервиса</li>
<li>Связь с пользователем по его запросу</li>
</ul>

<h2>4. Правовые основания обработки</h2>
<p>Обработка персональных данных осуществляется на основании:</p>
<ul>
<li>Согласия субъекта персональных данных (ст. 6, ст. 9 ФЗ № 152-ФЗ)</li>
<li>Исполнения договора (пользовательского соглашения), стороной которого является пользователь</li>
</ul>

<h2>5. Хранение и защита данных</h2>
<p>Регистрационные данные (имя, телефон, хэш пароля) хранятся в localStorage браузера пользователя на его устройстве. Пароль хранится в виде необратимого хэша. Финансовые данные хранятся только локально — на устройстве пользователя.</p>
<p>Передача данных на внешние серверы не осуществляется. Оператор применяет технические меры защиты для предотвращения несанкционированного доступа.</p>

<h2>6. Срок хранения данных</h2>
<p>Данные хранятся в браузере пользователя до момента их удаления пользователем самостоятельно (через настройки браузера или функцию «Сброс данных» в приложении).</p>

<h2>7. Права пользователя</h2>
<ul>
<li>Право на доступ к своим персональным данным</li>
<li>Право на исправление неточных данных</li>
<li>Право на удаление данных (право «быть забытым»)</li>
<li>Право на отзыв согласия — путём удаления данных через настройки приложения</li>
<li>Право на обжалование действий Оператора в Роскомнадзоре</li>
</ul>

<h2>8. Файлы cookie</h2>
<p>Сервис использует localStorage для хранения данных пользователя. Файлы cookie третьих лиц не используются. Аналитика и рекламные скрипты третьих сторон не подключены.</p>

<h2>9. Передача данных третьим лицам</h2>
<p>Оператор не передаёт персональные данные пользователей третьим лицам, за исключением случаев, предусмотренных законодательством РФ.</p>

<h2>10. Изменение Политики</h2>
<p>Оператор вправе вносить изменения в настоящую Политику. Актуальная версия размещается в приложении. Продолжение использования сервиса после изменений означает согласие с новой редакцией.</p>

<h2>11. Контакты</h2>
<p>По вопросам обработки персональных данных обращайтесь: kapitalmastera@mail.ru</p>
    `
  },

  agreement: {
    title: 'Пользовательское соглашение',
    date: 'Редакция от 1 июня 2025 года',
    body: `
<h2>1. Предмет соглашения</h2>
<p>Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует отношения между ИП Мягких Ольгой (далее — «Правообладатель») и физическим лицом, использующим сервис «Капитал Мастера» (далее — «Пользователь»).</p>
<p>Регистрация в сервисе означает полное и безоговорочное принятие условий настоящего Соглашения.</p>

<h2>2. Описание сервиса</h2>
<p>«Капитал Мастера» — веб-приложение для учёта личных финансов, предназначенное для специалистов творческих и бьюти-профессий. Сервис предоставляется в режиме «как есть» (as is).</p>

<h2>3. Права и обязанности пользователя</h2>
<p>Пользователь вправе:</p>
<ul>
<li>Использовать сервис в личных некоммерческих целях</li>
<li>Вносить и хранить свои финансовые данные</li>
<li>Удалить свой аккаунт и все данные в любое время</li>
</ul>
<p>Пользователь обязуется:</p>
<ul>
<li>Не нарушать законодательство РФ при использовании сервиса</li>
<li>Не передавать данные доступа к аккаунту третьим лицам</li>
<li>Не предпринимать действий, направленных на нарушение работы сервиса</li>
</ul>

<h2>4. Права правообладателя</h2>
<ul>
<li>Изменять функциональность сервиса без предварительного уведомления</li>
<li>Прекращать предоставление сервиса с уведомлением Пользователей</li>
<li>Блокировать доступ при нарушении условий Соглашения</li>
</ul>

<h2>5. Ограничение ответственности</h2>
<p>Правообладатель не несёт ответственности за:</p>
<ul>
<li>Финансовые решения, принятые Пользователем на основе данных сервиса</li>
<li>Потерю данных в результате действий самого Пользователя</li>
<li>Перебои в работе сервиса, вызванные техническими причинами</li>
<li>Убытки, возникшие вследствие использования или невозможности использования сервиса</li>
</ul>

<div class="highlight-box"><strong>Важно:</strong> Сервис является инструментом для личного учёта финансов и не является финансовым советником, инвестиционным консультантом или налоговым агентом. Все финансовые решения Пользователь принимает самостоятельно.</div>

<h2>6. Интеллектуальная собственность</h2>
<p>Все права на сервис, его дизайн, логотипы, наименования принадлежат Правообладателю. Запрещается копирование, распространение и переработка материалов без письменного согласия Правообладателя.</p>

<h2>7. Применимое право</h2>
<p>К настоящему Соглашению применяется законодательство Российской Федерации. Все споры разрешаются в судебном порядке по месту нахождения Правообладателя.</p>

<h2>8. Контакты</h2>
<p>По всем вопросам: kapitalmastera@mail.ru</p>
    `
  },

  offer: {
    title: 'Публичная оферта',
    date: 'Редакция от 1 июня 2025 года',
    body: `
<h2>Об оферте</h2>
<p>Настоящий документ является публичной офертой Мягких Ольги (далее — «Исполнитель») и адресован неограниченному кругу лиц — физическим лицам (далее — «Заказчик»).</p>
<p>Акцептом настоящей оферты считается регистрация в сервисе «Капитал Мастера».</p>

<h2>1. Предмет договора</h2>
<p>Исполнитель предоставляет Заказчику доступ к веб-сервису «Капитал Мастера» для ведения личного финансового учёта. На момент публикации настоящей оферты сервис предоставляется бесплатно.</p>

<h2>2. Стоимость и порядок оплаты</h2>
<p>Базовый доступ к сервису предоставляется на безвозмездной основе. В случае введения платных функций Пользователи будут уведомлены заблаговременно. Оплата, при её введении, осуществляется в рублях РФ через платёжные системы, указанные на сайте.</p>

<h2>3. Порядок оказания услуг</h2>
<p>Доступ к сервису предоставляется немедленно после регистрации. Сервис работает в режиме 24/7 с технологическими перерывами для обслуживания.</p>

<h2>4. Отказ от услуг и возврат</h2>
<p>Пользователь вправе в любой момент удалить свой аккаунт и все данные через раздел «Настройки» приложения. При введении платных функций возврат средств осуществляется в порядке, установленном Законом РФ «О защите прав потребителей».</p>

<h2>5. Ответственность сторон</h2>
<p>Исполнитель обязуется прилагать разумные усилия для обеспечения бесперебойной работы сервиса. Ответственность Исполнителя ограничена суммой, уплаченной Заказчиком за период, в котором возникли убытки. При бесплатном использовании — не предусмотрена.</p>

<h2>6. Срок действия оферты</h2>
<p>Настоящая оферта действует до момента её отзыва Исполнителем. Актуальная редакция всегда доступна в приложении.</p>

<h2>7. Реквизиты исполнителя</h2>
<p>Мягких Ольга — Индивидуальный предприниматель<br>
ИНН: 071603157953<br>
ОГРНИП: 314502729400061<br>
Контакт: kapitalmastera@mail.ru</p>
    `
  },

  requisites: {
    title: 'Реквизиты',
    date: '',
    body: `
<div class="highlight-box">
<strong>Сервис «Капитал Мастера»</strong><br>
Автор и правообладатель: Мягких Ольга<br>
Статус: Индивидуальный предприниматель<br>
ИНН: 071603157953<br>
ОГРНИП: 314502729400061<br>
Контактный e-mail: kapitalmastera@mail.ru<br>
</div>

<h2>Юридически значимые документы</h2>
<ul>
<li>Политика конфиденциальности — регулирует обработку персональных данных</li>
<li>Пользовательское соглашение — регулирует условия использования сервиса</li>
<li>Публичная оферта — регулирует коммерческие отношения</li>
</ul>

<h2>Уведомление Роскомнадзора</h2>
<p>В соответствии с требованиями ФЗ № 152-ФЗ и изменениями, вступившими в силу 30.05.2025, оператор обязан уведомить Роскомнадзор об обработке персональных данных. Уведомление подано / находится в процессе подачи.</p>

<h2>Применимое законодательство</h2>
<ul>
<li>Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных»</li>
<li>ФЗ от 24.06.2025 № 156-ФЗ (поправки к ст. 9 ФЗ № 152-ФЗ)</li>
<li>ФЗ от 30.11.2024 № 420-ФЗ (новые штрафы по КоАП)</li>
<li>Закон РФ «О защите прав потребителей»</li>
<li>Гражданский кодекс РФ</li>
</ul>

<h2>Обратная связь</h2>
<p>По вопросам персональных данных, жалобам и предложениям: kapitalmastera@mail.ru</p>
<p>Роскомнадзор (по вопросам ПДн): rkn.gov.ru</p>
    `
  }
};

function openLegal(docKey) {
  var doc = LEGAL_DOCS[docKey];
  if (!doc) return;
  var content = '<h1>' + doc.title + '</h1>' +
    (doc.date ? '<p class="legal-date">' + doc.date + '</p>' : '') +
    doc.body;
  document.getElementById('legalContent').innerHTML = content;
  document.getElementById('legalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLegal(e) {
  if (e && e.target !== document.getElementById('legalOverlay')) return;
  closeLegalDirect();
}
function closeLegalDirect() {
  document.getElementById('legalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// Cookie banner
function acceptCookies() {
  localStorage.setItem('km_cookies', 'accepted');
  document.getElementById('cookieBanner').classList.remove('show');
}
function declineCookies() {
  localStorage.setItem('km_cookies', 'declined');
  document.getElementById('cookieBanner').classList.remove('show');
}
(function initCookieBanner() {
  var consent = localStorage.getItem('km_cookies');
  if (!consent) {
    setTimeout(function() {
      document.getElementById('cookieBanner').classList.add('show');
    }, 1500);
  }
})();

// Keyboard close for legal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeLegalDirect();
    closeDlPopupDirect();
  }
});

// ════════════════════════════════════════════
// FEATURE: QUICK AMOUNT SUGGESTIONS
// ════════════════════════════════════════════
function showAmountSuggestions(){
  var el = document.getElementById('amountSuggestions');
  if(!el) return;
  var txs = getTx();
  // Get last 5 unique income amounts
  var seen = {};
  var amounts = [];
  txs.filter(function(t){ return t.type==='income' && t.amount>0; })
     .slice(-30).reverse()
     .forEach(function(t){
       var k = Math.round(t.amount);
       if(!seen[k] && amounts.length<5){ seen[k]=1; amounts.push(k); }
     });
  if(!amounts.length){ el.style.display='none'; return; }
  el.style.display = 'flex';
  el.style.display = 'flex';
  el.innerHTML = '';
  var lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:0.7rem;color:var(--muted);align-self:center;margin-right:4px';
  lbl.textContent = 'Быстро:';
  el.appendChild(lbl);
  amounts.forEach(function(a){
    var btn = document.createElement('button');
    btn.style.cssText = 'padding:5px 12px;background:var(--cream2);border:1px solid var(--border);font-size:0.8rem;font-weight:600;cursor:pointer;font-family:DM Sans,sans-serif;color:var(--ink)';
    btn.textContent = a.toLocaleString('ru-RU') + ' ₽';
    btn.onclick = (function(v){ return function(){ setQeAmount(v); }; })(a);
    el.appendChild(btn);
  });
}

function setQeAmount(val){
  var el = document.getElementById('qeAmount');
  if(el){ el.value = val; updateTaxHint(val); el.focus(); }
  var sugg = document.getElementById('amountSuggestions');
  if(sugg) sugg.style.display = 'none';
}

// Hide suggestions when input blurs (small delay to allow click)
document.getElementById('qeAmount') && document.getElementById('qeAmount').addEventListener('blur', function(){
  setTimeout(function(){ var s=document.getElementById('amountSuggestions'); if(s)s.style.display='none'; }, 200);
});

// ════════════════════════════════════════════
// FEATURE: CLIENT BASE
// ════════════════════════════════════════════
function buildClientBase(){
  var appts = getAppts();
  var clients = {};
  appts.forEach(function(a){
    if(!a.client) return;
    var key = (a.client||'').toLowerCase().trim();
    if(!clients[key]){
      clients[key] = {
        name: a.client,
        phone: a.phone||'',
        visits: [],
        totalLtv: 0,
        lastDate: ''
      };
    }
    if(a.phone && !clients[key].phone) clients[key].phone = a.phone;
    clients[key].visits.push(a);
    clients[key].totalLtv += parseFloat(a.price)||0;
    if(!clients[key].lastDate || a.date > clients[key].lastDate) clients[key].lastDate = a.date;
  });
  return Object.values(clients).sort(function(a,b){ return b.totalLtv - a.totalLtv; });
}

function renderClientBase(search){
  var clients = buildClientBase();
  if(search && search.trim()){
    var q = search.toLowerCase().trim();
    clients = clients.filter(function(c){
      return c.name.toLowerCase().includes(q) || (c.phone||'').includes(q);
    });
  }
  // Update KPI
  var allClients = buildClientBase();
  var totalLtv = allClients.reduce(function(s,c){ return s+c.totalLtv; },0);
  var regular = allClients.filter(function(c){ return c.visits.length>=3; }).length;
  var elTotal = document.getElementById('cbTotal');
  var elLtv = document.getElementById('cbLtv');
  var elAvg = document.getElementById('cbAvgLtv');
  var elReg = document.getElementById('cbRegular');
  if(elTotal) elTotal.textContent = allClients.length;
  if(elLtv) elLtv.innerHTML = Math.round(totalLtv).toLocaleString('ru-RU') + ' <small>₽</small>';
  if(elAvg) elAvg.innerHTML = allClients.length ? Math.round(totalLtv/allClients.length).toLocaleString('ru-RU') + ' <small>₽</small>' : '0 <small>₽</small>';
  if(elReg) elReg.textContent = regular;
  // Render list
  var el = document.getElementById('clientBaseList');
  if(!el) return;
  if(!clients.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">'+(search?'Клиент не найден':'Записей клиентов нет.<br>Добавь первую запись в календаре.')+'</div></div>';
    return;
  }
  el.innerHTML = '';
  clients.forEach(function(c){
    var lastParts = c.lastDate ? c.lastDate.split('-') : [];
    var lastStr = lastParts.length ? (+lastParts[2])+'.'+(lastParts[1])+'.'+lastParts[0] : '—';
    var visits = c.visits.length;
    var badge = visits>=5?'💎 VIP':visits>=3?'⭐ Постоянный':'🆕 Новый';
    var div = document.createElement('div');
    div.style.cssText = 'background:var(--white);border:0.5px solid var(--border);padding:16px 18px;margin-bottom:10px';
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'+
        '<div>'+
          '<div style="font-size:1rem;font-weight:700;color:var(--ink);margin-bottom:3px">'+c.name+'</div>'+
          (c.phone?'<div style="font-size:0.78rem;color:var(--muted)">📞 '+c.phone+'</div>':'<div style="font-size:0.75rem;color:var(--border)">телефон не указан</div>')+
        '</div>'+
        '<span style="font-size:0.72rem;padding:3px 10px;background:var(--cream2);border:1px solid var(--border)">'+badge+'</span>'+
      '</div>'+
      '<div style="display:flex;gap:20px;margin-bottom:12px">'+
        '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--em)">'+visits+'</div><div style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em">Визитов</div></div>'+
        '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--em)">'+Math.round(c.totalLtv).toLocaleString('ru-RU')+' ₽</div><div style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em">LTV</div></div>'+
        '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--ink)">'+lastStr+'</div><div style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em">Последний визит</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"></div>';
    var actions = div.querySelector('div:last-child');
    // Rebook button
    var rb = document.createElement('button');
    rb.style.cssText = 'padding:8px 14px;background:var(--em);color:#fff;border:none;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;touch-action:manipulation';
    rb.textContent = '📅 Записать снова';
    rb.onclick = (function(client){ return function(){ rebookClient(client); }; })(c);
    actions.appendChild(rb);
    // WhatsApp button
    if(c.phone){
      var wa = document.createElement('a');
      wa.href = 'https://wa.me/'+c.phone.replace(/\D/g,'');
      wa.target = '_blank';
      wa.style.cssText = 'padding:8px 14px;background:#25D366;color:#fff;font-size:0.78rem;font-weight:700;text-decoration:none;display:inline-block';
      wa.textContent = 'WA';
      actions.appendChild(wa);
    }
    el.appendChild(div);
  });
}

function rebookClient(client){
  // Pre-fill appointment form and navigate to calendar
  navigateTo('calendar');
  setTimeout(function(){
    var nameEl = document.getElementById('apptClient');
    var phoneEl = document.getElementById('apptPhone');
    var lastVisit = client.visits.sort(function(a,b){ return b.date.localeCompare(a.date); })[0];
    if(nameEl) nameEl.value = client.name;
    if(phoneEl && client.phone) phoneEl.value = client.phone;
    if(lastVisit){
      var svcEl = document.getElementById('apptService');
      var priceEl = document.getElementById('apptPrice');
      if(svcEl) svcEl.value = lastVisit.service||'';
      if(priceEl) priceEl.value = lastVisit.price||'';
    }
    // Set tomorrow as default date
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    var dateEl = document.getElementById('apptDate');
    if(dateEl) dateEl.value = tomorrow.toISOString().split('T')[0];
    // Scroll to form
    var form = document.getElementById('apptForm');
    if(form) form.scrollIntoView({behavior:'smooth',block:'start'});
    toast('✓ Данные '+client.name+' заполнены — выбери дату и время');
  }, 400);
}

// ════════════════════════════════════════════
// FEATURE: REMINDERS via Telegram Bot
// ════════════════════════════════════════════
// TG credentials stored server-side in Vercel env vars

function sendTgMsg(text){
  sendTgViaProxy(text);
}

// Check reminders: run every 30 min
function checkReminders(){
  var appts = getAppts().filter(function(a){ return a.status !== 'cancelled'; });
  var now = new Date();
  var todayStr = now.toISOString().split('T')[0];
  var tomorrowStr = new Date(now.getTime()+86400000).toISOString().split('T')[0];
  var alreadySent = load('km_reminders_sent', {});
  var updated = false;
  var nl = '\n';

  // Morning summary at 8:00
  var morningKey = 'morning_' + todayStr;
  if(!alreadySent[morningKey] && now.getHours() >= 8){
    var todayAppts = appts.filter(function(x){ return x.date === todayStr; });
    if(todayAppts.length){
      var list = todayAppts.map(function(x){ return '\u2022 '+x.time+' \u2014 '+x.client+' ('+x.service+')'; }).join(nl);
      sendTgMsg('\u2600\ufe0f *\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e! \u0420\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f:*'+nl+nl+list+nl+nl+'\u0423\u0441\u043f\u0435\u0448\u043d\u043e\u0433\u043e \u0434\u043d\u044f! \u2728');
      alreadySent[morningKey] = 1;
      updated = true;
    }
  }

  // 24h reminder before each appointment
  appts.forEach(function(a){
    var remKey = 'remind_' + a.id;
    if(a.date === tomorrowStr && !alreadySent[remKey]){
      var p = (a.date||'').split('-');
      var dateRu = p.length===3 ? (+p[2])+'.'+p[1]+'.'+p[0] : a.date;
      sendTgMsg('\ud83d\udd14 *\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435: \u0437\u0430\u0432\u0442\u0440\u0430 \u0437\u0430\u043f\u0438\u0441\u044c!*'+nl+
        '\ud83d\udc64 '+a.client+nl+
        '\ud83d\udc86 '+(a.service||'\u2014')+nl+
        '\ud83d\udcc5 '+dateRu+'  \ud83d\udd50 '+(a.time||'')+
        (a.price?nl+'\ud83d\udcb0 '+Math.round(a.price).toLocaleString('ru-RU')+' \u20BD':''));
      alreadySent[remKey] = 1;
      updated = true;
    }
  });

  if(updated) store('km_reminders_sent', alreadySent);
}
setTimeout(checkReminders, 3000);
setInterval(checkReminders, 30 * 60 * 1000);

// ════════════════════════════════════════════
// DOWNLOAD POPUP
// ════════════════════════════════════════════
var DL_STEPS = {
  ios: {
    label: '🍎 iPhone — инструкция',
    steps: [
      {t:'Открой Safari', d:'Именно <strong>Safari</strong> — другие браузеры на iPhone не поддерживают установку PWA'},
      {t:'Нажми «Поделиться»', d:'Кнопка внизу экрана — <strong>квадрат со стрелкой вверх ↑</strong>'},
      {t:'«На экран Домой»', d:'Прокрути список вниз → найди <strong>«На экран Домой»</strong> и нажми'},
      {t:'Нажми «Добавить»', d:'Подтверди в правом верхнем углу → иконка появится на рабочем столе'},
    ]
  },
  android: {
    label: '🤖 Android — инструкция',
    steps: [
      {t:'Открой Chrome', d:'Перейди по ссылке приложения в <strong>Google Chrome</strong>'},
      {t:'Баннер «Установить»', d:'Chrome предложит <strong>«Установить приложение»</strong> — нажми'},
      {t:'Или через меню ⋮', d:'<strong>Три точки</strong> вверху → <strong>«Добавить на главный экран»</strong>'},
      {t:'Готово!', d:'Приложение работает как нативное — без адресной строки'},
    ]
  }
};

function openDlPopup(){
  var popup = document.getElementById('dlPopup');
  if(!popup){ return; }
  popup.style.opacity = '0';
  popup.style.visibility = 'visible';
  var box = popup.querySelector('.dl-popup-box');
  if(box) box.style.transform = 'translateY(60px)';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function(){
    popup.style.opacity = '1';
    if(box) box.style.transform = 'translateY(0)';
  });
  // Auto-detect iOS vs Android
  var isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  dlTab(isIos ? 'ios' : 'android');
}

function dlTab(tab){
  var ios     = document.getElementById('dlIos');
  var android = document.getElementById('dlAndroid');
  var tIos    = document.getElementById('dlTabIos');
  var tAnd    = document.getElementById('dlTabAndroid');
  if(!ios || !android) return;
  ios.style.display     = tab === 'ios' ? 'block' : 'none';
  android.style.display = tab === 'android' ? 'block' : 'none';
  if(tIos){ tIos.style.color = tab==='ios' ? 'var(--ink)' : 'var(--muted)'; tIos.style.borderBottomColor = tab==='ios' ? 'var(--em)' : 'transparent'; }
  if(tAnd){ tAnd.style.color = tab==='android' ? 'var(--ink)' : 'var(--muted)'; tAnd.style.borderBottomColor = tab==='android' ? 'var(--em)' : 'transparent'; }
}
function closeDlPopup(e){
  if(e && e.target !== document.getElementById('dlPopup')) return;
  closeDlPopupDirect();
}
function closeDlPopupDirect(){
  document.getElementById('dlPopup').classList.remove('open');
  document.body.style.overflow='';
}

function showDlSteps(platform){
  var data = DL_STEPS[platform];
  var wrap = document.getElementById('dlStepsWrap');
  var body = document.getElementById('dlStepsBody');
  var label = document.getElementById('dlStepsLabel');
  label.textContent = data.label;
  body.innerHTML = data.steps.map(function(s, i){
    return '<div class="dl-step-row">' +
      '<div class="dl-step-n">' + (i+1) + '</div>' +
      '<div><div class="dl-step-t">' + s.t + '</div>' +
      '<div class="dl-step-d">' + s.d + '</div></div>' +
    '</div>';
  }).join('');
  wrap.style.display = 'block';
  body.classList.add('open');
  document.getElementById('dlStepsArr').classList.add('open');
}

function toggleDlSteps(){
  var body = document.getElementById('dlStepsBody');
  var arr  = document.getElementById('dlStepsArr');
  body.classList.toggle('open');
  arr.classList.toggle('open');
}

// Keyboard close
// keyboard handler merged above

// ── Service Worker ────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/app/sw.js').then(function(reg){
      console.log('SW registered:', reg.scope);
    }).catch(function(err){
      console.log('SW registration failed:', err);
    });
  });
}

// ── Install prompt ────────────────────────────────
var deferredPrompt = null;
var installBanner = document.getElementById('installBanner');

window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  deferredPrompt = e;
  // Show banner only if not dismissed before
  if(!localStorage.getItem('km_install_dismissed')){
    setTimeout(function(){ installBanner.style.display='block'; }, 3000);
  }
});

function installPWA(){
  installBanner.style.display='none';
  if(deferredPrompt){
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(result){
      if(result.outcome==='accepted'){
        console.log('PWA installed');
      }
      deferredPrompt=null;
    });
  }
}

function dismissInstall(){
  installBanner.style.display='none';
  localStorage.setItem('km_install_dismissed','1');
}

window.addEventListener('appinstalled', function(){
  installBanner.style.display='none';
  deferredPrompt=null;
  console.log('PWA installed successfully');
});

// ── Handle URL shortcuts (from manifest shortcuts) ──
(function(){
  var params=new URLSearchParams(window.location.search);
  var action=params.get('action');
  if(action==='quick-entry'){
    window.addEventListener('km_ready',function(){
      navigateTo('finances');
      setTimeout(function(){document.getElementById('qeAmount')&&document.getElementById('qeAmount').focus();},300);
    });
  }
  if(action==='new-appointment'){
    window.addEventListener('km_ready',function(){
      navigateTo('calendar');
      setTimeout(function(){document.getElementById('apptClient')&&document.getElementById('apptClient').focus();},300);
    });
  }
})();