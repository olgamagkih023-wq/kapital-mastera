// ═══ ui.js — Капитал Мастера ═══

// ── Download popup ────────────────────────────────────────────
function openDlPopup(){
  var popup = document.getElementById('dlPopup');
  if(!popup) return;
  popup.classList.add('open');
  document.body.style.overflow = 'hidden';
  var isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  dlTab(isIos ? 'ios' : 'android');
}

function closeDlPopup(e){
  if(e && e.target){
    var box = document.querySelector('.dl-box');
    if(box && box.contains(e.target)) return;
  }
  var popup = document.getElementById('dlPopup');
  if(popup) popup.classList.remove('open');
  document.body.style.overflow = '';
}

function dlTab(tab){
  var ios  = document.getElementById('dlIos');
  var and  = document.getElementById('dlAndroid');
  var tIos = document.getElementById('dlTabIos');
  var tAnd = document.getElementById('dlTabAndroid');
  if(ios) ios.style.display  = tab === 'ios' ? 'block' : 'none';
  if(and) and.style.display  = tab === 'android' ? 'block' : 'none';
  if(tIos){
    tIos.className = 'dl-tab' + (tab==='ios' ? ' active' : '');
  }
  if(tAnd){
    tAnd.className = 'dl-tab' + (tab==='android' ? ' active' : '');
  }
}

// ── Onboarding ────────────────────────────────────────────────
var ONB_STEP = 0;
var ONB_TOTAL = 3;

function showOnboarding(){
  var sess = load('km_session', {});
  var key = 'km_onb_done_' + (sess.id || 'u');
  if(localStorage.getItem(key)) return;
  ONB_STEP = 0;
  onbRender();
  var overlay = document.getElementById('onbOverlay');
  if(overlay) overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOnboarding(){
  var overlay = document.getElementById('onbOverlay');
  if(overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
  var sess = load('km_session', {});
  localStorage.setItem('km_onb_done_' + (sess.id||'u'), '1');
}

function onbRender(){
  var slides = document.getElementById('onbSlides');
  if(slides) slides.style.transform = 'translateX(-' + (ONB_STEP * 100) + '%)';
  for(var i=0; i<=ONB_TOTAL; i++){
    var d = document.getElementById('od' + i);
    if(d) d.className = 'onb-dot' + (i === ONB_STEP ? ' active' : '');
  }
  var prev = document.getElementById('onbPrevBtn');
  var next = document.getElementById('onbNextBtn');
  if(prev) prev.style.display = ONB_STEP > 0 ? 'block' : 'none';
  if(next){
    if(ONB_STEP === 0) next.textContent = 'Начать →';
    else if(ONB_STEP === ONB_TOTAL) next.textContent = 'Начать работу 🚀';
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
  setTimeout(function(){
    var el = document.getElementById('qeAmount');
    if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); }
  }, 400);
}
function onbGoToBooking(){
  closeOnboarding();
  navigateTo('booking');
  setTimeout(function(){ if(typeof switchBookTab==='function') switchBookTab(2); }, 400);
}
function onbGoToLink(){
  closeOnboarding();
  navigateTo('booking');
  setTimeout(function(){ if(typeof switchBookTab==='function') switchBookTab(3); }, 400);
}

// ── Page help FAB ─────────────────────────────────────────────
var PAGE_HELP_MAP = {
  'dashboard':'dashboard','finances':'finances','capital':'capital',
  'calendar':'calendar','clients':'clients','booking':'booking',
  'hour':'hour','owner':'owner','pulse':'pulse','blog':'blog','settings':'settings'
};

function updatePageHelpFab(page){
  var fab = document.getElementById('pageHelpFab');
  if(!fab) return;
  var key = PAGE_HELP_MAP[page];
  if(key && typeof HELP_CONTENT !== 'undefined' && HELP_CONTENT[key]){
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

// ── Chatbot ───────────────────────────────────────────────────
var BOT_OPEN = false;
var BOT_HISTORY = [];
var BOT_LOADING = false;

var BOT_QUICK_CHIPS = [
  'Мои финансы за месяц',
  'Как добавить доход?',
  'Как платить налоги?',
  'Как настроить онлайн-запись?',
  'Что такое 50/30/20?',
];

function toggleBot(){
  BOT_OPEN = !BOT_OPEN;
  var win = document.getElementById('botWindow');
  if(win) win.classList.toggle('open', BOT_OPEN);
  if(BOT_OPEN && BOT_HISTORY.length === 0) botGreet();
  if(BOT_OPEN){
    var inp = document.getElementById('botInput');
    if(inp) setTimeout(function(){ inp.focus(); }, 300);
  }
  var badge = document.getElementById('botBadge');
  if(badge) badge.style.display = 'none';
}

function botGreet(){
  var sess = load('km_session', {});
  var name = sess.name ? sess.name.split(' ')[0] : null;
  var text = name
    ? 'Привет, ' + name + '! Я Капитал Ассистент ✦\n\nСпроси про налоги, онлайн-запись или правило 50/30/20.'
    : 'Привет! Я Капитал Ассистент ✦\n\nПомогу разобраться с финансами и приложением.';
  addBotMsg('bot', text);
  showBotChips(BOT_QUICK_CHIPS);
}

function addBotMsg(role, text){
  var msgs = document.getElementById('botMsgs');
  if(!msgs) return;
  var div = document.createElement('div');
  div.className = 'bot-msg ' + role;
  var av = document.createElement('div');
  av.className = 'bot-msg-av';
  av.textContent = role === 'bot' ? '✦' : '👤';
  var bubble = document.createElement('div');
  bubble.className = 'bot-bubble';
  bubble.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  div.appendChild(av);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  if(role === 'user') showBotChips([]);
  BOT_HISTORY.push({role: role === 'bot' ? 'assistant' : 'user', content: text});
}

function showBotChips(chips){
  var el = document.getElementById('botChips');
  if(!el) return;
  el.innerHTML = '';
  chips.forEach(function(chip){
    var btn = document.createElement('button');
    btn.className = 'bot-chip';
    btn.textContent = chip;
    btn.onclick = function(){ sendBotMsg(chip); };
    el.appendChild(btn);
  });
}

function sendBotMsg(text){
  if(BOT_LOADING) return;
  var inp = document.getElementById('botInput');
  var msg = text || (inp ? inp.value.trim() : '');
  if(!msg) return;
  if(inp) inp.value = '';
  addBotMsg('user', msg);
  showBotChips([]);
  botThink(msg);
}

function botThink(userMsg){
  BOT_LOADING = true;
  var send = document.getElementById('botSend');
  var typing = document.getElementById('botTyping');
  if(send) send.disabled = true;
  if(typing) typing.classList.add('show');
  setTimeout(function(){
    BOT_LOADING = false;
    if(send) send.disabled = false;
    if(typing) typing.classList.remove('show');
    var reply = typeof getBotReply === 'function' ? getBotReply(userMsg) : {text:'Спроси меня о финансах!',chips:[]};
    addBotMsg('bot', reply.text);
    if(reply.chips && reply.chips.length) showBotChips(reply.chips);
  }, 500 + Math.random() * 400);
}
