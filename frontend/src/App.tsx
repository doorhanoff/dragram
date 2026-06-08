import React, { useState, useRef, useCallback, useEffect } from 'react'
import { api } from './api'
import {
  generateKeypairFull, storeKeypair, loadKeypair, exportPublicKey,
  deriveSharedKey, generateGroupKey, encryptGroupKey, decryptGroupKey,
  encryptMessage, decryptMessage, encryptKeyBackup, decryptKeyBackup,
  computeSafetyNumber,
} from './crypto'

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

import type { User, Chat, Message, NavSection } from './types'

// ── Crypto helpers ────────────────────────────────────────────────────────

async function resolveChatKey(chat: Chat, myId: string, kp: any) {
  const members = chat.members || []
  if (members.length === 2) {
    const other = members.find(m => String(m.id) !== String(myId))
    if (!other) return null
    const { public_key } = await api.getUserPublicKey(other.id)
    return deriveSharedKey(kp.privateKey, public_key)
  } else {
    const { encrypted_key } = await api.getMyChatKey(chat.id)
    return decryptGroupKey(encrypted_key, kp.privateKey)
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

  const wsRef          = useRef<WebSocket | null>(null)
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
        if (Capacitor.getPlatform() === 'android') {
          // На Android edge-to-edge включён принудительно (targetSdk 35+),
          // overlaysWebView ничего не меняет — резервируем место вручную.
          // 24dp ~ стандартная высота статус-бара на Android (Pixel и большинство устройств).
          StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
          document.documentElement.style.setProperty('--status-bar-height', '24px')
        } else {
          StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
        }
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
      }
    ).catch(() => {})
  }, [])

  useEffect(() => { chatsRef.current = chats }, [chats])
  useEffect(() => { userIdRef.current = user?.id || null }, [user])

  // auth:expired
  useEffect(() => {
    const h = () => {
      wsRef.current?.close(); activeChatRef.current = null
      loadedChats.current.clear(); chatKeysRef.current.clear()
      setUser(null); setChats([]); setCurrentChatId(null); setMessages({})
    }
    window.addEventListener('auth:expired', h)
    return () => window.removeEventListener('auth:expired', h)
  }, [])

  // offline on unload
  useEffect(() => {
    if (!user) return
    const h = () => api.setOffline().catch(() => {})
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [user?.id])

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
  useEffect(() => {
    api.getMe()
      .then(async (u: User) => {
        setUser(u); userIdRef.current = u.id
        await setupCrypto(u.id, null)
        loadChats()
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadChats = useCallback(async () => {
    try { setChats(await api.getChats() || []) } catch {}
  }, [])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const connectWS = useCallback((chatId: string) => {
    wsRef.current?.close()
    // Если задан VITE_WS_URL — используем его (нужно для Capacitor/мобильного)
    // Иначе определяем по текущему хосту
    let wsBase = import.meta.env.VITE_WS_URL as string | undefined
    if (!wsBase) {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const host  = import.meta.env.DEV ? 'localhost:8000' : location.host
      wsBase = `${proto}://${host}`
    }
    const token = api.getAccessToken()
    const wsUrl = `${wsBase.replace(/\/$/, '')}/chats/ws/${chatId}${token ? `?token=${token}` : ''}`
    const ws = new WebSocket(wsUrl)

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

      setMessages(prev => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), { ...data, text, _msgStatus }],
      }))
    }

    ws.onclose = () => { if (activeChatRef.current === chatId) setTimeout(() => connectWS(chatId), 3000) }
    wsRef.current = ws
  }, [])

  // ── Open chat ─────────────────────────────────────────────────────────────
  const openChat = useCallback(async (chatId: string, chatObj?: Chat) => {
    setCurrentChatId(chatId); activeChatRef.current = chatId; setMobileScreen('detail')

    if (keyPairRef.current && !chatKeysRef.current.has(chatId)) {
      const chat = chatObj || chatsRef.current.find(c => c.id === chatId)
      if (chat) {
        const key = await resolveChatKey(chat, userIdRef.current!, keyPairRef.current).catch(() => null)
        if (key) chatKeysRef.current.set(chatId, key)
      }
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
  const sendMessage = useCallback(async (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const key = chatKeysRef.current.get(activeChatRef.current!)
    const enc = key ? await encryptMessage(text, key) : text
    wsRef.current.send(JSON.stringify({ text: enc }))
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
    wsRef.current?.close(); activeChatRef.current = null
    loadedChats.current.clear(); chatKeysRef.current.clear()
    setUser(null); setChats([]); setCurrentChatId(null); setMessages({})
  }, [])

  const handleLogin = useCallback(async (u: User, password: string, isNewAccount = false) => {
    setUser(u); userIdRef.current = u.id
    await setupCrypto(u.id, password, isNewAccount)
    loadChats()
  }, [loadChats])

  // ── Safety number для текущего чата ──────────────────────────────────────
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null)

  useEffect(() => {
    setSafetyNumber(null)
    if (!currentChatId || !myPubKeyRef.current) return
    const chat = chatsRef.current.find(c => c.id === currentChatId)
    if (!chat || (chat.members?.length || 0) !== 2) return
    const other = chat.members?.find(m => String(m.id) !== String(userIdRef.current))
    if (!other) return
    api.getUserPublicKey(other.id)
      .then(({ public_key }) => computeSafetyNumber(myPubKeyRef.current!, public_key))
      .then(setSafetyNumber)
      .catch(() => {})
  }, [currentChatId])

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
      hasChatKey={chatKeysRef.current.has(currentChatId || '')}
      safetyNumber={safetyNumber}
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

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-bg">
      {/* Desktop */}
      <div className="hidden md:flex flex-1 min-h-0">
        <Sidebar user={user} active={activeTab} onNavigate={setActiveTab} onLogout={logout} onProfile={() => setShowMyProfile(true)} />
        {activeTab === 'chats' ? <>{chatPanel}{chatMain}</> : <>{postPanel}{postMain}</>}
      </div>

      {/* Mobile */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {mobileScreen === 'list' ? (
            activeTab === 'chats' ? chatPanel : (
              <PostFeed key={`${postFeedKey}-${postFilter}`} query={postQuery} filter={postFilter} onSelectPost={id => { setActivePostId(id); setMobileScreen('detail') }} onCreatePost={() => setShowCreate(true)} onQuery={setPostQuery} onFilter={setPostFilter} />
            )
          ) : (
            activeTab === 'chats' ? chatMain : (
              <PostThread postId={activePostId} userId={user.id} onBack={() => { setActivePostId(null); setMobileScreen('list') }} />
            )
          )}
        </div>
        <BottomNav active={activeTab} onNavigate={s => { setActiveTab(s); setMobileScreen('list') }} onProfile={() => setShowMyProfile(true)} />
      </div>

      {showCreate && (
        <CreatePostModal onClose={() => setShowCreate(false)} onCreate={() => { setShowCreate(false); setFeedKey(k => k + 1) }} />
      )}

      {showMyProfile && user && (
        <MyProfileModal userId={user.id} onClose={() => setShowMyProfile(false)} onLogout={() => { setShowMyProfile(false); logout() }} />
      )}

    </div>
  )
}
