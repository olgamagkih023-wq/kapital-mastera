// ═══ auth.js — Капитал Мастера (Firebase Authentication) ═══
// jshint esversion:8

// Телефон превращаем в технический email, чтобы не трогать формы.
// Только цифры -> 79991234567@kapital.local
function phoneToEmail(phone){
  var digits = (phone || '').replace(/\D/g, '');
  return digits + '@kapital.local';
}

function showAuthTab(tab){
  var fl=document.getElementById('formLogin');
  var fr=document.getElementById('formReg');
  var tl=document.getElementById('tabLogin');
  var tr=document.getElementById('tabReg');
  if(fl)fl.style.display=tab==='login'?'block':'none';
  if(fr)fr.style.display=tab==='reg'?'block':'none';
  if(tl)tl.className='auth-tab-btn'+(tab==='login'?' active':'');
  if(tr)tr.className='auth-tab-btn'+(tab==='reg'?' active':'');
  ['loginErr','regErr'].forEach(function(id){
    var e=document.getElementById(id);
    if(e){e.style.display='none';e.textContent='';}
  });
}

function authShowPanel(w){ showAuthTab(w==='reg'?'reg':'login'); }

// ── Вход ──────────────────────────────────────────────────────
async function doAuthLogin(){
  var phone=((document.getElementById('lPhone')||{}).value||'').trim();
  var pass=(document.getElementById('lPass')||{}).value||'';
  var btn=document.getElementById('btnLogin');
  if(!phone){ showAuthErr('loginErr','Введите телефон'); return; }
  if(!pass){ showAuthErr('loginErr','Введите пароль'); return; }
  if(btn){ btn.textContent='Входим...'; btn.disabled=true; }
  try{
    var cred = await firebase.auth()
      .signInWithEmailAndPassword(phoneToEmail(phone), pass);
    // launchApp вызовется автоматически из onAuthStateChanged
  }catch(e){
    var msg = 'Ошибка входа';
    if(e.code==='auth/user-not-found')      msg='Номер не зарегистрирован';
    else if(e.code==='auth/wrong-password') msg='Неверный пароль';
    else if(e.code==='auth/invalid-credential') msg='Неверный телефон или пароль';
    else if(e.code==='auth/too-many-requests')  msg='Слишком много попыток, подождите';
    showAuthErr('loginErr', msg);
  }
}

// ── Регистрация ───────────────────────────────────────────────
async function doAuthRegister(){
  var name=((document.getElementById('rName')||{}).value||'').trim();
  var prof=(document.getElementById('rProf')||{}).value||'';
  var phone=((document.getElementById('rPhone')||{}).value||'').trim();
  var pass=(document.getElementById('rPass')||{}).value||'';
  var btn=document.getElementById('btnReg');
  if(!name){ showAuthErr('regErr','Введите имя'); return; }
  if(!phone){ showAuthErr('regErr','Введите телефон'); return; }
  if(pass.length<6){ showAuthErr('regErr','Пароль минимум 6 символов'); return; }
  if(btn){ btn.textContent='Создаём...'; btn.disabled=true; }
  try{
    var cred = await firebase.auth()
      .createUserWithEmailAndPassword(phoneToEmail(phone), pass);
    var uid = cred.user.uid;
    // Профиль кладём в защищённую ветку users/$uid
    await db.ref('users/' + uid + '/profile').set({
      name: name,
      prof: prof || 'Специалист',
      phone: phone,
      created: Date.now()
    });
    // launchApp вызовется из onAuthStateChanged
  }catch(e){
    var msg = 'Ошибка регистрации';
    if(e.code==='auth/email-already-in-use') msg='Этот телефон уже зарегистрирован';
    else if(e.code==='auth/weak-password')   msg='Слишком простой пароль';
    showAuthErr('regErr', msg);
  }
}

function showAuthErr(errId,msg){
  var el=document.getElementById(errId);
  if(el){ el.textContent=msg; el.style.display='block'; }
  var b1=document.getElementById('btnLogin');
  var b2=document.getElementById('btnReg');
  if(b1){ b1.textContent='Войти'; b1.disabled=false; }
  if(b2){ b2.textContent='Создать аккаунт'; b2.disabled=false; }
}

// ── Единая точка реакции на состояние входа ───────────────────
// Firebase сам помнит сессию между запусками — checkSession больше не нужен.
function initAuthListener(){
  firebase.auth().onAuthStateChanged(function(user){
    if(IS_DEMO) return; // в демо Firebase Auth не используем
    if(user){
      FB_UID = user.uid;
      db.ref('users/' + user.uid + '/profile').once('value').then(function(snap){
        var p = snap.val() || {};
        launchApp({ id:user.uid, name:p.name||'Мастер', prof:p.prof||'Специалист' });
      });
    }else{
      FB_UID = '';
      var auth=document.getElementById('authScreen');
      var app=document.getElementById('app');
      if(auth) auth.style.display='flex';
      if(app){ app.style.display='none'; app.classList.remove('visible'); }
    }
  });
}

function doLogout(){
  firebase.auth().signOut();
  localStorage.removeItem('km_session');
}

function launchApp(user){
  store('km_session', user);
  var sn=document.getElementById('sidebarName');
  var sp=document.getElementById('sidebarProf');
  var av=document.getElementById('sidebarAv');
  if(sn) sn.textContent=user.name||'Мастер';
  if(sp) sp.textContent=user.prof||'Специалист';
  if(av) av.textContent=(user.name||'М')[0].toUpperCase();
  var auth=document.getElementById('authScreen');
  var app=document.getElementById('app');
  if(auth) auth.style.display='none';
  if(app){ app.style.display='flex'; app.classList.add('visible'); }
  refreshAll();
  if(FB_UID) setTimeout(function(){
    fbLoadProfile&&fbLoadProfile(FB_UID,function(){
      typeof renderFinances==='function'&&renderFinances();
      typeof renderDashboard==='function'&&renderDashboard();
    });
  },300);
}

// ── Демо-режим (без изменений по смыслу, но НЕ трогает реальные данные) ──
function enterDemoMode(){
  IS_DEMO = true;
  FB_UID = '';
  var demoUser = {id:'demo_user', name:'Демо-режим', prof:'Данные не сохраняются'};
  store('km_session', demoUser);
  saveTx([]);
  saveAppts([]);
  seedDemo();
  var auth = document.getElementById('authScreen');
  var app  = document.getElementById('app');
  if(auth) auth.style.display = 'none';
  if(app){ app.style.display = 'flex'; app.classList.add('visible'); }
  var sn = document.getElementById('sidebarName');
  var sp = document.getElementById('sidebarProf');
  var av = document.getElementById('sidebarAv');
  if(sn) sn.textContent = 'Демо-режим';
  if(sp) sp.textContent = 'Данные не сохраняются';
  if(av) av.textContent = 'D';
  var banner = document.getElementById('demoBanner');
  if(banner) banner.style.display = 'flex';
  if(typeof navigateTo === 'function') navigateTo('dashboard');
  setTimeout(function(){ if(typeof refreshAll === 'function') refreshAll(); }, 100);
}

// seedDemo() оставляем как был — копируйте из старого auth.js без изменений.
