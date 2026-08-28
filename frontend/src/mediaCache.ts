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

/**
 * Соединение с базой — одно на всё приложение.
 *
 * Раньше indexedDB.open вызывался на каждую картинку: список чатов с двумя
 * десятками аватарок открывал базу двадцать раз подряд, и они появлялись
 * по одной, будто скачиваются заново.
 */
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    req.onsuccess = e => {
      const db = (e.target as IDBOpenDBRequest).result
      // Соединение могут закрыть снаружи (очистка данных приложения,
      // смена версии) — тогда следующий вызов откроет заново.
      db.onclose = () => { dbPromise = null }
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    req.onerror = e => reject((e.target as IDBOpenDBRequest).error)
  })
  // Неудачную попытку не запоминаем, иначе кеш отвалится навсегда.
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key)
    r.onsuccess = e => resolve((e.target as IDBRequest).result)
    r.onerror = e => reject((e.target as IDBRequest).error)
  })
}

/**
 * Читает пачку ключей за ОДНУ транзакцию.
 *
 * Каждая транзакция в хранилище — отдельный круг ожидания, и на телефоне он
 * стоит куда дороже самого чтения. Двадцать аватарок списка чатов — это
 * двадцать таких кругов подряд, если просить их по одной.
 */
function idbGetMany<T>(db: IDBDatabase, store: string, keys: string[]): Promise<Map<string, T>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, T>()
    const tx = db.transaction(store, 'readonly')
    const os = tx.objectStore(store)
    for (const key of keys) {
      const r = os.get(key)
      r.onsuccess = e => {
        const value = (e.target as IDBRequest).result
        if (value !== undefined) out.set(key, value)
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = e => reject((e.target as IDBTransaction).error)
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

/**
 * Правки индекса копятся в памяти и уходят в базу одной пачкой.
 *
 * Индекс — один объект со всеми записями, и переписывается он целиком. Раньше
 * это делалось на КАЖДУЮ картинку: и когда её показали, и когда скачали.
 * Открыть альбом на тридцать фотографий значило тридцать раз прочитать и
 * тридцать раз переписать весь индекс, по очереди, в том же хранилище, откуда
 * читаются сами картинки. Точность тут не нужна: срок последнего обращения
 * важен с точностью до дней, а не секунд.
 */
const touched = new Set<string>()
const pendingSizes = new Map<string, number>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
/** Проходы идут по очереди — см. flushIndex. */
let flushing: Promise<void> = Promise.resolve()

function scheduleIndexFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => { flushIndex() }, 2000)
}

/**
 * Два прохода разом переписали бы индекс поверх друг друга: второй прочитал бы
 * его раньше, чем первый успел записать, и правки первого пропали бы. Поэтому
 * выстраиваем их в очередь.
 */
function flushIndex(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  flushing = flushing.then(writeIndexChanges)
  return flushing
}

async function writeIndexChanges(): Promise<void> {
  if (!touched.size && !pendingSizes.size) return
  const added = [...pendingSizes]; pendingSizes.clear()
  const used  = [...touched];      touched.clear()
  try {
    const db = await openDB()
    const index = await readIndex(db)
    const now = Date.now()
    for (const [key, size] of added) index[key] = { size, usedAt: now }
    for (const key of used) if (index[key]) index[key].usedAt = now
    await idbPut(db, META, 'index', await evictIfNeeded(db, index))
  } catch {
    // Не записалось — файлы на месте, потеряется только их учёт в размере.
  }
}

/**
 * Приложение уходит в фон — дописываем индекс немедленно.
 *
 * Android сворачивает и убивает приложение без предупреждения, а отложенная
 * запись живёт две секунды. Без этого только что скачанный файл остался бы в
 * хранилище неучтённым: место занимает, а вытеснение о нём не знает.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushIndex()
  })
  window.addEventListener('pagehide', () => { flushIndex() })
}

/**
 * Поднимает пачку файлов с устройства ЗАРАНЕЕ — до того, как их попросят
 * нарисовать.
 *
 * Это главное, чем список здесь отличался от телеграмовского. Там путь к файлу
 * известен сразу, и картинка попадает в тот же кадр, что и строка списка.
 * Здесь же каждая картинка начинала свой путь, только когда её компонент уже
 * нарисовался пустым: хранилище отвечает не мгновенно, ответ приходит
 * следующим кадром — отсюда и волна «догружающихся» аватарок при первом
 * заходе в раздел.
 *
 * Поэтому список чатов, альбомы и ленту прогреваем перед показом: одна
 * транзакция на всё, и к первой отрисовке ссылки уже лежат в памяти.
 */
export async function warmLiveUrls(urls: (string | null | undefined)[]): Promise<number> {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    if (!url) continue
    const key = storageKey(url)
    // Уже поднятые пропускаем — прогрев зовётся и на обновлениях списка.
    if (!key || seen.has(key) || liveUrls.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  if (!keys.length) return 0
  try {
    const db = await openDB()
    const found = await idbGetMany<Blob>(db, STORE, keys)
    for (const [key, blob] of found) {
      if (!blob?.size) continue
      putLiveUrl(key, blob)
      touched.add(key)
    }
    if (found.size) scheduleIndexFlush()
    return found.size
  } catch {
    // Не поднялось — картинки просто пойдут прежним путём, по одной.
    return 0
  }
}

/** Отдаёт файл из кеша или null. */
export async function getCachedMedia(url: string): Promise<Blob | null> {
  const key = storageKey(url)
  if (!key) return null
  try {
    const db = await openDB()
    const blob = await idbGet<Blob>(db, STORE, key)
    if (!blob) return null
    touched.add(key)
    scheduleIndexFlush()
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
    // Сам файл записан, а учёт в индексе уйдёт пачкой: при загрузке альбома
    // таких файлов десятки, и переписывать весь индекс на каждый — как раз то,
    // из-за чего первая загрузка и была медленной.
    pendingSizes.set(key, blob.size)
    scheduleIndexFlush()
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
    // Сначала дописываем отложенное, иначе только что скачанный файл в индексе
    // ещё не значится, а после уборки запись о нём легла бы уже поверх итога.
    await flushIndex()
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
  // Отложенные правки выбрасываем, а не дописываем: иначе через две секунды
  // после «Очистить кеш» в индекс вернулись бы записи о стёртых файлах.
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  touched.clear()
  pendingSizes.clear()
  // Проход, который успел начаться, тоже дожидаемся — он уже забрал свою
  // порцию правок и допишет их поверх очищенного индекса.
  await flushing.catch(() => {})
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
