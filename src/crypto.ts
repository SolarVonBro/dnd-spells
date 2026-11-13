// Decrypts the data bundle produced by scripts/encrypt-data.mjs (layout in scripts/lib/bundle.mjs).
const MAGIC = 'DND1';

export class WrongPasswordError extends Error {}

type Bytes = Uint8Array<ArrayBuffer>;
interface Header { iterations: number; salt: Bytes; iv: Bytes; body: Bytes }

function parse(buf: ArrayBuffer): Header {
  const b = new Uint8Array(buf);
  if (String.fromCharCode(...b.subarray(0, 4)) !== MAGIC) throw new Error('bad data bundle');
  return {
    iterations: new DataView(buf).getUint32(4),
    salt: b.slice(8, 24),
    iv: b.slice(24, 36),
    body: b.slice(36),
  };
}

/** Derive the AES key from the password (PBKDF2-SHA256, parameters from the bundle). Returns raw key bytes. */
export async function deriveKey(password: string, bundle: ArrayBuffer): Promise<Bytes> {
  const { iterations, salt } = parse(bundle);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

/** Decrypt and decompress the bundle. Throws WrongPasswordError if the key does not fit. */
export async function decryptBundle<T>(bundle: ArrayBuffer, rawKey: Bytes): Promise<T> {
  const { iv, body } = parse(bundle);
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  let gz: ArrayBuffer;
  try {
    gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
  } catch {
    throw new WrongPasswordError('wrong password');
  }
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export const toB64 = (u: Bytes) => btoa(String.fromCharCode(...u));
export const fromB64 = (s: string): Bytes => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
