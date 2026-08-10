/**
 * Кеш списков: альбомы, посты, комментарии.
 *
 * Картинки и переписка уже живут на устройстве, а вот списки — нет: без сети
 * альбом открывался пустым, лента — тоже. Сохраняем сами ответы сервера, и
 * экран сразу показывает то, что было в прошлый раз.
 *
 * Отдельная база от переписки (`dragram_cache`) намеренно: две базы не спорят
 * за номер версии. Если бы один модуль открыл общую базу с версией 1, а
 * другой с версией 2, второй бы просто упал.
 *
 * Здесь только то, что и так приходит с сервера в открытом виде: описания
 * альбомов, посты, комментарии. Ничего зашифрованного тут нет — за это
 * отвечает messageCache, и там всё хранится как есть, шифротекстом.
 */

const DB_NAME = 'dragram_data'
const STORE = 'entries'
/** Через сутки запись считаем протухшей: лучше пустой экран, чем вчерашний. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = e => reject((e.target as IDBOpenDBRequest).error)
  })
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    const rec: any = await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      r.onsuccess = e => resolve((e.target as IDBRequest).result)
      r.onerror = e => reject((e.target as IDBRequest).error)
    })
    if (!rec) return null
    if (Date.now() - rec.savedAt > MAX_AGE_MS) return null
    return rec.value as T
  } catch {
    return null
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ value, savedAt: Date.now() }, key)
      tx.oncomplete = () => resolve()
      tx.onerror = e => reject((e.target as IDBTransaction).error)
    })
  } catch {}
}

/**
 * Выбрасывает протухшие записи.
 *
 * Само чтение и так не отдаёт устаревшее, но записи при этом оставались
 * лежать: удалённый альбом или чат, в который больше не заходят, занимали
 * место вечно. Пройтись курсором дешевле, чем городить индекс по дате.
 */
export async function sweepDataCache(): Promise<number> {
  try {
    const db = await openDB()
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const cutoff = Date.now() - MAX_AGE_MS
      let removed = 0
      const req = store.openCursor()
      req.onsuccess = e => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null
        if (!cursor) return
        const rec = cursor.value
        if (!rec || typeof rec.savedAt !== 'number' || rec.savedAt < cutoff) {
          cursor.delete()
          removed++
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve(removed)
      tx.onerror = e => reject((e.target as IDBTransaction).error)
    })
  } catch {
    return 0
  }
}

/**
 * Уборка всех кешей разом — вызывается при запуске, но не чаще раза в сутки.
 *
 * Чаще незачем: сроки жизни здесь измеряются сутками и неделями, а каждый
 * проход — это обход двух хранилищ на устройстве, которое и так небыстрое.
 */
const SWEPT_AT_KEY = 'dragram_cache_swept_at'
const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000

export async function sweepCaches(force = false): Promise<void> {
  try {
    const last = Number(localStorage.getItem(SWEPT_AT_KEY) || 0)
    if (!force && Date.now() - last < SWEEP_EVERY_MS) return
    localStorage.setItem(SWEPT_AT_KEY, String(Date.now()))
  } catch {}
  const { sweepMediaCache } = await import('./mediaCache')
  await Promise.all([sweepDataCache(), sweepMediaCache()])
}

export async function clearDataCache(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = e => reject((e.target as IDBTransaction).error)
    })
  } catch {}
}

/**
 * Показать сохранённое, затем обновить с сервера.
 *
 * Гонка здесь неочевидная: чтение из базы может ответить ПОЗЖЕ сети — тогда
 * старые данные затёрли бы только что полученные свежие. Поэтому кеш
 * применяется, только если сеть ещё не ответила.
 *
 * Сеть не ответила совсем — остаёмся на кеше, это и есть работа без сети.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  apply: (value: T) => void,
): Promise<void> {
  let gotFresh = false
  readCache<T>(key).then(cached => {
    if (cached != null && !gotFresh) apply(cached)
  })
  try {
    const fresh = await fetcher()
    gotFresh = true
    apply(fresh)
    writeCache(key, fresh)
  } catch {
    // Нет сети — на экране остаётся сохранённое.
  }
}
