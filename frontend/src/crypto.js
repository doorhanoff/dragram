// ── IndexedDB ──────────────────────────────────────────────────────────────

const DB_NAME = 'dragram_e2ee'
const STORE   = 'keys'

async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess  = e => resolve(e.target.result)
    req.onerror    = e => reject(e.target.error)
  })
}

async function dbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

async function dbSet(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function b64enc(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function b64dec(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

// ── Keypair ────────────────────────────────────────────────────────────────

/**
 * Генерирует ECDH-пару.
 * Приватный ключ — extractable: false (XSS не сможет его экспортировать).
 * Возвращает { privateKey, publicKey, jwk } где jwk — сырой JWK приватного ключа,
 * нужен ОДИН РАЗ для создания бэкапа, после чего должен быть уничтожен (GC).
 */
export async function generateKeypairFull() {
  // Шаг 1: генерируем с extractable: true чтобы получить JWK
  const { privateKey: extractablePriv, publicKey } = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )

  // Шаг 2: экспортируем JWK пока есть доступ
  const jwk = await crypto.subtle.exportKey('jwk', extractablePriv)

  // Шаг 3: реимпортируем как NON-EXTRACTABLE — теперь JS не может его украсть
  const privateKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,   // ← XSS не получит ключ через exportKey()
    ['deriveKey', 'deriveBits']
  )

  return { privateKey, publicKey, jwk }
}

// Обратная совместимость для старого кода
export async function generateKeypair() {
  const { privateKey, publicKey } = await generateKeypairFull()
  return { privateKey, publicKey }
}

function userKey(userId, name) {
  if (!userId) throw new Error('userId is required for key storage')
  return `${name}:${userId}`
}

export async function storeKeypair(userId, { privateKey, publicKey }) {
  await dbSet(userKey(userId, 'privateKey'), privateKey)
  await dbSet(userKey(userId, 'publicKey'),  publicKey)
}

export async function loadKeypair(userId) {
  const privateKey = await dbGet(userKey(userId, 'privateKey'))
  const publicKey  = await dbGet(userKey(userId, 'publicKey'))
  if (!privateKey || !publicKey) return null
  return { privateKey, publicKey }
}

export async function exportPublicKey(publicKey) {
  const raw = await crypto.subtle.exportKey('raw', publicKey)
  return b64enc(raw)
}

export async function importPublicKey(base64) {
  return crypto.subtle.importKey(
    'raw', b64dec(base64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  )
}

// ── Safety Number (fingerprint для верификации out-of-band) ────────────────

/**
 * Вычисляет Safety Number — SHA-256 от отсортированных публичных ключей обоих участников.
 * Оба пользователя получат одинаковый номер → можно сверить лично.
 */
export async function computeSafetyNumber(myPublicKeyBase64, theirPublicKeyBase64) {
  // Сортируем чтобы обе стороны получили одинаковый результат
  const keys = [myPublicKeyBase64, theirPublicKeyBase64].sort()
  const combined = new TextEncoder().encode(keys.join(':'))
  const hash  = await crypto.subtle.digest('SHA-256', combined)
  const bytes = new Uint8Array(hash)
  // Форматируем как 12 групп по 5 цифр (как в Signal)
  const digits = Array.from(bytes.slice(0, 30))
    .map(b => b.toString().padStart(3, '0').slice(0, 2))
    .join('')
  return (digits.match(/.{1,5}/g) || []).join(' ')
}

// ── Личный чат: shared key через ECDH ─────────────────────────────────────

export async function deriveSharedKey(myPrivateKey, theirPublicKeyBase64) {
  const theirKey = await importPublicKey(theirPublicKeyBase64)
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// ── Групповой чат: ключ K ──────────────────────────────────────────────────

export async function generateGroupKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptGroupKey(K, recipientPublicKeyBase64) {
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
  )
  const recipientKey = await importPublicKey(recipientPublicKeyBase64)
  const wrapKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientKey },
    ephemeral.privateKey,
    { name: 'AES-GCM', length: 256 },
    false, ['wrapKey']
  )
  const iv      = crypto.getRandomValues(new Uint8Array(12))
  const wrapped = await crypto.subtle.wrapKey('raw', K, wrapKey, { name: 'AES-GCM', iv })
  const epkRaw  = await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  return btoa(JSON.stringify({ epk: b64enc(epkRaw), iv: b64enc(iv), ct: b64enc(wrapped) }))
}

export async function decryptGroupKey(encryptedBase64, myPrivateKey) {
  const { epk, iv, ct } = JSON.parse(atob(encryptedBase64))
  const ephemeralPublicKey = await crypto.subtle.importKey(
    'raw', b64dec(epk), { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )
  const unwrapKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: ephemeralPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, ['unwrapKey']
  )
  return crypto.subtle.unwrapKey(
    'raw', b64dec(ct), unwrapKey,
    { name: 'AES-GCM', iv: b64dec(iv) },
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  )
}

// ── Бэкап приватного ключа (PBKDF2 + AES-GCM) ────────────────────────────

/**
 * Шифрует JWK приватного ключа паролем.
 * Принимает jwk (объект или строку) — НЕ CryptoKey,
 * поэтому работает с non-extractable ключами (JWK получается при генерации).
 */
export async function encryptKeyBackup(privateKeyJwkOrKey, password) {
  let jwkStr
  if (typeof privateKeyJwkOrKey === 'string') {
    jwkStr = privateKeyJwkOrKey
  } else if (privateKeyJwkOrKey && typeof privateKeyJwkOrKey === 'object' && privateKeyJwkOrKey.kty) {
    // Уже JWK объект
    jwkStr = JSON.stringify(privateKeyJwkOrKey)
  } else {
    // CryptoKey — попытка экспорта (для обратной совместимости)
    const jwk = await crypto.subtle.exportKey('jwk', privateKeyJwkOrKey)
    jwkStr = JSON.stringify(jwk)
  }

  const salt    = crypto.getRandomValues(new Uint8Array(16))
  const iv      = crypto.getRandomValues(new Uint8Array(12))
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveKey']
  )
  const aesKey  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt']
  )
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(jwkStr)
  )
  return btoa(JSON.stringify({ salt: b64enc(salt), iv: b64enc(iv), ct: b64enc(ct) }))
}

/**
 * Расшифровывает бэкап.
 * Возвращает { privateKey, publicKey } — приватный ключ NON-EXTRACTABLE.
 */
export async function decryptKeyBackup(backupBase64, password) {
  const { salt, iv, ct } = JSON.parse(atob(backupBase64))
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveKey']
  )
  const aesKey  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64dec(salt), iterations: 250_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  )
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64dec(iv) }, aesKey, b64dec(ct)
  )
  const jwk = JSON.parse(new TextDecoder().decode(decrypted))

  // Импортируем как NON-EXTRACTABLE
  const privateKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,   // ← non-extractable после восстановления
    ['deriveKey', 'deriveBits']
  )
  const { d: _d, key_ops: _ops, ...pubJwk } = jwk
  const publicKey = await crypto.subtle.importKey(
    'jwk', { ...pubJwk, key_ops: [] },
    { name: 'ECDH', namedCurve: 'P-256' },
    true, []
  )
  return { privateKey, publicKey }
}

// ── Шифрование сообщений ───────────────────────────────────────────────────

export async function encryptMessage(text, aesKey) {
  const iv         = crypto.getRandomValues(new Uint8Array(12))
  const encoded    = new TextEncoder().encode(text)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded)
  return btoa(JSON.stringify({ iv: b64enc(iv), ct: b64enc(ciphertext) }))
}

/**
 * Расшифровывает сообщение.
 * Возвращает { text, status }:
 *   status = 'ok'           — успешно расшифровано
 *   status = 'unencrypted'  — старое незашифрованное сообщение (до E2EE)
 *   status = 'failed'       — не удалось расшифровать (возможна атака подмены)
 *   status = 'no_key'       — нет ключа
 */
export async function decryptMessage(encryptedBase64, aesKey) {
  if (!aesKey) return { text: encryptedBase64, status: 'no_key' }

  // Проверяем формат: зашифрованный blob — это base64(JSON{iv, ct})
  let parsed
  try {
    parsed = JSON.parse(atob(encryptedBase64))
  } catch {
    // Не base64 / не JSON → однозначно незашифрованный текст
    return { text: encryptedBase64, status: 'unencrypted' }
  }

  if (!parsed.iv || !parsed.ct) {
    // JSON есть, но не наш формат → незашифрованный
    return { text: encryptedBase64, status: 'unencrypted' }
  }

  // Попытка расшифровки
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64dec(parsed.iv) },
      aesKey,
      b64dec(parsed.ct)
    )
    return { text: new TextDecoder().decode(decrypted), status: 'ok' }
  } catch {
    // AES-GCM authentication tag не совпал.
    // Наиболее вероятная причина: ключи шифрования изменились (смена устройства,
    // очистка браузера). Реальная атака — крайне редкий случай.
    return { text: null, status: 'key_changed' }
  }
}
