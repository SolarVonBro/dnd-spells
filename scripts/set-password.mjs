// Sets the site password.
//   npm run set-password                -> generates a random password and prints it once
//   npm run set-password -- "my words"  -> uses the given password
// Stores in .env.local (never the password itself):
//   DATA_SALT / DATA_KEY      AES-256 key derived with PBKDF2 — encrypts the dataset for the static site (GitHub Pages)
//   PASSWORD_HASH / TOKEN_SECRET  for the server variant (Yandex Cloud Function)
// Then: npm run data (re-encrypts the data) and push — every browser will ask for the new password.
import crypto from 'node:crypto';
import { hashPassword, newSecret } from '../api/src/auth.mjs';
import { writeEnvValues, ENV_FILE } from './lib/env.mjs';
import { PBKDF2_ITERATIONS } from './lib/bundle.mjs';

const WORDS = ['дракон', 'гримуар', 'посох', 'руна', 'фамильяр', 'свиток', 'кристалл', 'портал', 'астрал', 'фейри',
  'элементаль', 'грифон', 'феникс', 'тотем', 'оракул', 'чародей', 'сфинкс', 'василиск', 'мантикора', 'химера'];

let password = process.argv.slice(2).join(' ').trim();
const generated = !password;
if (generated) {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  password = `${pick()}-${pick()}-${pick()}-${crypto.randomInt(100, 1000)}`;
}
if (password.length < 8) {
  console.error('Пароль слишком короткий (минимум 8 символов).');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(Buffer.from(password.normalize('NFC'), 'utf8'), salt, PBKDF2_ITERATIONS, 32, 'sha256');
writeEnvValues({
  DATA_SALT: salt.toString('base64url'),
  DATA_KEY: key.toString('base64url'),
  PASSWORD_HASH: hashPassword(password),
  TOKEN_SECRET: newSecret(),
});
console.log(`Ключи сохранены в ${ENV_FILE}.`);
if (generated) console.log(`Новый пароль: ${password}\nЗапишите его: в открытом виде он нигде не хранится.`);
console.log('Чтобы применить: npm run data, затем опубликовать изменения (git push).');
