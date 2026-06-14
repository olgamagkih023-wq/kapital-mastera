// ═══ auth.js — Капитал Мастера ═══
// jshint esversion:6


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

function authShowPanel(w){showAuthTab(w==='reg'?'reg':'login');}

function doAuthLogin(){
  var phone=((document.getElementById('lPhone')||{}).value||'').trim();
  var pass=(document.getElementById('lPass')||{}).value||'';
  var btn=document.getElementById('btnLogin');
  if(!phone){showAuthErr('loginErr','Введите телефон');return;}
  if(!pass){showAuthErr('loginErr','Введите пароль');return;}
  try{
    var users=JSON.parse(localStorage.getItem('km_users')||'[]');
    var user=users.find(function(u){return u.phone===phone;});
    if(!user){showAuthErr('loginErr','Номер не зарегистрирован');return;}
    if(user.ph!==simpleHash(pass)){showAuthErr('loginErr','Неверный пароль');return;}
    if(btn){btn.textContent='Входим...';btn.disabled=true;}
    setTimeout(function(){launchApp({id:user.id,name:user.name,prof:user.prof||''});},50);
  }catch(e){showAuthErr('loginErr','Ошибка: '+e.message);}
}

function doAuthRegister(){
  var name=((document.getElementById('rName')||{}).value||'').trim();
  var prof=(document.getElementById('rProf')||{}).value||'';
  var phone=((document.getElementById('rPhone')||{}).value||'').trim();
  var pass=(document.getElementById('rPass')||{}).value||'';
  var btn=document.getElementById('btnReg');
  if(!name){showAuthErr('regErr','Введите имя');return;}
  if(!phone){showAuthErr('regErr','Введите телефон');return;}
  if(pass.length<4){showAuthErr('regErr','Пароль минимум 4 символа');return;}
  try{
    var users=JSON.parse(localStorage.getItem('km_users')||'[]');
    if(users.find(function(u){return u.phone===phone;})){showAuthErr('regErr','Телефон занят');return;}
    var id='u_'+Date.now();
    users.push({id:id,name:name,prof:prof,phone:phone,ph:simpleHash(pass),created:Date.now()});
    localStorage.setItem('km_users',JSON.stringify(users));
    if(btn){btn.textContent='Создаём...';btn.disabled=true;}
    setTimeout(function(){launchApp({id:id,name:name,prof:prof||'Специалист'});},50);
  }catch(e){showAuthErr('regErr','Ошибка: '+e.message);}
}

function showAuthErr(errId,msg){
  var el=document.getElementById(errId);
  if(el){el.textContent=msg;el.style.display='block';}
  var b1=document.getElementById('btnLogin');
  var b2=document.getElementById('btnReg');
  if(b1){b1.textContent='Войти';b1.disabled=false;}
  if(b2){b2.textContent='Создать аккаунт';b2.disabled=false;}
}

function launchApp(user){
  store('km_session', user);
  FB_UID = user.id || '';
  var sn=document.getElementById('sidebarName');
  var sp=document.getElementById('sidebarProf');
  var av=document.getElementById('sidebarAv');
  if(sn) sn.textContent=user.name||'Мастер';
  if(sp) sp.textContent=user.prof||'Специалист';
  if(av) av.textContent=(user.name||'М')[0].toUpperCase();
  var auth=document.getElementById('authScreen');
  var app=document.getElementById('app');
  if(auth) auth.style.display='none';
  if(app){app.style.display='flex';app.classList.add('visible');}
  refreshAll();
  if(FB_UID) setTimeout(function(){
    fbLoadProfile&&fbLoadProfile(FB_UID,function(){
      typeof renderFinances==='function'&&renderFinances();
      typeof renderDashboard==='function'&&renderDashboard();
    });
  },800);
}

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

function enterDemoMode(){
  IS_DEMO = true;
  FB_UID = '';
  var demoUser = {id:'demo_user', name:'Мастер', prof:'Демо-режим'};
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

function seedDemo(){
  if(getTx().length>0)return;
  const now=new Date();
  const txs=[];
  const categories=['Клиент','Материалы','Аренда','Обучение','Маркетинг','Продукты','Транспорт'];
  for(let i=0;i<30;i++){
    const d=new Date(now);d.setDate(d.getDate()-i);
    const isIncome=Math.random()>0.45;
    txs.push({id:uid(),date:d.toISOString(),amount:isIncome?Math.round(3000+Math.random()*12000):Math.round(500+Math.random()*5000),desc:isIncome?['Стрижка Анна','Маникюр Елена','Окрашивание Мария','Стилинг Ольга','Укладка Наташа'][Math.floor(Math.random()*5)]:['Шампунь','Краска L\'Oreal','Аренда места','Курс обучения','Реклама Instagram'][Math.floor(Math.random()*5)],cat:isIncome?'Клиент':categories[Math.floor(Math.random()*categories.length)],type:isIncome?'income':'expense',segment:Math.random()>0.3?'business':'personal'});
  }
  saveTx(txs);

  // Demo appointments
  const appts=[];
  const names=['Анна К.','Мария П.','Елена В.','Наташа С.','Ольга М.','Светлана Д.'];
  const services=['Стрижка','Маникюр','Укладка','Окрашивание','Педикюр','Брови'];
  for(let i=0;i<8;i++){
    const d=new Date(now);d.setDate(d.getDate()+(i-2));
    const dateStr=`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
    appts.push({id:uid(),client:names[Math.floor(Math.random()*names.length)],service:services[Math.floor(Math.random()*services.length)],date:dateStr,time:`${10+Math.floor(Math.random()*8)}:00`,price:Math.round(1500+Math.random()*3500),note:'',status:i<3?'confirmed':'pending',created:Date.now()});
  }
  saveAppts(appts);
}