/**
 * Локальный кеш переписки.
 *
 * Зачем: раньше история жила только в памяти вкладки. Свернул приложение,
 * Android выгрузил WebView — и при следующем открытии чат пустой, пока не
 * ответит сервер. Без сети история недоступна вовсе.
 *
 * ЧТО ИМЕННО ХРАНИМ — ключевое решение: сообщения кладутся **в том виде, в
 * каком пришли с сервера, то есть зашифрованными**. Расшифровка происходит
 * при чтении, в памяти. Так на диске телефона не оказывается ничего, чего
 * не знал бы сервер: обещание «переписку читаете только вы двое» остаётся
 * верным даже для того, кто получил доступ к файлам приложения.
 *
 * Плата — расшифровка сотни сообщений при открытии чата. Это единицы
 * миллисекунд на AES-GCM, разницы на глаз нет.
 *
 * Кеш привязан к пользователю и стирается при выходе: на общем телефоне
 * следующий вошедший не должен видеть чужую переписку.
 */

const DB_NAME = 'dragram_cache'
const STORE = 'messages'
// Столько сообщений на чат держим локально. Больше нужно редко: при
// прокрутке вверх история всё равно догружается с сервера.
const MAX_PER_CHAT = 100

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

/** Ключ включает пользователя: на одном телефоне может входить не один человек. */
function cacheKey(userId: string, chatId: string) {
  return `${userId}:${chatId}`
}

export async function readCachedMessages(userId: string, chatId: string): Promise<any[]> {
  if (!userId || !chatId) return []
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(cacheKey(userId, chatId))
      req.onsuccess = e => resolve((e.target as IDBRequest).result?.items ?? [])
      req.onerror = e => reject((e.target as IDBRequest).error)
    })
  } catch {
    // Кеш — ускорение, а не источник правды: любая его поломка не должна
    // мешать открыть чат.
    return []
  }
}

export async function writeCachedMessages(userId: string, chatId: string, items: any[]): Promise<void> {
  if (!userId || !chatId) return
  try {
    const db = await openDB()
    // Храним только хвост: начало истории всё равно подгружается с сервера.
    const tail = items.slice(-MAX_PER_CHAT)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ items: tail, savedAt: Date.now() }, cacheKey(userId, chatId))
      tx.oncomplete = () => resolve()
      tx.onerror = e => reject((e.target as IDBTransaction).error)
    })
  } catch {
    // Не смогли сохранить (нет места, приватный режим) — не беда.
  }
}

/**
 * Дописывает одно пришедшее сообщение. Эхо собственного сообщения
 * сопоставляется по client_id — как и в интерфейсе, чтобы в кеше не осталось
 * дубля оптимистично показанного.
 */
export async function appendCachedMessage(userId: string, chatId: string, msg: any): Promise<void> {
  if (!userId || !chatId || !msg) return
  // Дописывания выстраиваются в очередь: это «прочитал — изменил — записал»,
  // и два сообщения подряд, начав одновременно, затёрли бы друг друга.
  _writeQueue = _writeQueue.then(async () => {
    const items = await readCachedMessages(userId, chatId)
    const idx = msg.client_id ? items.findIndex((m: any) => m.client_id === msg.client_id) : -1
    if (idx >= 0) items[idx] = msg
    else if (!items.some((m: any) => m.id && m.id === msg.id)) items.push(msg)
    else return
    await writeCachedMessages(userId, chatId, items)
  }).catch(() => {})
  return _writeQueue
}

let _writeQueue: Promise<void> = Promise.resolve()

/** Убирает удалённое сообщение — иначе оно вернётся при чтении из кеша. */
export async function dropCachedMessage(chatId: string, messageId: string): Promise<void> {
  // userId здесь вызывающему неизвестен (событие приходит из сокета), поэтому
  // проходим по всем ключам этого чата: их максимум столько, сколько
  // аккаунтов входило с устройства.
  //
  // Каждое чтение и запись — своя транзакция. Держать одну на весь цикл
  // нельзя: транзакция IndexedDB закрывается, как только управление уходит
  // в микрозадачу, то есть на первом же await.
  try {
    const db = await openDB()
    const keys: IDBValidKey[] = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys()
      req.onsuccess = e => resolve((e.target as IDBRequest).result || [])
      req.onerror = e => reject((e.target as IDBRequest).error)
    })
    const suffix = `:${chatId}`
    for (const key of keys) {
      if (typeof key !== 'string' || !key.endsWith(suffix)) continue
      const userId = key.slice(0, -suffix.length)
      const items = await readCachedMessages(userId, chatId)
      const next = items.filter((m: any) => m.id !== messageId)
      if (next.length !== items.length) await writeCachedMessages(userId, chatId, next)
    }
  } catch {}
}

/** Полностью стирает кеш. Вызывается при выходе из аккаунта. */
export async function clearMessageCache(): Promise<void> {
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
