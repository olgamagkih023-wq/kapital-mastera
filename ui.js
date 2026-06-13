// ═══ ui.js — Капитал Мастера ═══
// jshint esversion:6


function openDlPopup(){
  var popup = document.getElementById('dlPopup');
  if(!popup){ console.error('dlPopup not found'); return; }
  popup.classList.add('open');
  document.body.style.overflow='hidden';
}

function closeDlPopup(e){
  if(e&&e.target){
    var box=document.querySelector('.dl-popup-box');
    if(box&&box.contains(e.target))return;
  }
  var el=document.getElementById('dlPopup');
  if(el)el.classList.remove('open');
  document.body.style.overflow='';
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