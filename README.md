# Капитал Мастера — Vercel Deployment

## Способ 1 — Vercel без GitHub (самый простой)

### Установи Vercel CLI
```bash
npm install -g vercel
```

### Разверни из папки
```bash
cd kapital-vercel
vercel
```
Отвечай на вопросы:
- Set up and deploy? → **Y**
- Which scope? → выбери свой аккаунт
- Link to existing project? → **N**
- Project name: → **kapital-mastera**
- In which directory? → **.** (точка = текущая)
- Override settings? → **N**

Получишь ссылку вида `kapital-mastera.vercel.app` ✓

---

## Способ 2 — Через сайт Vercel (без терминала)

1. Зайди на **vercel.com** → войди через GitHub/Google/email
2. Нажми **Add New → Project**
3. Нажми **Import Third-Party Git Repository** или...
4. Если нет GitHub: используй **Vercel CLI** (способ 1)

---

## Способ 3 — GitHub + Vercel (автодеплой)

1. Создай репозиторий на **github.com**
2. Загрузи все файлы из этой папки
3. На **vercel.com** → New Project → Import Git Repository
4. Выбери репозиторий → Framework: **Other** → Deploy
5. При каждом обновлении файлов на GitHub — Vercel деплоит автоматически

---

## Структура файлов
```
kapital-vercel/
├── index.html          ← приложение (SPA)
├── booking.html        ← страница онлайн-записи клиентов
├── offline.html        ← страница офлайн
├── vercel.json         ← конфиг роутинга (ОБЯЗАТЕЛЬНО!)
└── app/
    ├── manifest.json   ← PWA манифест
    ├── sw.js           ← service worker (офлайн)
    └── icons/          ← иконки PWA
```

## После деплоя

- Приложение: `https://kapital-mastera.vercel.app/`
- Запись клиентов: `https://kapital-mastera.vercel.app/booking.html`
- Офлайн страница: автоматически через SW

## Кастомный домен

В Vercel Dashboard → Settings → Domains → Add → введи свой домен
