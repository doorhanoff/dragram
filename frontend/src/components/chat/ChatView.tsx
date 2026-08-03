import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  IconPaperclip,
  IconSend, IconMicrophone, IconPlayerStop, IconArrowLeft, IconChevronUp,
} from '@tabler/icons-react'
import MessageBubble from './MessageBubble'
import Avatar from '../ui/Avatar'
import type { Member } from '../../types'
import ProfileModal from '../ui/ProfileModal'
import type { Chat, Message } from '../../types'
import { api } from '../../api'

function chatName(chat: Chat, myId: string): string {
  if (chat.name) return chat.name
  const other = chat.members?.find(m => m.id !== myId)
  return other?.name || `Чат ${chat.id.slice(0, 6)}`
}

function fmtDay(dt?: string): string {
  if (!dt) return ''
  const d = new Date(dt)
  if (isNaN(d.getTime())) return ''
  const today = new Date()
  const yest  = new Date(); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString())  return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

interface Props {
  chatId: string | null
  chat?: Chat
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>
  userId: string
  onSend: (text: string) => Promise<boolean>
  onBack?: () => void
  onStartChat?: (userId: string) => void
}

export default function ChatView({ chatId, chat, messages, setMessages, userId, onSend, onBack, onStartChat }: Props) {
  const [text, setText]               = useState('')
  const [activeMsg,  setActiveMsg]    = useState<string | null>(null)
  const [uploading, setUploading]     = useState<{ file: File; progress: number } | null>(null)
  const [profileId, setProfileId]     = useState<string | null>(null)
  const [hasMore,   setHasMore]       = useState(true)
  const [loadingMore,setLoadingMore]  = useState(false)
  const [recording, setRecording]     = useState(false)
  const [pendingAudio, setPending]    = useState<{ file: File; url: string } | null>(null)
  const [sendingAudio, setSendingAudio] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const isGroup     = (chat?.members?.length || 0) > 2
  const other       = chat?.members?.find(m => m.id !== userId)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    // Прямой скролл контейнера надёжнее scrollIntoView в Android WebView
    // (особенно при открытой клавиатуре/смене высоты вьюпорта).
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [messages, uploading, chatId])

  useEffect(() => { if (chatId) api.markRead(chatId).catch(() => {}) }, [chatId])

  async function send() {
    if (!text.trim()) return
    const ok = await onSend(text.trim())
    // Сокет мог быть в реконнекте — сообщение не ушло, текст не трогаем,
    // чтобы пользователь мог отправить повторно, а не набирать заново
    if (!ok) return
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function getVideoThumbnail(file: File): Promise<File | null> {
    return new Promise(resolve => {
      const video = document.createElement('video')
      const url = URL.createObjectURL(file)
      video.src = url; video.muted = true; video.playsInline = true; video.preload = 'metadata'
      const cleanup = () => URL.revokeObjectURL(url)
      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas')
          const w = Math.min(video.videoWidth, 480)
          const h = Math.round(w * video.videoHeight / video.videoWidth)
          canvas.width = w; canvas.height = h
          canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
          canvas.toBlob(blob => { cleanup(); resolve(blob ? new File([blob], 'thumb.jpg', { type: 'image/jpeg' }) : null) }, 'image/jpeg', 0.8)
        } catch { cleanup(); resolve(null) }
      }, { once: true })
      video.addEventListener('error', () => { cleanup(); resolve(null) }, { once: true })
      video.addEventListener('loadedmetadata', () => { video.currentTime = 0.1 }, { once: true })
      video.load()
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !chatId) return
    e.target.value = ''
    setUploading({ file, progress: 0 })
    try {
      const thumbnail = file.type.startsWith('video/') ? await getVideoThumbnail(file) : null
      await api.uploadMedia(chatId, file, (pct: number) => setUploading(prev => prev ? { ...prev, progress: pct } : null), thumbnail)
    } catch (err: any) { alert('Ошибка: ' + err.message) }
    finally { setUploading(null) }
  }

  async function toggleRecord() {
    if (recording) { recorderRef.current?.stop(); return }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) { alert('Нет доступа к микрофону'); return }
    const rec = new MediaRecorder(stream)
    recorderRef.current = rec; chunksRef.current = []
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], 'voice.webm', { type: 'audio/webm' })
      setPending({ file, url: URL.createObjectURL(blob) })
    }
    rec.start(); setRecording(true)
  }

  async function sendAudio() {
    if (!pendingAudio || !chatId) return
    setSendingAudio(true)
    try { await api.uploadMedia(chatId, pendingAudio.file, () => {}); URL.revokeObjectURL(pendingAudio.url); setPending(null) }
    catch (err: any) { alert(err.message) }
    finally { setSendingAudio(false) }
  }

  async function loadMore() {
    if (!chatId || loadingMore || !hasMore) return
    const oldest = messages[0]
    if (!oldest) return
    setLoadingMore(true)
    try {
      const older = await api.getMessages(chatId, 50, oldest.id || (oldest as any)._id)
      if (!older || older.length === 0) { setHasMore(false); return }
      setMessages(prev => ({ ...prev, [chatId]: [...older, ...(prev[chatId] || [])] }))
      if (older.length < 50) setHasMore(false)
    } catch {}
    finally { setLoadingMore(false) }
  }

  async function handleDelete(msgId?: string) {
    if (!msgId || !chatId) return
    if (!window.confirm('Удалить сообщение?')) return
    try {
      await api.deleteMessage(chatId, msgId)
      setMessages(prev => ({ ...prev, [chatId]: (prev[chatId] || []).filter(m => (m.id || (m as any)._id) !== msgId) }))
    } catch (err: any) { alert(err.message) }
  }

  if (!chatId || !chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg gap-3">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D0D0E0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p className="text-sm text-muted">Выберите чат</p>
      </div>
    )
  }

  // Build items with day dividers
  const items: Array<{ type: 'divider'; day: string; key: string } | { type: 'msg'; msg: Message; key: string }> = []
  let lastDay = ''
  messages.forEach((m, i) => {
    const day = fmtDay(m.date || m.created_at)
    if (day && day !== lastDay) { items.push({ type: 'divider', day, key: `d${i}` }); lastDay = day }
    items.push({ type: 'msg', msg: m, key: (m.id || (m as any)._id || m.client_id || String(i)) })
  })

  const title   = chatName(chat, userId)
  const imgUrl  = isGroup ? chat.image_url : other?.image_url
  const isOnline = !isGroup && other?.is_active

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg">
      {/* Header */}
      <div className="bg-surface border-b border-border flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-accent hover:opacity-70 transition-opacity md:hidden">
            <IconArrowLeft size={24} stroke={2.4} />
          </button>
        )}
        <div onClick={() => { if (!isGroup && other) setProfileId(other.id) }} className={!isGroup ? 'cursor-pointer' : ''}>
          <Avatar name={title} id={chatId} imageUrl={imgUrl} isActive={isOnline} size={42} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-extrabold text-primary ellipsis">{title}</div>
          {isOnline && (
            <div className="flex items-center gap-1">
              <span className="w-[5px] h-[5px] rounded-full bg-online" />
              <span className="text-sm font-bold text-online">онлайн</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-[18px] py-[14px] flex flex-col gap-3"
        onScroll={() => {
          if (longPressRef.current) { clearTimeout(longPressRef.current.timer); longPressRef.current = null }
          setActiveMsg(null)
        }}
      >
        {/* Load more */}
        {hasMore && messages.length >= 50 && (
          <button onClick={loadMore} disabled={loadingMore}
            className="self-center flex items-center gap-1 text-xs text-muted border border-border rounded-full px-3 py-1.5 hover:border-accent hover:text-accent transition-colors disabled:opacity-50">
            <IconChevronUp size={12} stroke={2} />
            {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        )}
        {items.map(item => {
          if (item.type === 'divider') {
            return (
              <div key={item.key} className="flex justify-center my-1">
                <span className="text-xs font-extrabold text-muted whitespace-nowrap bg-surface2 px-3.5 py-1 rounded-full">{item.day}</span>
              </div>
            )
          }
          const isMine = (item.msg.writer || item.msg.sender_id) === userId
          const msgId  = item.msg.id || (item.msg as any)._id
          const isActive = activeMsg === item.key
          const cancelLongPress = () => {
            if (longPressRef.current) { clearTimeout(longPressRef.current.timer); longPressRef.current = null }
          }
          return (
            <div
              key={item.key}
              className={`group relative ${isMine ? 'no-callout' : ''}`}
              onContextMenu={e => { if (isMine) e.preventDefault() }}
              onTouchStart={e => {
                if (!isMine) return
                const touch = e.touches[0]
                cancelLongPress()
                longPressRef.current = {
                  x: touch.clientX,
                  y: touch.clientY,
                  timer: setTimeout(() => {
                    setActiveMsg(prev => prev === item.key ? null : item.key)
                    longPressRef.current = null
                  }, 450),
                }
              }}
              onTouchMove={e => {
                if (!longPressRef.current) return
                const touch = e.touches[0]
                const dx = Math.abs(touch.clientX - longPressRef.current.x)
                const dy = Math.abs(touch.clientY - longPressRef.current.y)
                if (dx > 10 || dy > 10) cancelLongPress()
              }}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onClick={() => { if (activeMsg && !isMine) setActiveMsg(null) }}
            >
              <MessageBubble
                msg={item.msg}
                userId={userId}
                isGroup={isGroup}
                senderMember={isGroup && !isMine
                  ? chat?.members?.find(m => m.id === (item.msg.sender_id || item.msg.writer))
                  : undefined
                }
              />
              {isMine && (
                <button
                  onClick={e => { e.stopPropagation(); setActiveMsg(null); handleDelete(msgId) }}
                  className={[
                    'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white',
                    'flex items-center justify-center text-xs transition-all',
                    // group-hover только на устройствах с настоящим hover (мышь) —
                    // на тачскринах тап иногда "залипает" в hover-состоянии и кнопка удаления
                    // оставалась бы видна без причины
                    isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:pointer-events-auto',
                  ].join(' ')}
                  title="Удалить"
                >×</button>
              )}
            </div>
          )
        })}
        {uploading && (
          <div className="flex flex-row-reverse">
            <div className="relative bg-accent-light rounded-xl overflow-hidden w-[200px] h-[130px] flex items-center justify-center">
              <span className="text-sm text-accent-text font-medium">{uploading.progress}%</span>
              <div className="absolute bottom-0 left-0 h-1 bg-accent transition-all" style={{ width: `${uploading.progress}%` }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-bg px-[14px] py-[10px] flex items-center gap-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        {pendingAudio ? (
          <>
            <audio src={pendingAudio.url} controls className="flex-1 h-9" />
            <button onClick={() => { URL.revokeObjectURL(pendingAudio.url); setPending(null) }}
              className="w-8 h-8 rounded-full bg-surface2 text-red-400 flex items-center justify-center text-xs">×</button>
            <button onClick={sendAudio} disabled={sendingAudio}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-accent2 to-accent flex items-center justify-center text-onAccent shadow-pop disabled:opacity-50">
              <IconSend size={18} stroke={1.5} />
            </button>
          </>
        ) : (
          <>
            <label className={`text-muted flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 ${uploading ? 'pointer-events-none opacity-40' : 'hover:text-accent'}`}>
              <IconPaperclip size={24} stroke={2} />
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/*" hidden onChange={handleFile} />
            </label>
            <div className="flex-1 bg-surface rounded-[22px] flex items-center gap-1 pl-[18px] pr-2 py-[6px] shadow-soft">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
                onKeyDown={onKey}
                placeholder="Сообщение…"
                rows={1}
                className="flex-1 bg-transparent outline-none resize-none text-lg font-semibold text-primary placeholder:text-muted max-h-[100px] disabled:cursor-not-allowed py-1.5"
              />
              <button
                onClick={toggleRecord}
                className={`w-8 h-8 flex items-center justify-center transition-colors flex-shrink-0 ${recording ? 'text-red-500' : 'text-muted hover:text-accent'}`}
              >
                {recording ? <IconPlayerStop size={19} stroke={1.8} /> : <IconMicrophone size={19} stroke={1.8} />}
              </button>
            </div>
            <button
              onClick={send}
              disabled={!text.trim()}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-accent2 to-accent flex items-center justify-center text-onAccent disabled:opacity-40 transition-opacity flex-shrink-0 shadow-pop"
            >
              <IconSend size={18} stroke={1.5} />
            </button>
          </>
        )}
      </div>

      {profileId && (
        <ProfileModal
          userId={profileId}
          isMe={profileId === userId}
          onClose={() => setProfileId(null)}
          onStartChat={onStartChat}
        />
      )}
    </div>
  )
}
