# Книга заклинаний — D&D 5e (2014) + Laserllama

Сайт для сравнения официальных заклинаний D&D 5e (редакция 2014, 14 книг, 525 заклинаний) с хоумбрю Laserllama
(«Compendium of Spells» v.0.5, 122 заклинания, из них 77 — альтернативные версии официальных). Весь сайт закрыт паролем.

## Как устроено

- Интерфейс: Preact + TypeScript + Vite (`src/`), хостинг — GitHub Pages, деплой через GitHub Actions
  (`.github/workflows/pages.yml`) при каждом push в `main`.
- Данные публикуются только в зашифрованном виде: `src/data/spells.bin` (AES-256-GCM, ключ из пароля через
  PBKDF2-SHA256, 600 000 итераций). Браузер расшифровывает файл после ввода пароля и запоминает ключ, повторно
  пароль не спрашивается. Исходные тексты официальных книг в репозиторий не попадают (см. `.gitignore`).
- Источники: английский текст и параметры официальных заклинаний — 5etools; русский текст — ttg.club;
  Laserllama — извлечено из PDF (`scripts/extract_laserllama.py` → `data/laserllama/spells.en.json`);
  русский перевод Laserllama и Linked Glyphs — `data/translations/out/` (неофициальный).
- `scripts/build-data.mjs` собирает всё в `data/build/spells.json` и проверяет, что текст не потерялся.

## Команды

```sh
npm install
npm run fetch          # скачать исходные данные (5etools, ttg.club), кэшируется в data/vendor
npm run data           # собрать данные и зашифровать их в src/data/spells.bin
npm run dev            # локально: http://localhost:5173
npm run set-password   # новый пароль (или: npm run set-password -- "свой пароль"), затем npm run data и push
npm run smoke -- <url> <пароль>   # проверка сайта в браузере
```

Секреты (соль и ключ шифрования, хеши) хранятся только в `.env.local`, которого нет в репозитории.
После смены пароля все браузеры попросят ввести новый.

## Вариант с сервером (Yandex Cloud)

В `api/` и `scripts/deploy.mjs` остался вариант с сервером: Cloud Function + YDB Serverless + API Gateway
(`npm run deploy:yandex`). Сайт на GitHub Pages его не использует.
