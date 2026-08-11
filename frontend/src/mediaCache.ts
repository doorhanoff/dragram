/**
 * Кеш картинок, видео и голосовых на устройстве.
 *
 * Зачем: ссылка на файл подписана и живёт 15 минут, поэтому одно и то же фото
 * скачивалось заново каждый раз, когда прокрутишь чат спустя четверть часа.
 * Плюс без сети не открывалось ничего, даже уже просмотренное.
 *
 * Ключ кеша — **путь файла в хранилище** (`uploads/<uuid>.jpg`), а не полный
 * адрес: в адресе есть подпись и тикет, которые меняются, и по нему кеш
 * никогда бы не совпал.
 *
 * Размер ограничен: без потолка кеш растёт, пока Android не начнёт сам
 * выкидывать данные приложения — а выкинет он заодно и ключи шифрования.
 * При переполнении вытесняем то, что дольше всего не открывали.
 */

const DB_NAME = 'dragram_media'
const STORE = 'files'
const META = 'meta'
/** Потолок кеша. Примерно как «средний» в популярных мессенджерах. */
const MAX_BYTES = 200 * 1024 * 1024

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = e => reject((e.target as IDBOpenDBRequest).error)
  })
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key)
    r.onsuccess = e => resolve((e.target as IDBRequest).result)
    r.onerror = e => reject((e.target as IDBRequest).error)
  })
}

function idbPut(db: IDBDatabase, store: string, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = e => reject((e.target as IDBTransaction).error)
  })
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = e => reject((e.target as IDBTransaction).error)
  })
}

/** Путь файла в хранилище — устойчивая часть адреса, годная как ключ кеша. */
export function storageKey(url: string): string | null {
  if (!url) return null
  const i = url.indexOf('/uploads/')
  if (i === -1) return null
  return url.slice(i + 1).split('?')[0]
}

type Index = Record<string, { size: number; usedAt: number }>

async function readIndex(db: IDBDatabase): Promise<Index> {
  return (await idbGet<Index>(db, META, 'index')) || {}
}

/**
 * Вытесняет самые давно не открывавшиеся файлы, пока кеш не влезет в потолок.
 * Считаем по нашему же индексу, а не по реальному размеру базы: точности
 * хватает, а лишних обходов хранилища нет.
 */
async function evictIfNeeded(db: IDBDatabase, index: Index): Promise<Index> {
  let total = Object.values(index).reduce((s, v) => s + v.size, 0)
  if (total <= MAX_BYTES) return index

  const byAge = Object.entries(index).sort((a, b) => a[1].usedAt - b[1].usedAt)
  for (const [key, meta] of byAge) {
    if (total <= MAX_BYTES) break
    await idbDelete(db, STORE, key)
    delete index[key]
    total -= meta.size
  }
  return index
}

/**
 * Готовые ссылки на уже поднятые с устройства файлы.
 *
 * Хранилище на устройстве отвечает не мгновенно, а blob-ссылка живёт только
 * пока её не отозвали. Раньше каждый компонент делал ссылку себе и отзывал её
 * при размонтировании — стоило прокрутить список и вернуться, как аватарка
 * читалась заново и на кадр пропадала. Отсюда и ощущение, что картинка
 * подгружается каждый раз.
 *
 * Держим по одной ссылке на файл на всё приложение и не отзываем, пока не
 * упрёмся в потолок. Сами блобы в памяти при этом не лежат: ссылка — это
 * указатель, браузер поднимает данные по требованию.
 */
const liveUrls = new Map<string, string>()
const MAX_LIVE_URLS = 400

export function getLiveUrl(key: string): string | undefined {
  return liveUrls.get(key)
}

export function putLiveUrl(key: string, blob: Blob): string {
  const existing = liveUrls.get(key)
  if (existing) return existing
  const objectUrl = URL.createObjectURL(blob)
  liveUrls.set(key, objectUrl)
  // Map помнит порядок вставки — вытесняем самые давние.
  if (liveUrls.size > MAX_LIVE_URLS) {
    for (const [k, v] of liveUrls) {
      if (liveUrls.size <= MAX_LIVE_URLS) break
      if (k === key) continue
      URL.revokeObjectURL(v)
      liveUrls.delete(k)
    }
  }
  return objectUrl
}

/** Отпускает все ссылки — при выходе из аккаунта и очистке кеша. */
export function releaseLiveUrls(): void {
  for (const v of liveUrls.values()) URL.revokeObjectURL(v)
  liveUrls.clear()
}

/** Отдаёт файл из кеша или null. */
export async function getCachedMedia(url: string): Promise<Blob | null> {
  const key = storageKey(url)
  if (!key) return null
  try {
    const db = await openDB()
    const blob = await idbGet<Blob>(db, STORE, key)
    if (!blob) return null
    // Отмечаем обращение: вытеснение опирается на этот срок.
    const index = await readIndex(db)
    if (index[key]) {
      index[key].usedAt = Date.now()
      await idbPut(db, META, 'index', index)
    }
    return blob
  } catch {
    return null
  }
}

/** Кладёт скачанный файл в кеш. Ошибки не важны: кеш — ускорение, не хранилище. */
export async function putCachedMedia(url: string, blob: Blob): Promise<void> {
  const key = storageKey(url)
  if (!key || !blob?.size) return
  try {
    const db = await openDB()
    await idbPut(db, STORE, key, blob)
    const index = await readIndex(db)
    index[key] = { size: blob.size, usedAt: Date.now() }
    await idbPut(db, META, 'index', await evictIfNeeded(db, index))
  } catch {
    // Кончилось место — не беда, просто останемся без кеша для этого файла.
  }
}

/**
 * Выбрасывает файлы, которые давно не открывали.
 *
 * Потолка по размеру мало: пока кеш не упёрся в 200 МБ, в нём вечно лежат
 * картинки из чатов, куда больше не заходят, — а это фотографии семьи на
 * устройстве, которое могут потерять. Месяц без обращения — достаточный срок,
 * чтобы считать файл ненужным: понадобится снова — скачается.
 */
const MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000

export async function sweepMediaCache(maxIdleMs = MAX_IDLE_MS): Promise<number> {
  try {
    const db = await openDB()
    const index = await readIndex(db)
    const cutoff = Date.now() - maxIdleMs
    let removed = 0
    for (const [key, meta] of Object.entries(index)) {
      if (meta.usedAt >= cutoff) continue
      await idbDelete(db, STORE, key)
      delete index[key]
      removed++
    }
    if (removed) await idbPut(db, META, 'index', index)
    return removed
  } catch {
    return 0
  }
}

/** Сколько сейчас занято, в байтах — для экрана настроек. */
export async function cacheSize(): Promise<number> {
  try {
    const db = await openDB()
    const index = await readIndex(db)
    return Object.values(index).reduce((s, v) => s + v.size, 0)
  } catch {
    return 0
  }
}

/** Очистка кеша: и по кнопке в настройках, и при выходе из аккаунта. */
export async function clearMediaCache(): Promise<void> {
  releaseLiveUrls()
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META], 'readwrite')
      tx.objectStore(STORE).clear()
      tx.objectStore(META).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = e => reject((e.target as IDBTransaction).error)
    })
  } catch {}
}
