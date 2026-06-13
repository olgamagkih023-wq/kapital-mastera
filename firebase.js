// ═══ firebase.js — Капитал Мастера ═══
// jshint esversion:6


function fbRef(path){
  if(!FB_UID || typeof db === 'undefined') return null;
  return db.ref('users/' + FB_UID + '/' + path);
}

function fbWrite(path, data){
  var ref = fbRef(path);
  if(!ref) return;
  clearTimeout(FB_WRITE_TIMERS[path]);
  FB_WRITE_TIMERS[path] = setTimeout(function(){
    ref.set(data).catch(function(e){ console.warn('FB write error ['+path+']:', e.message); });
  }, 600);  // 600ms debounce — batch rapid changes
}

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

function fbSaveAppointment(masterUid, appt){
  if(typeof db === 'undefined') return Promise.reject('no db');
  return db.ref('masters/' + masterUid + '/appointments/' + appt.id).set(appt);
}

function fbLoadMasterSettings(masterUid){
  if(typeof db === 'undefined') return Promise.resolve(null);
  return db.ref('masters/' + masterUid + '/settings').once('value').then(function(snap){
    return snap.val();
  });
}

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

function fbUpdateApptStatus(apptId, status){
  var sess = load('km_session', {});
  var uid = sess.id || 'default';
  if(typeof db === 'undefined') return;
  db.ref('masters/' + uid + '/appointments/' + apptId + '/status').set(status);
}

function updateFbStatus(ok, msg){
  var dot = document.getElementById('fbSyncDot');
  var txt = document.getElementById('fbSyncStatus');
  if(dot) dot.style.background = ok ? 'var(--em)' : 'var(--red)';
  if(txt) txt.textContent = msg || (ok ? 'Данные синхронизируются между устройствами' : 'Работаем офлайн — данные сохранены локально');
}

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