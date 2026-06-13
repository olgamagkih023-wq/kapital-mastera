// ═══ booking.js — Капитал Мастера ═══
// jshint esversion:6


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

function confirmAppt(id){const a=getAppts();const idx=a.findIndex(x=>x.id===id);if(idx>-1){a[idx].status='confirmed';saveAppts(a);renderCalendar();toast('Запись подтверждена')}}

function cancelAppt(id){const a=getAppts();const idx=a.findIndex(x=>x.id===id);if(idx>-1){a[idx].status='cancelled';saveAppts(a);renderCalendar();toast('Запись отменена')}}

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

function setQeAmount(val){
  var el = document.getElementById('qeAmount');
  if(el){ el.value = val; updateTaxHint(val); el.focus(); }
  var sugg = document.getElementById('amountSuggestions');
  if(sugg) sugg.style.display = 'none';
}