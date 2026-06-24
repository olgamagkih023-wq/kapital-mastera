/* ═══ app/sw.js — Капитал Мастера ═══
   Офлайн-режим: кэширует оболочку приложения и отдаёт её без сети.
   ВАЖНО: при каждом изменении кода поднимайте версию ниже (v4 → v5 ...),
   иначе у пользователей останется старая версия из кэша. */

var CACHE_NAME = 'kapital-mastera-v4';

// Файлы оболочки — без них приложение не запустится офлайн.
var CORE = [
  '/',
  '/index.html',
  '/booking.html',
  '/offline.html',
  '/app/manifest.json',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png'
];

// Внешние ресурсы (Firebase SDK, шрифты) — кэшируем по возможности.
var EXTERNAL = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      // Оболочку кэшируем обязательно
      return cache.addAll(CORE).then(function(){
        // Внешние — по одному, ошибки не срывают установку
        return Promise.all(EXTERNAL.map(function(url){
          return cache.add(url).catch(function(){ /* офлайн при установке — не страшно */ });
        }));
      });
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k !== CACHE_NAME) return caches.delete(k); // чистим старые версии
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;

  // Не трогаем POST и прочее (сюда же попадают /api/notify и записи Firebase)
  if(req.method !== 'GET') return;

  var url = new URL(req.url);

  // База данных реального времени должна всегда идти в сеть — не кэшируем
  if(/firebaseio\.com$|firebasedatabase\.app$/.test(url.hostname)) return;

  // Навигация (открытие страницы): сначала сеть, при сбое — кэш, затем офлайн-страница
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || caches.match('/index.html') || caches.match('/offline.html');
        });
      })
    );
    return;
  }

  // Остальное (скрипты, шрифты, иконки): сначала кэш, параллельно обновляем из сети
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && (res.status === 200 || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
