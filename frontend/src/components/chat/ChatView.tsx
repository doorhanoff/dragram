import React, { useRef, useEffect, useState } from 'react'
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
  hasChatKey: boolean
  safetyNumber?: string | null
  onSend: (text: string) => void
  onBack?: () => void
  onStartChat?: (userId: string) => void
}

export default function ChatView({ chatId, chat, messages, setMessages, userId, hasChatKey, safetyNumber, onSend, onBack, onStartChat }: Props) {
  const [text, setText]               = useState('')
  const [showSafety, setShowSafety]   = useState(false)
  const [activeMsg,  setActiveMsg]    = useState<string | null>(null)
  const [uploading, setUploading]     = useState<{ file: File; progress: number } | null>(null)
  const [profileId, setProfileId]     = useState<string | null>(null)
  const [hasMore,   setHasMore]       = useState(true)
  const [loadingMore,setLoadingMore]  = useState(false)
  const [recording, setRecording]     = useState(false)
  const [pendingAudio, setPending]    = useState<{ file: File; url: string } | null>(null)
  const [sendingAudio, setSendingAudio] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const isGroup     = (chat?.members?.length || 0) > 2
  const other       = chat?.members?.find(m => m.id !== userId)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, uploading])

  useEffect(() => { if (chatId) api.markRead(chatId).catch(() => {}) }, [chatId])

  function send() {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !chatId) return
    e.target.value = ''
    setUploading({ file, progress: 0 })
    try {
      await api.uploadMedia(chatId, file, (pct: number) => setUploading(prev => prev ? { ...prev, progress: pct } : null))
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
    items.push({ type: 'msg', msg: m, key: (m.id || (m as any)._id || String(i)) })
  })

  const title   = chatName(chat, userId)
  const imgUrl  = isGroup ? chat.image_url : other?.image_url
  const isOnline = !isGroup && other?.is_active

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* Header */}
      <div className="bg-surface border-b border-border flex items-center gap-3 px-4 pb-3 flex-shrink-0" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}>
        {onBack && (
          <button onClick={onBack} className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-accent hover:bg-bg transition-colors md:hidden">
            <IconArrowLeft size={18} stroke={1.5} />
          </button>
        )}
        <div onClick={() => { if (!isGroup && other) setProfileId(other.id) }} className={!isGroup ? 'cursor-pointer' : ''}>
          <Avatar name={title} id={chatId} imageUrl={imgUrl} isActive={isOnline} size={34} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium text-primary ellipsis">{title}</div>
          {isOnline && (
            <div className="flex items-center gap-1">
              <span className="w-[5px] h-[5px] rounded-full bg-online" />
              <span className="text-xs text-online">онлайн</span>
            </div>
          )}
        </div>
      </div>

      {/* E2EE статус */}
      {!hasChatKey ? (
        <div className="bg-yellow-50 border-b border-yellow-100 text-yellow-700 text-xs px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
          Чат не зашифрован — собеседник ещё не открыл приложение
        </div>
      ) : safetyNumber && (
        <>
          <div
            className="border-b border-border text-xs px-4 py-1.5 flex items-center gap-2 flex-shrink-0 cursor-pointer hover:bg-bg transition-colors"
            onClick={() => setShowSafety(s => !s)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span className="text-green-600 font-medium">Сквозное шифрование включено</span>
            <span className="text-muted ml-auto">{showSafety ? '▲' : '▼'} Safety Number</span>
          </div>
          {showSafety && (
            <div className="bg-bg border-b border-border px-4 py-3 flex-shrink-0">
              <p className="text-xs text-muted mb-2">Сверьте этот номер с собеседником лично или по другому каналу. Если не совпадает — возможна MITM-атака.</p>
              <code className="text-xs font-mono text-primary bg-surface border border-border rounded-lg px-3 py-2 block leading-loose tracking-wider select-all">
                {safetyNumber}
              </code>
            </div>
          )}
        </>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-[18px] py-[14px] flex flex-col gap-3">
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
              <div key={item.key} className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-[#E0E0E8]" />
                <span className="text-xs text-[#bbb] whitespace-nowrap">{item.day}</span>
                <div className="flex-1 h-px bg-[#E0E0E8]" />
              </div>
            )
          }
          const isMine = (item.msg.writer || item.msg.sender_id) === userId
          const msgId  = item.msg.id || (item.msg as any)._id
          const isActive = activeMsg === item.key
          return (
            <div
              key={item.key}
              className="group relative"
              onTouchStart={() => { if (isMine) setActiveMsg(prev => prev === item.key ? null : item.key) }}
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
                    isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100',
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
      <div className="bg-surface border-t border-border px-[14px] py-[10px] flex items-end gap-2 flex-shrink-0">
        {pendingAudio ? (
          <>
            <audio src={pendingAudio.url} controls className="flex-1 h-9" />
            <button onClick={() => { URL.revokeObjectURL(pendingAudio.url); setPending(null) }}
              className="w-7 h-7 rounded-full bg-red-50 text-red-400 flex items-center justify-center text-xs">×</button>
            <button onClick={sendAudio} disabled={sendingAudio}
              className="w-8 h-8 rounded-[9px] bg-accent flex items-center justify-center text-white disabled:opacity-50">
              <IconSend size={15} stroke={1.5} />
            </button>
          </>
        ) : (
          <>
            <label className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-colors ${uploading ? 'text-muted pointer-events-none opacity-40' : 'text-muted hover:text-accent'}`}>
              <IconPaperclip size={18} stroke={1.5} />
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/*" hidden onChange={handleFile} />
            </label>
            <div className="flex-1 bg-bg rounded-[9px] flex items-end gap-1 px-3 py-[7px]">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
                onKeyDown={onKey}
                placeholder="Написать сообщение…"
                rows={1}
                disabled={!hasChatKey}
                className="flex-1 bg-transparent outline-none resize-none text-md text-primary placeholder:text-muted max-h-[100px] disabled:cursor-not-allowed"
              />
              <button
                onClick={toggleRecord}
                className={`w-7 h-7 flex items-center justify-center transition-colors flex-shrink-0 ${recording ? 'text-red-500' : 'text-muted hover:text-accent'}`}
              >
                {recording ? <IconPlayerStop size={16} stroke={1.5} /> : <IconMicrophone size={16} stroke={1.5} />}
              </button>
            </div>
            <button
              onClick={send}
              disabled={!text.trim() || !hasChatKey}
              className="w-8 h-8 rounded-[9px] bg-accent flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
            >
              <IconSend size={15} stroke={1.5} />
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
