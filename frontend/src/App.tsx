import React, { useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api'
import {
  generateKeypairFull, storeKeypair, loadKeypair, exportPublicKey,
  deriveSharedKey, generateGroupKey, encryptGroupKey, decryptGroupKey,
  encryptMessage, decryptMessage, encryptKeyBackup, decryptKeyBackup, checkPeerKey,
} from './crypto'
import { syncChatKey, syncNames, clearNativeKeys, clearChatNotifications } from './nativeKeys'
import { canReadContacts, collectContactHashes } from './nativeContacts'
import { readCachedMessages, writeCachedMessages, appendCachedMessage, dropCachedMessage, clearMessageCache } from './messageCache'
import { clearMediaCache } from './mediaCache'
import { withCache, clearDataCache } from './dataCache'
import { showToast } from './utils'

import Auth              from './components/Auth'
import Gate              from './components/Gate'
import Sidebar           from './components/layout/Sidebar'
import BottomNav         from './components/layout/BottomNav'
import ChatList          from './components/chat/ChatList'
import ChatView          from './components/chat/ChatView'
import PostFeed          from './components/posts/PostFeed'
import PostThread        from './components/posts/PostThread'
import CreatePostModal   from './components/posts/CreatePostModal'
import ProfileScreen     from './components/ui/ProfileScreen'
import ContactsIntro     from './components/ui/ContactsIntro'
import { sayError }       from './components/ui/dialogs'
import AlbumsList        from './components/albums/AlbumsList'
import AlbumGallery      from './components/albums/AlbumGallery'

import { consumeBack } from './hooks/useBackHandler'
import { useTheme } from './theme'

import type { User, Chat, Message, NavSection, Album } from './types'

// ── Crypto helpers ────────────────────────────────────────────────────────

async function resolveChatKey(chat: Chat, myId: string, kp: any) {
  const members = chat.members || []
  if (members.length === 2) {
    const other = members.find(m => String(m.id) !== String(myId))
    if (!other) return null
    const { public_key } = await api.getUserPublicKey(other.id)
    // Запоминаем ключ собеседника при первой встрече: смену потом видно
    // в его профиле (там же сверяется номер безопасности).
    if (await checkPeerKey(myId, other.id, public_key) === 'changed') {
      console.warn('Публичный ключ собеседника изменился:', other.id)
    }
    return deriveSharedKey(kp.privateKey, public_key)
  } else {
    const { encrypted_key } = await api.getMyChatKey(chat.id)
    return decryptGroupKey(encrypted_key, kp.privateKey)
  }
}

/**
 * Выдаёт ключ группового чата тем участникам, у кого его ещё нет.
 *
 * Сервер хранит ключ чата зашифрованным под каждого участника отдельно и сам
 * расшифровать его не может — значит, и выдать новому получателю тоже. Это
 * делает любой клиент, у которого ключ уже есть. Нужно после смены ключевой
 * пары: старые строки при смене удаляются, иначе человек остался бы в группе
 * без доступа к переписке навсегда.
 */
async function shareGroupKeyWithNewcomers(chatId: string, K: any) {
  try {
    const missing: string[] = await api.getMembersWithoutKeys(chatId)
    if (!missing?.length) return
    const keys = (await Promise.all(missing.map(async uid => {
      try {
        const { public_key } = await api.getUserPublicKey(uid)
        return { user_id: uid, encrypted_key: await encryptGroupKey(K, public_key) }
      } catch { return null }   // у человека ещё нет своего ключа — не наша беда
    }))).filter(Boolean)
    if (keys.length) await api.setChatKeys(chatId, keys)
  } catch {
    // Не критично: попробуем в следующий раз при открытии чата.
  }
}

/** Текст, который показывается вместо нерасшифрованного сообщения.
 *  Слова «ключ» и «E2EE» человеку ничего не говорят, а тревогу вызывают —
 *  подпись рисует MessageBubble по статусу, здесь остаётся шифротекст. */
async function decryptMsgs(msgs: Message[], key: any): Promise<Message[]> {
  if (!key) return msgs
  return Promise.all(msgs.map(async m => {
    if (m.type !== 'text') return m
    const result = await decryptMessage(m.text, key)
    const dec = { ...m, text: result.text ?? m.text, _msgStatus: result.status }
    // Цитата зашифрована тем же ключом чата — расшифровываем заодно, иначе
    // в ответе была бы строка base64.
    if (m.reply_to && m.reply_to.type === 'text') {
      const quoted = await decryptMessage(m.reply_to.text, key)
      dec.reply_to = { ...m.reply_to, text: quoted.text ?? m.reply_to.text }
    }
    return dec
  }))
}

/** Строка под именем чата: «Вы: …», «Мама: …», «📷 Фото». */
async function buildPreview(chat: Chat, myId: string, key: any): Promise<string> {
  const last = chat.last_message
  if (!last) return (chat.members?.length || 0) > 2 ? 'Группа создана' : 'Пока ни одного сообщения'

  let body: string
  if (last.type === 'image') body = '📷 Фото'
  else if (last.type === 'video') body = '🎥 Видео'
  else if (last.type === 'audio') body = '🎵 Голосовое сообщение'
  else if (!key) body = 'Сообщение'
  else {
    const res = await decryptMessage(last.text, key)
    body = res.status === 'key_changed' || !res.text ? 'Сообщение' : res.text
  }

  const isGroup = (chat.members?.length || 0) > 2
  if (String(last.sender_id) === String(myId)) return `Вы: ${body}`
  if (isGroup && last.sender_name) return `${last.sender_name}: ${body}`
  return body
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const { dark } = useTheme()
  const [user,          setUser]          = useState<User | null>(null)
  const [loading,       setLoading]       = useState(true)
  // null — ещё не спрашивали сервер; false — дверь закрыта
  const [gateOk,        setGateOk]        = useState<boolean | null>(null)
  const [chats,         setChats]         = useState<Chat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [messages,      setMessages]      = useState<Record<string, Message[]>>({})
  const [activeTab,     setActiveTab]     = useState<NavSection>('chats')
  const [activePostId,  setActivePostId]  = useState<string | null>(null)
  const [showCreate,     setShowCreate]    = useState(false)
  const [postFeedKey,    setFeedKey]       = useState(0)
  const [postQuery,     setPostQuery]     = useState('')
  const [showSaved,     setShowSaved]     = useState(false)
  const [mobileScreen,  setMobileScreen]  = useState<'list'|'detail'>('list')
  const [albums,        setAlbums]        = useState<Album[]>([])
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null)
  // Расшифрованные превью последних сообщений: ключи чатов есть только здесь.
  const [previews,      setPreviews]      = useState<Record<string, string>>({})
  const [keysVersion,   setKeysVersion]   = useState(0)
  const [askContacts,   setAskContacts]   = useState(false)

  const wsRef          = useRef<WebSocket | null>(null)
  const wsRetryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeChatRef  = useRef<string | null>(null)
  const loadedChats    = useRef(new Set<string>())
  const keyPairRef     = useRef<any>(null)
  const chatKeysRef    = useRef(new Map<string, any>())
  const myPubKeyRef    = useRef<string | null>(null)  // base64 публичный ключ для safety number
  const chatsRef       = useRef<Chat[]>([])
  const userIdRef      = useRef<string | null>(null)
  // Актуальная лента для цитат: sendMessage не должен зависеть от messages,
  // иначе колбэк пересоздаётся на каждое сообщение.
  const messagesRef    = useRef<Record<string, Message[]>>({})

  useEffect(() => {
    Promise.all([import('@capacitor/status-bar'), import('@capacitor/core')]).then(
      ([{ StatusBar, Style }, { Capacitor }]) => {
        // Style.Light = тёмные иконки (для светлого фона), Style.Dark = светлые иконки
        // (для тёмного фона) — названия говорят про ЦВЕТ ФОНА, под который подобран стиль,
        // а не про цвет самих иконок. Раньше стоял Style.Dark всегда, поэтому на светлой
        // теме время/вайфай/батарея были белыми и почти не видны.
        const style = dark ? Style.Dark : Style.Light
        if (Capacitor.getPlatform() === 'android') {
          // На Android edge-to-edge включён принудительно (targetSdk 35+),
          // overlaysWebView ничего не меняет — резервируем место вручную.
          // 24dp ~ стандартная высота статус-бара на Android (Pixel и большинство устройств).
          StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
          document.documentElement.style.setProperty('--status-bar-height', '24px')
          StatusBar.setStyle({ style }).catch(() => {})
        } else {
          StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
          StatusBar.setStyle({ style }).catch(() => {})
        }
      }
    ).catch(() => {})
  }, [dark])

  useEffect(() => { chatsRef.current = chats }, [chats])
  useEffect(() => { userIdRef.current = user?.id || null }, [user])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Аппаратная/жестовая кнопка "назад" на Android: сначала закрываем открытый
  // оверлей (модалку/лайтбокс), затем возвращаемся из чата/поста/альбома к списку,
  // и только потом сворачиваем приложение — как в обычных Android-приложениях.
  const mobileScreenRef = useRef(mobileScreen)
  useEffect(() => { mobileScreenRef.current = mobileScreen }, [mobileScreen])

  useEffect(() => {
    let removeListener: (() => void) | undefined
    Promise.all([import('@capacitor/app'), import('@capacitor/core')]).then(
      ([{ App: CapApp }, { Capacitor }]) => {
        if (Capacitor.getPlatform() !== 'android') return
        CapApp.addListener('backButton', () => {
          if (consumeBack()) return
          if (mobileScreenRef.current === 'detail') {
            setMobileScreen('list')
            setActivePostId(null)
            setActiveAlbumId(null)
            return
          }
          CapApp.exitApp()
        }).then(handle => { removeListener = () => handle.remove() })
      }
    ).catch(() => {})
    return () => removeListener?.()
  }, [])

  // push-уведомления (только Android)
  useEffect(() => {
    if (!user) return
    import('./push').then(({ initPushNotifications }) => initPushNotifications()).catch(() => {})
  }, [user?.id])

  // auth:expired
  useEffect(() => {
    const h = () => {
      if (wsRetryTimer.current) clearTimeout(wsRetryTimer.current)
      wsRef.current?.close(); activeChatRef.current = null
      loadedChats.current.clear(); chatKeysRef.current.clear()
      clearNativeKeys()
      setUser(null); setChats([]); setCurrentChatId(null); setMessages({})
    }
    window.addEventListener('auth:expired', h)
    return () => window.removeEventListener('auth:expired', h)
  }, [])

  // ── Crypto setup ──────────────────────────────────────────────────────────
  // password — пароль аккаунта (передаётся при логине/регистрации)
  // При перезагрузке страницы password=null, ключи берутся из IndexedDB
  async function createAndBackupKeypair(userId: string, password: string) {
    const { privateKey, publicKey, jwk } = await generateKeypairFull()
    const kp = { privateKey, publicKey }
    await storeKeypair(userId, kp)
    keyPairRef.current = kp
    chatKeysRef.current.clear()
    loadedChats.current.clear()

    const pub = await exportPublicKey(publicKey)
    myPubKeyRef.current = pub
    await api.setPublicKey(pub).catch(() => {})

    const enc = await encryptKeyBackup(jwk, password)
    await api.setKeyBackup(enc)
    return kp
  }

  async function setupCrypto(userId: string, password: string | null, isNewAccount = false) {
    try {
      if (isNewAccount) {
        if (!password) return
        await createAndBackupKeypair(userId, password)
        return
      }

      // 1. Ключи есть в IndexedDB — используем их
      let kp = await loadKeypair(userId)
      if (kp) {
        keyPairRef.current = kp
        const pub = await exportPublicKey(kp.publicKey)
        myPubKeyRef.current = pub
        return
      }

      // IndexedDB пуст — нужен пароль для работы с бэкапом
      if (!password) { setUser(null); return }

      // 2. Проверяем бэкап на сервере
      const backupRes = await api.getKeyBackup().catch(() => null)

      if (backupRes?.key_backup) {
        // Новое устройство — расшифровываем бэкап паролем аккаунта
        try {
          kp = await decryptKeyBackup(backupRes.key_backup, password)
          await storeKeypair(userId, kp)
          keyPairRef.current = kp
          chatKeysRef.current.clear()
          loadedChats.current.clear()
          const pub = await exportPublicKey(kp.publicKey)
          myPubKeyRef.current = pub
          return
        } catch {
          // Неверный пароль или повреждённый бэкап — генерируем новые ключи
        }
      }

      // 3. Новый пользователь или повреждённый бэкап — генерируем ключи
      await createAndBackupKeypair(userId, password)

      // Сразу создаём бэкап зашифрованный паролем аккаунта — без модалов
    } catch (e) {
      console.error('Crypto setup failed:', e)
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    try {
      const u: User = await api.getMe()
      // Тикет на медиа берём до первой отрисовки: без него ссылки на
      // картинки не подписаны, и хранилище их не отдаст.
      await api.ensureMediaTicket().catch(() => {})
      setUser(u); userIdRef.current = u.id
      await setupCrypto(u.id, null)
      loadChats()
    } catch {
      // Не вошли — покажется форма входа
    }
  }, [])

  useEffect(() => {
    api.gateStatus()
      .then(async (s: { unlocked: boolean }) => {
        setGateOk(s.unlocked)
        if (s.unlocked) await loadSession()
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [loadSession])

  // Пропуск протух прямо во время работы — возвращаемся к двери.
  useEffect(() => {
    const h = () => setGateOk(false)
    window.addEventListener('gate:required', h)
    return () => window.removeEventListener('gate:required', h)
  }, [])

  // Тикет живёт час — обновляем его, пока приложение открыто.
  useEffect(() => {
    if (!user) return
    const id = setInterval(() => { api.ensureMediaTicket().catch(() => {}) }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [user])

  const loadChats = useCallback(async () => {
    try {
      const list: Chat[] = await api.getChats() || []
      setChats(list)
      // Справочник имён для push-уведомлений: сервер шлёт только id, имя
      // подставляет само устройство (см. nativeKeys.syncNames).
      const names: Record<string, string> = {}
      for (const chat of list) {
        const members = chat.members || []
        for (const m of members) names[m.id] = m.name
        // Для личного чата «название» — имя собеседника.
        const other = members.find(m => String(m.id) !== String(userIdRef.current))
        const title = chat.name || (members.length <= 2 ? other?.name : null)
        if (title) names[chat.id] = title
      }
      syncNames(names)
    } catch {}
  }, [])

  /**
   * Ищет знакомых по телефонной книге и сразу заводит с ними чаты.
   *
   * Наружу уходят только хеши номеров: адресная книга — это данные людей,
   * которые про Dragram ничего не знают и согласия не давали. Разрешение
   * спрашивается системным окном; отказ ничего не ломает и больше не
   * донимает — повторить можно кнопкой в своём профиле.
   */
  const syncContacts = useCallback(async (silent = true) => {
    if (!canReadContacts()) return
    // Флаг ставим ДО проверки на отказ: раньше он записывался только при
    // успехе, и отказавшегося человека спрашивали снова при каждом запуске.
    localStorage.setItem('contacts_synced', '1')
    try {
      const hashes = await collectContactHashes()
      if (!hashes) {
        if (!silent) showToast('Доступ к контактам не разрешён')
        return
      }
      if (!hashes.length) {
        if (!silent) showToast('В телефонной книге нет подходящих номеров')
        return
      }
      const { matched } = await api.discoverContacts(hashes)
      if (matched.length) {
        await loadChats()
        showToast(`Знакомых найдено: ${matched.length}`)
      } else if (!silent) {
        showToast('Из ваших контактов пока никого нет в Dragram')
      }
    } catch (e: any) {
      if (!silent) showToast('Не удалось синхронизировать контакты')
      console.warn('Синхронизация контактов не удалась:', e)
    }
  }, [loadChats])

  // При первом входе спрашиваем СВОИМ экраном, а системное окно показываем
  // только после согласия. Дальше — только по кнопке в профиле: молча
  // перечитывать телефонную книгу каждый запуск ни к чему.
  useEffect(() => {
    if (!user || !canReadContacts() || localStorage.getItem('contacts_synced')) return
    setAskContacts(true)
  }, [user])

  // Периодически обновляем список чатов, чтобы счётчики непрочитанных были актуальны
  useEffect(() => {
    if (!user) return
    const id = setInterval(loadChats, 15000)
    return () => clearInterval(id)
  }, [user, loadChats])

  // Отдаём нативному коду ключи ВСЕХ чатов, а не только открытых: push может
  // прийти из чата, который на этом устройстве ещё ни разу не открывали,
  // и расшифровать текст уведомления будет нечем.
  // Зависимость — список id, а не сам массив: иначе эффект перезапускался бы
  // на каждом опросе loadChats каждые 15 секунд.
  const chatIdsKey = chats.map(c => c.id).join(',')
  useEffect(() => {
    if (!user || !keyPairRef.current) return
    let cancelled = false
    ;(async () => {
      for (const chat of chatsRef.current) {
        if (cancelled || !keyPairRef.current) return
        // Уже в chatKeysRef — значит ключ синхронизировали при его получении.
        if (chatKeysRef.current.has(chat.id)) continue
        const key = await resolveChatKey(chat, userIdRef.current!, keyPairRef.current).catch(() => null)
        if (!key) continue
        chatKeysRef.current.set(chat.id, key)
        await syncChatKey(chat.id, key)
        // Ключ появился — превью в списке чатов пора пересчитать: до этого
        // на его месте стояло безликое «Сообщение».
        if (!cancelled) setKeysVersion(v => v + 1)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, chatIdsKey])

  // Превью последних сообщений для списка чатов. Сервер отдаёт их такими же
  // зашифрованными, как хранит, — расшифровать может только этот клиент.
  // Зависимость — id последних сообщений: пересчитываем, когда что-то
  // действительно пришло, а не каждые 15 секунд на том же наборе.
  const lastMsgKey = chats.map(c => `${c.id}:${c.last_message?.id || ''}`).join(',')
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const next: Record<string, string> = {}
      for (const chat of chatsRef.current) {
        const key = chatKeysRef.current.get(chat.id)
        next[chat.id] = await buildPreview(chat, user.id, key).catch(() => '')
      }
      if (!cancelled) setPreviews(next)
    })()
    return () => { cancelled = true }
  }, [user?.id, lastMsgKey, chatIdsKey, keysVersion])

  // Статус "в сети" хранится в Redis по TTL (см. AuthService.set_user_online) —
  // без периодического heartbeat он погаснет через минуту после входа
  useEffect(() => {
    if (!user) return
    api.heartbeat().catch(() => {})
    const id = setInterval(() => { api.heartbeat().catch(() => {}) }, 25000)
    return () => clearInterval(id)
  }, [user])

  const loadAlbums = useCallback(async () => {
    const myId = userIdRef.current
    if (!myId) return
    await withCache<Album[]>(`albums:${myId}`, async () => (await api.getAlbums()) || [], setAlbums)
  }, [])

  useEffect(() => {
    if (activeTab === 'albums' && albums.length === 0) loadAlbums()
  }, [activeTab, albums.length, loadAlbums])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const connectWS = useCallback(async (chatId: string, attempt = 0) => {
    wsRef.current?.close()
    // Если задан VITE_WS_URL — используем его (нужно для Capacitor/мобильного)
    // Иначе определяем по текущему хосту
    let wsBase = import.meta.env.VITE_WS_URL as string | undefined
    if (!wsBase) {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const host  = import.meta.env.DEV ? 'localhost:8000' : location.host
      wsBase = `${proto}://${host}`
    }

    // Одноразовый тикет вместо токена в адресе: query-строка попадает в
    // access-логи nginx, и JWT оттуда можно было бы просто взять и
    // использовать. Тикет живёт 30 секунд и гасится при подключении.
    let ticket: string | null = null
    try {
      ticket = (await api.getWsTicket()).ticket
    } catch {
      // Не смогли получить пропуск (нет сети, протух токен) — пробуем позже
      // тем же backoff'ом, что и при обрыве соединения.
      if (activeChatRef.current !== chatId) return
      const delay = Math.min(3000 * 2 ** attempt, 30000) + Math.random() * 1000
      wsRetryTimer.current = setTimeout(() => connectWS(chatId, attempt + 1), delay)
      return
    }
    // Пока ходили за тикетом, пользователь мог уйти в другой чат.
    if (activeChatRef.current !== chatId) return

    const wsUrl = `${wsBase.replace(/\/$/, '')}/chats/ws/${chatId}?ticket=${encodeURIComponent(ticket)}`
    const ws = new WebSocket(wsUrl)
    let didConnect = false

    ws.onopen = () => { didConnect = true }

    ws.onmessage = async e => {
      const data = JSON.parse(e.data)

      if (data.event === 'read') {
        const ids = new Set<string>(data.message_ids)
        setMessages(prev => ({ ...prev, [chatId]: (prev[chatId] || []).map(m => ids.has(m.id!) ? { ...m, is_read: true } : m) }))
        return
      }
      if (data.event === 'delete') {
        setMessages(prev => ({ ...prev, [chatId]: (prev[chatId] || []).filter(m => m.id !== data.message_id) }))
        // Из кеша тоже: иначе удалённое сообщение вернётся при следующем
        // открытии чата без сети.
        dropCachedMessage(chatId, data.message_id)
        return
      }
      if (data.event === 'error') {
        // Сервер отвечает ошибкой вместо разрыва соединения — например,
        // когда сработал лимит на частоту сообщений.
        console.warn('Сервер отклонил событие:', data.status, data.detail)
        return
      }

      if (activeChatRef.current === chatId) api.markRead(chatId).catch(() => {})

      const key = chatKeysRef.current.get(chatId)
      let text = data.text
      let _msgStatus = 'no_key'
      let replyTo = data.reply_to || null

      if (key && data.type === 'text') {
        const result = await decryptMessage(data.text, key)
        _msgStatus = result.status
        text = result.text ?? data.text
      }
      // Цитата зашифрована тем же ключом чата.
      if (key && replyTo && replyTo.type === 'text') {
        const quoted = await decryptMessage(replyTo.text, key)
        replyTo = { ...replyTo, text: quoted.text ?? replyTo.text }
      }

      setMessages(prev => {
        const list = prev[chatId] || []
        const incoming = { ...data, text, _msgStatus, reply_to: replyTo }
        // Эхо собственного сообщения: заменяем оптимистично показанное
        // (сопоставление по client_id), чтобы не было дубля
        const idx = data.client_id ? list.findIndex(m => m.client_id === data.client_id) : -1
        const next = idx >= 0 ? list.map((m, i) => i === idx ? incoming : m) : [...list, incoming]
        return { ...prev, [chatId]: next }
      })
      // В кеш кладём data как пришло — с нерасшифрованным текстом.
      appendCachedMessage(userIdRef.current!, chatId, data)
    }

    ws.onclose = () => {
      if (activeChatRef.current !== chatId) return
      // Экспоненциальный backoff с джиттером (сброс, если до этого успели подключиться) —
      // без него любой временный сбой на бэкенде превращается в реконнект-шторм
      // каждые 3 секунды со всех открытых чатов разом.
      const failStreak = didConnect ? 0 : attempt
      const delay = Math.min(3000 * 2 ** failStreak, 30000) + Math.random() * 1000
      wsRetryTimer.current = setTimeout(() => connectWS(chatId, failStreak + 1), delay)
    }
    wsRef.current = ws
  }, [])

  // Гарантированная очистка сокета при размонтировании компонента (в т.ч. при
  // Vite HMR — иначе новый инстанс получает свежий wsRef и не знает про сокет,
  // открытый предыдущим, и тот остаётся висеть на сервере никем не закрытый).
  useEffect(() => {
    return () => {
      activeChatRef.current = null
      if (wsRetryTimer.current) clearTimeout(wsRetryTimer.current)
      wsRef.current?.close()
    }
  }, [])

  // ── Open chat ─────────────────────────────────────────────────────────────
  const openChat = useCallback(async (chatId: string, chatObj?: Chat) => {
    setCurrentChatId(chatId); activeChatRef.current = chatId; setMobileScreen('detail')
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c))

    clearChatNotifications(chatId)

    if (keyPairRef.current && !chatKeysRef.current.has(chatId)) {
      const chat = chatObj || chatsRef.current.find(c => c.id === chatId)
      if (chat) {
        const key = await resolveChatKey(chat, userIdRef.current!, keyPairRef.current).catch(() => null)
        if (key) {
          chatKeysRef.current.set(chatId, key)
          syncChatKey(chatId, key)
        }
      }
    }

    // Кому-то из группы ключ ещё не выдан — например, человек сменил ключевую
    // пару, и его строка была удалена. Раздать ключ может только клиент:
    // у сервера его нет и быть не должно.
    const groupKey = chatKeysRef.current.get(chatId)
    const groupChat = chatObj || chatsRef.current.find(c => c.id === chatId)
    if (groupKey && groupChat && (groupChat.members?.length || 0) > 2) {
      shareGroupKeyWithNewcomers(chatId, groupKey)
    }

    if (!loadedChats.current.has(chatId)) {
      loadedChats.current.add(chatId)
      const myId = userIdRef.current!
      const key  = chatKeysRef.current.get(chatId)

      // Сначала показываем то, что уже лежит на устройстве: чат открывается
      // мгновенно и читается без сети. В кеше сообщения зашифрованы, как и
      // пришли с сервера, — расшифровываем здесь, в памяти.
      const cached = await readCachedMessages(myId, chatId)
      if (cached.length) {
        // Расшифровываем ДО показа: иначе на миг мелькнёт шифротекст.
        const decCached = await decryptMsgs(cached, key)
        setMessages(prev => ({ ...prev, [chatId]: decCached }))
      }

      // Затем спрашиваем сервер. Не ответил (нет сети) — остаётся кеш.
      const msgs = await api.getMessages(chatId).catch(() => null)
      if (msgs) {
        const dec = await decryptMsgs(msgs, key)
        setMessages(prev => ({ ...prev, [chatId]: dec }))
        writeCachedMessages(myId, chatId, msgs)
      }
    }

    connectWS(chatId)
  }, [connectWS])

  // ── Send ──────────────────────────────────────────────────────────────────
  // Возвращает false, если сообщение НЕ ушло (сокет переподключается) —
  // вызывающий не должен очищать поле ввода, иначе текст молча потеряется
  const sendMessage = useCallback(async (text: string, replyToId?: string | null): Promise<boolean> => {
    const chatId = activeChatRef.current
    if (!chatId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false
    const key = chatKeysRef.current.get(chatId)
    const enc = key ? await encryptMessage(text, key) : text
    const clientId = crypto.randomUUID()
    // Цитату для оптимистичного показа берём из уже расшифрованной ленты —
    // ходить за ней на сервер не нужно, эхо всё равно принесёт настоящую.
    const quoted = replyToId
      ? (messagesRef.current[chatId] || []).find(m => m.id === replyToId)
      : undefined
    // Оптимистично показываем своё сообщение сразу; эхо от сервера
    // заменит его настоящим (сопоставление по client_id в ws.onmessage)
    setMessages(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), {
        client_id: clientId,
        text,
        type: 'text' as const,
        sender_id: userIdRef.current || undefined,
        is_read: false,
        date: new Date().toISOString(),
        reply_to_id: replyToId || null,
        reply_to: quoted ? {
          id: quoted.id!,
          text: quoted.text,
          type: quoted.type,
          sender_id: quoted.sender_id || quoted.writer || '',
          sender_name: quoted.sender_name ?? null,
        } : null,
        _msgStatus: 'pending',
      }],
    }))
    try {
      wsRef.current.send(JSON.stringify({ text: enc, client_id: clientId, reply_to_id: replyToId || null }))
    } catch {
      setMessages(prev => ({
        ...prev,
        [chatId]: (prev[chatId] || []).filter(m => m.client_id !== clientId),
      }))
      return false
    }
    return true
  }, [])

  /**
   * Переслать текст в другой чат.
   *
   * Просто переложить шифротекст нельзя: у каждого чата свой ключ, и в чужом
   * чате блоб нечем открыть. Расшифровываем своим, зашифровываем ключом
   * получателя — сервер обоих не видит.
   */
  const forwardText = useCallback(async (targetChatId: string, plainText: string) => {
    let key = chatKeysRef.current.get(targetChatId)
    if (!key && keyPairRef.current) {
      const target = chatsRef.current.find(c => c.id === targetChatId)
      if (target) {
        key = await resolveChatKey(target, userIdRef.current!, keyPairRef.current).catch(() => null)
        if (key) { chatKeysRef.current.set(targetChatId, key); syncChatKey(targetChatId, key) }
      }
    }
    const enc = key ? await encryptMessage(plainText, key) : plainText
    await api.forwardMessage(targetChatId, { text: enc, type: 'text' })
  }, [])

  // ── Start chat ────────────────────────────────────────────────────────────
  const startChat = useCallback(async (userId: string | null, data?: any) => {
    try {
      const isGroup = !userId
      const payload = isGroup ? { members: data.members, name: data.name } : { members: [userId], name: null }
      let chat = await api.createChat(payload)
      if (isGroup && data?.photo) chat = await api.uploadChatPhoto(chat.id, data.photo)
      if (isGroup && keyPairRef.current) {
        const allIds = [...new Set<string>([...data.members, userIdRef.current!])]
        const K = await generateGroupKey()

        // Сохраняем K локально СРАЗУ — независимо от того, удалось ли загрузить на сервер
        chatKeysRef.current.set(chat.id, K)
        syncChatKey(chat.id, K)

        const keys = (await Promise.all(allIds.map(async (uid: string) => {
          try {
            const { public_key } = await api.getUserPublicKey(uid)
            return { user_id: uid, encrypted_key: await encryptGroupKey(K, public_key) }
          } catch { return null }
        }))).filter(Boolean)

        // Загружаем на сервер только если хотя бы один участник имеет public_key
        if (keys.length) await api.setChatKeys(chat.id, keys).catch(() => {})
      }
      setChats(prev => prev.find(c => c.id === chat.id) ? prev.map(c => c.id === chat.id ? chat : c) : [chat, ...prev])
      setActiveTab('chats')
      await openChat(chat.id, chat)
    } catch (err) { sayError('Не удалось начать чат', err) }
  }, [openChat])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    if (wsRetryTimer.current) clearTimeout(wsRetryTimer.current)
    wsRef.current?.close(); activeChatRef.current = null
    loadedChats.current.clear(); chatKeysRef.current.clear()
    clearNativeKeys()
    clearMessageCache()
    clearMediaCache()
    clearDataCache()
    setUser(null); setChats([]); setCurrentChatId(null); setMessages({})
  }, [])

  const handleLogin = useCallback(async (u: User, password: string, isNewAccount = false) => {
    await api.ensureMediaTicket(true).catch(() => {})
    setUser(u); userIdRef.current = u.id
    await setupCrypto(u.id, password, isNewAccount)
    loadChats()
  }, [loadChats])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="w-2 h-2 rounded-full bg-accent animate-bounce" />
    </div>
  )
  // Дверь стоит перед формой входа: пока ответы не даны, приложение не
  // показывает даже её. Настоящая проверка — на сервере, здесь только экран.
  if (gateOk === false) return <Gate onUnlocked={() => { setGateOk(true); loadSession() }} />
  if (!user) return <Auth onLogin={handleLogin} />

  const chatPanel = (
    <ChatList
      user={user}
      chats={chats}
      activeChatId={currentChatId}
      previews={previews}
      onOpenChat={id => { openChat(id); setMobileScreen('detail') }}
      onStartChat={(uid, data) => startChat(uid, data)}
    />
  )

  const chatMain = (
    <ChatView
      chatId={currentChatId}
      chat={chats.find(c => c.id === currentChatId)}
      messages={messages[currentChatId || ''] || []}
      setMessages={setMessages as any}
      userId={user.id}
      onSend={sendMessage}
      onForwardText={forwardText}
      onBack={() => setMobileScreen('list')}
      onStartChat={(uid) => startChat(uid)}
    />
  )

  const feed = (
    <PostFeed
      key={postFeedKey}
      query={postQuery}
      onQuery={setPostQuery}
      onSelectPost={id => { setActivePostId(id); setMobileScreen('detail') }}
      onCreatePost={() => setShowCreate(true)}
    />
  )

  const postMain = activePostId
    ? <PostThread postId={activePostId} userId={user.id} onBack={() => { setActivePostId(null); setMobileScreen('list') }} />
    : feed

  // «Сохранённые» переехали из фильтров ленты в профиль — там их и ищут.
  const profilePanel = showSaved ? (
    <PostFeed
      filter="saved"
      title="Сохранённые"
      query={postQuery}
      onQuery={setPostQuery}
      onSelectPost={id => { setActivePostId(id); setActiveTab('posts'); setShowSaved(false); setMobileScreen('detail') }}
      onBack={() => { setShowSaved(false); setPostQuery('') }}
    />
  ) : (
    <ProfileScreen
      userId={user.id}
      onLogout={logout}
      onOpenSaved={() => { setPostQuery(''); setShowSaved(true) }}
      onSyncContacts={canReadContacts() ? () => syncContacts(false) : undefined}
    />
  )

  const albumsPanel = (
    <AlbumsList
      albums={albums}
      activeAlbumId={activeAlbumId}
      onSelect={id => { setActiveAlbumId(id); setMobileScreen('detail') }}
      onCreated={loadAlbums}
    />
  )

  const albumsMain = activeAlbumId ? (
    <AlbumGallery
      albumId={activeAlbumId}
      onBack={() => { setActiveAlbumId(null); setMobileScreen('list') }}
      onChanged={loadAlbums}
    />
  ) : (
    <div className="flex-1 hidden md:flex items-center justify-center text-muted text-md">
      Выберите альбом
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      {/* Desktop */}
      <div className="hidden md:flex flex-1 min-h-0">
        <Sidebar user={user} active={activeTab} onNavigate={setActiveTab} />
        {activeTab === 'chats'  ? <>{chatPanel}{chatMain}</>
         : activeTab === 'posts' ? postMain
         : activeTab === 'albums' ? <>{albumsPanel}{albumsMain}</>
         : profilePanel}
      </div>

      {/* Mobile */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {mobileScreen === 'list' ? (
            activeTab === 'chats'  ? chatPanel
            : activeTab === 'posts' ? feed
            : activeTab === 'albums' ? albumsPanel
            : profilePanel
          ) : (
            activeTab === 'chats' ? chatMain : activeTab === 'posts' ? (
              <PostThread postId={activePostId} userId={user.id} onBack={() => { setActivePostId(null); setMobileScreen('list') }} />
            ) : (
              activeAlbumId && (
                <AlbumGallery
                  albumId={activeAlbumId}
                  onBack={() => { setActiveAlbumId(null); setMobileScreen('list') }}
                  onChanged={loadAlbums}
                />
              )
            )
          )}
        </div>
        {mobileScreen === 'list' && (
          <BottomNav
            active={activeTab}
            onNavigate={s => { setActiveTab(s); setMobileScreen('list'); setShowSaved(false) }}
            unread={chats.reduce((sum, c) => sum + (c.unread_count || 0), 0)}
          />
        )}
      </div>

      {showCreate && (
        <CreatePostModal onClose={() => setShowCreate(false)} onCreate={() => { setShowCreate(false); setFeedKey(k => k + 1) }} />
      )}

      {askContacts && (
        <ContactsIntro
          onAllow={() => { setAskContacts(false); syncContacts(false) }}
          onSkip={() => {
            setAskContacts(false)
            // Отказ запоминаем в любом случае — второй раз не спрашиваем.
            localStorage.setItem('contacts_synced', '1')
          }}
        />
      )}

    </div>
  )
}
