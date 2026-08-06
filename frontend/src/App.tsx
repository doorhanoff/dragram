import React, { useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api'
import {
  generateKeypairFull, storeKeypair, loadKeypair, exportPublicKey,
  deriveSharedKey, generateGroupKey, encryptGroupKey, decryptGroupKey,
  encryptMessage, decryptMessage, encryptKeyBackup, decryptKeyBackup, checkPeerKey,
} from './crypto'
import { syncChatKey, syncNames, clearNativeKeys, clearChatNotifications } from './nativeKeys'

import Auth              from './components/Auth'
import Sidebar           from './components/layout/Sidebar'
import BottomNav         from './components/layout/BottomNav'
import ChatList          from './components/chat/ChatList'
import ChatView          from './components/chat/ChatView'
import PostList          from './components/posts/PostList'
import PostFeed          from './components/posts/PostFeed'
import PostThread        from './components/posts/PostThread'
import CreatePostModal   from './components/posts/CreatePostModal'
import ProfileModal      from './components/ui/ProfileModal'
import MyProfileModal    from './components/ui/MyProfileModal'
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

async function decryptMsgs(msgs: Message[], key: any): Promise<Message[]> {
  if (!key) return msgs
  return Promise.all(msgs.map(async m => {
    if (m.type !== 'text') return m
    const result = await decryptMessage(m.text, key)
    // key_changed: ключи изменились — текст недоступен, но это не атака
    const text = result.status === 'key_changed'
      ? '🔒 [сообщение зашифровано другим ключом]'
      : result.text ?? m.text
    return { ...m, text, _msgStatus: result.status }
  }))
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const { dark } = useTheme()
  const [user,          setUser]          = useState<User | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [chats,         setChats]         = useState<Chat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [messages,      setMessages]      = useState<Record<string, Message[]>>({})
  const [activeTab,     setActiveTab]     = useState<NavSection>('chats')
  const [activePostId,  setActivePostId]  = useState<string | null>(null)
  const [showCreate,     setShowCreate]    = useState(false)
  const [postFeedKey,    setFeedKey]       = useState(0)
  const [showMyProfile,  setShowMyProfile] = useState(false)
  const [postQuery,     setPostQuery]     = useState('')
  const [postFilter,    setPostFilter]    = useState<'all'|'friends'|'saved'>('all')
  const [mobileScreen,  setMobileScreen]  = useState<'list'|'detail'>('list')
  const [albums,        setAlbums]        = useState<Album[]>([])
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null)

  const wsRef          = useRef<WebSocket | null>(null)
  const wsRetryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeChatRef  = useRef<string | null>(null)
  const loadedChats    = useRef(new Set<string>())
  const keyPairRef     = useRef<any>(null)
  const chatKeysRef    = useRef(new Map<string, any>())
  const myPubKeyRef    = useRef<string | null>(null)  // base64 публичный ключ для safety number
  const chatsRef       = useRef<Chat[]>([])
  const userIdRef      = useRef<string | null>(null)

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

  /**
   * Смена ключевой пары E2EE — если прежний ключ скомпрометирован или забыт
   * пароль от бэкапа. Раньше ключ записывался на сервере ровно один раз, и
   * сменить его можно было только правкой базы.
   *
   * Цена операции: переписка, зашифрованная старым ключом, не расшифруется
   * ни у вас, ни у собеседников. Личные чаты продолжат работать сразу (общий
   * ключ выводится из ключей обеих сторон), групповые — когда любой участник
   * откроет чат и выдаст вам ключ заново.
   */
  const rotateKeys = useCallback(async (password: string) => {
    const userId = userIdRef.current
    if (!userId) throw new Error('Не загружен профиль')

    const { privateKey, publicKey, jwk } = await generateKeypairFull()
    const pub = await exportPublicKey(publicKey)
    const backup = await encryptKeyBackup(jwk, password)

    // Сначала сервер: если он откажет (неверный пароль), локальные ключи
    // должны остаться прежними, иначе доступ к переписке потеряется зря.
    await api.rotateKeys(password, pub, backup)

    await storeKeypair(userId, { privateKey, publicKey })
    keyPairRef.current = { privateKey, publicKey }
    myPubKeyRef.current = pub
    chatKeysRef.current.clear()
    loadedChats.current.clear()
    clearNativeKeys()
    setMessages({})
  }, [])

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
  useEffect(() => {
    api.getMe()
      .then(async (u: User) => {
        // Тикет на медиа берём до первой отрисовки: без него ссылки на
        // картинки не подписаны, и хранилище их не отдаст.
        await api.ensureMediaTicket().catch(() => {})
        setUser(u); userIdRef.current = u.id
        await setupCrypto(u.id, null)
        loadChats()
      })
      .catch(() => {})
      .finally(() => setLoading(false))
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
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, chatIdsKey])

  // Статус "в сети" хранится в Redis по TTL (см. AuthService.set_user_online) —
  // без периодического heartbeat он погаснет через минуту после входа
  useEffect(() => {
    if (!user) return
    api.heartbeat().catch(() => {})
    const id = setInterval(() => { api.heartbeat().catch(() => {}) }, 25000)
    return () => clearInterval(id)
  }, [user])

  const loadAlbums = useCallback(async () => {
    try { setAlbums(await api.getAlbums() || []) } catch {}
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

      if (key && data.type === 'text') {
        const result = await decryptMessage(data.text, key)
        _msgStatus = result.status
        text = result.status === 'key_changed'
          ? '🔒 [сообщение зашифровано другим ключом]'
          : result.text ?? data.text
      }

      setMessages(prev => {
        const list = prev[chatId] || []
        const incoming = { ...data, text, _msgStatus }
        // Эхо собственного сообщения: заменяем оптимистично показанное
        // (сопоставление по client_id), чтобы не было дубля
        const idx = data.client_id ? list.findIndex(m => m.client_id === data.client_id) : -1
        const next = idx >= 0 ? list.map((m, i) => i === idx ? incoming : m) : [...list, incoming]
        return { ...prev, [chatId]: next }
      })
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
      const msgs  = await api.getMessages(chatId).catch(() => [])
      const key   = chatKeysRef.current.get(chatId)
      const dec   = await decryptMsgs(msgs || [], key)
      setMessages(prev => ({ ...prev, [chatId]: dec }))
    }

    connectWS(chatId)
  }, [connectWS])

  // ── Send ──────────────────────────────────────────────────────────────────
  // Возвращает false, если сообщение НЕ ушло (сокет переподключается) —
  // вызывающий не должен очищать поле ввода, иначе текст молча потеряется
  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const chatId = activeChatRef.current
    if (!chatId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false
    const key = chatKeysRef.current.get(chatId)
    const enc = key ? await encryptMessage(text, key) : text
    const clientId = crypto.randomUUID()
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
        _msgStatus: 'pending',
      }],
    }))
    try {
      wsRef.current.send(JSON.stringify({ text: enc, client_id: clientId }))
    } catch {
      setMessages(prev => ({
        ...prev,
        [chatId]: (prev[chatId] || []).filter(m => m.client_id !== clientId),
      }))
      return false
    }
    return true
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
      await openChat(chat.id, chat)
    } catch (err: any) { alert('Ошибка: ' + err.message) }
  }, [openChat])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    if (wsRetryTimer.current) clearTimeout(wsRetryTimer.current)
    wsRef.current?.close(); activeChatRef.current = null
    loadedChats.current.clear(); chatKeysRef.current.clear()
    clearNativeKeys()
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
  if (!user) return <Auth onLogin={handleLogin} />

  const chatPanel = (
    <ChatList
      user={user}
      chats={chats}
      activeChatId={currentChatId}
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
      onBack={() => setMobileScreen('list')}
      onStartChat={(uid) => startChat(uid)}
    />
  )

  const postPanel = (
    <PostList
      filter={postFilter}
      onFilter={setPostFilter}
      query={postQuery}
      onQuery={setPostQuery}
      onCreatePost={() => setShowCreate(true)}
    />
  )

  const postMain = activePostId
    ? <PostThread postId={activePostId} userId={user.id} onBack={() => { setActivePostId(null); setMobileScreen('list') }} />
    : <PostFeed key={`${postFeedKey}-${postFilter}`} query={postQuery} filter={postFilter} onSelectPost={id => { setActivePostId(id); setMobileScreen('detail') }} onCreatePost={() => setShowCreate(true)} />

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
    <div className="flex-1 hidden md:flex items-center justify-center text-muted text-sm">
      Выберите альбом
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      {/* Desktop */}
      <div className="hidden md:flex flex-1 min-h-0">
        <Sidebar user={user} active={activeTab} onNavigate={setActiveTab} onLogout={logout} onProfile={() => setShowMyProfile(true)} />
        {activeTab === 'chats' ? <>{chatPanel}{chatMain}</> : activeTab === 'posts' ? <>{postPanel}{postMain}</> : <>{albumsPanel}{albumsMain}</>}
      </div>

      {/* Mobile */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {mobileScreen === 'list' ? (
            activeTab === 'chats' ? chatPanel : activeTab === 'posts' ? (
              <PostFeed key={`${postFeedKey}-${postFilter}`} query={postQuery} filter={postFilter} onSelectPost={id => { setActivePostId(id); setMobileScreen('detail') }} onCreatePost={() => setShowCreate(true)} onQuery={setPostQuery} onFilter={setPostFilter} />
            ) : albumsPanel
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
          <BottomNav active={activeTab} onNavigate={s => { setActiveTab(s); setMobileScreen('list') }} onProfile={() => setShowMyProfile(true)}
            unread={chats.reduce((sum, c) => sum + (c.unread_count || 0), 0)} />
        )}
      </div>

      {showCreate && (
        <CreatePostModal onClose={() => setShowCreate(false)} onCreate={() => { setShowCreate(false); setFeedKey(k => k + 1) }} />
      )}

      {showMyProfile && user && (
        <MyProfileModal
          userId={user.id}
          onClose={() => setShowMyProfile(false)}
          onLogout={() => { setShowMyProfile(false); logout() }}
          onRotateKeys={rotateKeys}
        />
      )}

    </div>
  )
}
