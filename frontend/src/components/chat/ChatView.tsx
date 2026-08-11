import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  IconPaperclip, IconSend, IconMicrophone, IconArrowLeft, IconChevronUp,
  IconX, IconTrash, IconArrowBackUp,
} from '@tabler/icons-react'
import { parseDate, fmtPresence, showToast } from '../../utils'
import MessageBubble, { shortContent } from './MessageBubble'
import MessageActions from './MessageActions'
import AttachSheet from './AttachSheet'
import ForwardModal from './ForwardModal'
import Avatar from '../ui/Avatar'
import ProfileModal from '../ui/ProfileModal'
import { ask, say, sayError } from '../ui/dialogs'
import type { Chat, Message } from '../../types'
import { api, mediaSrc } from '../../api'

function chatName(chat: Chat, myId: string): string {
  if (chat.name) return chat.name
  const other = chat.members?.find(m => m.id !== myId)
  return other?.name || `Чат ${chat.id.slice(0, 6)}`
}

function fmtDay(dt?: string): string {
  if (!dt) return ''
  const d = parseDate(dt)
  if (!d) return ''
  if (isNaN(d.getTime())) return ''
  const today = new Date()
  const yest  = new Date(); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString())  return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

function fmtRecording(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

interface Props {
  chatId: string | null
  chat?: Chat
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>
  userId: string
  onSend: (text: string, replyToId?: string | null) => Promise<boolean>
  /** Переслать текст: App перешифрует его ключом чата-получателя — у каждого
   *  чата ключ свой, и переложить блоб как есть нельзя. */
  onForwardText?: (chatId: string, text: string) => Promise<void>
  onBack?: () => void
  onStartChat?: (userId: string) => void
}

export default function ChatView({ chatId, chat, messages, setMessages, userId, onSend, onForwardText, onBack, onStartChat }: Props) {
  const [text, setText]               = useState('')
  const [actionMsg, setActionMsg]     = useState<Message | null>(null)
  const [replyTo, setReplyTo]         = useState<Message | null>(null)
  const [forwardMsg, setForwardMsg]   = useState<Message | null>(null)
  const [uploading, setUploading]     = useState<{ file: File; progress: number } | null>(null)
  const [profileId, setProfileId]     = useState<string | null>(null)
  const [hasMore,   setHasMore]       = useState(true)
  const [loadingMore,setLoadingMore]  = useState(false)
  const [recording, setRecording]     = useState(false)
  const [recordMs,  setRecordMs]      = useState(0)
  const [sendingAudio, setSendingAudio] = useState(false)
  // Что прикрепляем: сначала спрашиваем, потом открываем нужный выбор.
  // Один общий выбор открывал файловый менеджер, где до фотографий ещё надо
  // догадаться дойти.
  const [attachOpen, setAttachOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const docRef      = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Запись отменена (палец уехал в сторону) — на отпускании не отправляем.
  const recordCancelled = useRef(false)
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

  // Смена чата не должна тащить за собой ответ и открытое меню из прежнего.
  useEffect(() => { setReplyTo(null); setActionMsg(null); setForwardMsg(null) }, [chatId])

  useEffect(() => () => { if (recordTimer.current) clearInterval(recordTimer.current) }, [])

  async function send() {
    if (!text.trim()) return
    const ok = await onSend(text.trim(), replyTo?.id || null)
    // Сокет мог быть в реконнекте — сообщение не ушло, текст не трогаем,
    // чтобы пользователь мог отправить повторно, а не набирать заново
    if (!ok) return
    setText('')
    setReplyTo(null)
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
    } catch (err) { sayError('Не удалось отправить файл', err) }
    finally { setUploading(null) }
  }

  // ── Голосовое: удержанием, как во всех мессенджерах ───────────────────────
  async function startRecording() {
    if (recording) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) {
      say('Нужен доступ к микрофону', 'Разрешите Dragram запись звука в настройках телефона — иначе голосовое записать не получится.')
      return
    }
    const rec = new MediaRecorder(stream)
    const startedAt = Date.now()
    recorderRef.current = rec
    chunksRef.current = []
    recordCancelled.current = false
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null }
      const wasCancelled = recordCancelled.current
      const durationMs = Date.now() - startedAt
      setRecording(false)
      setRecordMs(0)
      // Слишком короткое — это случайное касание, а не сообщение.
      if (wasCancelled || durationMs < 700 || !chatId) return
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], 'voice.webm', { type: 'audio/webm' })
      setSendingAudio(true)
      try { await api.uploadMedia(chatId, file, () => {}) }
      catch (err) { sayError('Не удалось отправить голосовое', err) }
      finally { setSendingAudio(false) }
    }
    rec.start()
    setRecording(true)
    setRecordMs(0)
    recordTimer.current = setInterval(() => setRecordMs(Date.now() - startedAt), 200)
  }

  function stopRecording(cancel = false) {
    if (!recording) return
    recordCancelled.current = cancel
    recorderRef.current?.stop()
    if (cancel) showToast('Запись отменена')
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

  async function handleDelete(msg: Message) {
    const msgId = msg.id || (msg as any)._id
    if (!msgId || !chatId) return
    const ok = await ask({
      title: 'Удалить сообщение?',
      text: 'Оно исчезнет и у собеседника. Вернуть его будет нельзя.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Оставить',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteMessage(chatId, msgId)
      setMessages(prev => ({ ...prev, [chatId]: (prev[chatId] || []).filter(m => (m.id || (m as any)._id) !== msgId) }))
    } catch (err) { sayError('Не удалось удалить сообщение', err) }
  }

  async function copyText(msg: Message) {
    try {
      await navigator.clipboard.writeText(msg.text)
      showToast('Скопировано')
    } catch {
      showToast('Не получилось скопировать')
    }
  }

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (!el) { showToast('Это сообщение осталось выше — прокрутите ленту'); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.animate(
      [{ background: 'var(--surface2)' }, { background: 'transparent' }],
      { duration: 1200, easing: 'ease-out' },
    )
  }, [])

  if (!chatId || !chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg gap-3">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p className="text-md text-muted">Выберите чат</p>
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

  // Все фотографии переписки — чтобы открытое фото листалось пальцем по чату,
  // а не висело в одиночку. link — исходный адрес: он нужен для пересылки,
  // подписанный тикетом url для этого не годится.
  const photos = messages
    .filter(m => m.type === 'image')
    .map(m => ({ url: mediaSrc(m.text), link: m.text }))
  const photoIndex = new Map<string, number>()
  messages.filter(m => m.type === 'image').forEach((m, i) => {
    const key = m.id || (m as any)._id || m.client_id
    if (key) photoIndex.set(key, i)
  })

  const title    = chatName(chat, userId)
  const imgUrl   = isGroup ? chat.image_url : other?.image_url
  const isOnline = !isGroup && other?.is_active
  // Строка под именем есть ВСЕГДА — иначе шапка прыгает по высоте, а понять,
  // ждать ли ответа сейчас, всё равно нельзя.
  const subtitle = isGroup
    ? `${chat.members?.length || 0} участников`
    : fmtPresence(!!other?.is_active, other?.last_seen)

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg">
      {/* Header */}
      <div className="bg-surface border-b border-border flex items-center gap-2 px-2 pt-2 pb-2 flex-shrink-0">
        {onBack && (
          <button onClick={onBack} aria-label="Назад" className="tap rounded-2xl text-accent md:hidden">
            <IconArrowLeft size={26} stroke={2.2} />
          </button>
        )}
        <div onClick={() => { if (!isGroup && other) setProfileId(other.id) }} className={`flex-shrink-0 ${!isGroup ? 'cursor-pointer' : ''}`}>
          <Avatar name={title} id={chatId} imageUrl={imgUrl} isActive={isOnline} size={44} />
        </div>
        <div className="flex-1 min-w-0 pl-1">
          <div className="text-lg font-bold text-primary ellipsis">{title}</div>
          <div className={`text-sm ellipsis ${isOnline ? 'text-online' : 'text-muted'}`}>{subtitle}</div>
        </div>
      </div>

      {/* Messages — лента растёт снизу вверх: последнее сообщение всегда рядом
          с полем ввода, а не прижато к шапке с пустотой под ним.
          Прижимает mt-auto у внутренней обёртки, а НЕ justify-end у самого
          контейнера прокрутки: при justify-end длинная переписка уезжает за
          верхний край, туда нельзя долистать, и сообщения налезают друг на
          друга. mt-auto же сам обращается в ноль, как только содержимое
          перестаёт помещаться. */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-[14px] flex flex-col"
        onScroll={() => {
          if (longPressRef.current) { clearTimeout(longPressRef.current.timer); longPressRef.current = null }
        }}
      >
        {/* Пустой чат — по центру свободного места, поэтому стоит снаружи
            прижатой вниз обёртки. */}
        {messages.length === 0 && !uploading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-2">
            <p className="text-xl font-bold text-primary">Здесь пока пусто</p>
            <p className="text-md text-muted leading-relaxed">
              Напишите первое сообщение — его прочитает только {isGroup ? 'эта группа' : (other?.name || 'собеседник')}.
              Даже мы не видим, что вы пишете друг другу.
            </p>
          </div>
        )}

       <div className="mt-auto flex flex-col gap-3">
        {/* Load more */}
        {hasMore && messages.length >= 50 && (
          <button onClick={loadMore} disabled={loadingMore}
            className="self-center flex items-center gap-1 text-sm text-muted border border-border rounded-full px-4 py-2 hover:border-accent hover:text-accent transition-colors disabled:opacity-50">
            <IconChevronUp size={14} stroke={2} />
            {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        )}

        {items.map(item => {
          if (item.type === 'divider') {
            return (
              <div key={item.key} className="flex justify-center my-1">
                <span className="text-sm font-bold text-muted whitespace-nowrap bg-surface2 px-3.5 py-1 rounded-full">{item.day}</span>
              </div>
            )
          }
          const msgId = item.msg.id || (item.msg as any)._id
          const cancelLongPress = () => {
            if (longPressRef.current) { clearTimeout(longPressRef.current.timer); longPressRef.current = null }
          }
          return (
            <div
              id={msgId ? `msg-${msgId}` : undefined}
              key={item.key}
              className="relative no-callout rounded-2xl"
              onContextMenu={e => { e.preventDefault(); setActionMsg(item.msg) }}
              onTouchStart={e => {
                const touch = e.touches[0]
                cancelLongPress()
                longPressRef.current = {
                  x: touch.clientX,
                  y: touch.clientY,
                  timer: setTimeout(() => {
                    setActionMsg(item.msg)
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
            >
              <MessageBubble
                msg={item.msg}
                userId={userId}
                isGroup={isGroup}
                senderMember={isGroup && (item.msg.sender_id || item.msg.writer) !== userId
                  ? chat?.members?.find(m => m.id === (item.msg.sender_id || item.msg.writer))
                  : undefined
                }
                onQuoteClick={scrollToMessage}
                photos={photos}
                photoIndex={photoIndex.get(item.key)}
              />
            </div>
          )
        })}

        {uploading && (
          <div className="flex flex-row-reverse">
            <div className="relative bg-surface2 rounded-2xl overflow-hidden w-[200px] h-[130px] flex items-center justify-center">
              <span className="text-md text-accent font-bold">{uploading.progress}%</span>
              <div className="absolute bottom-0 left-0 h-1 bg-accent transition-all" style={{ width: `${uploading.progress}%` }} />
            </div>
          </div>
        )}
       </div>
      </div>

      {/* Ответ: на что отвечаем */}
      {replyTo && (
        <div className="bg-surface border-t border-border px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <IconArrowBackUp size={20} stroke={1.8} className="text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0 border-l-[3px] border-accent pl-2">
            <div className="text-xs font-bold text-accent">
              {(replyTo.sender_id || replyTo.writer) === userId ? 'Вы' : (replyTo.sender_name || 'Сообщение')}
            </div>
            <div className="text-sm text-muted ellipsis">{shortContent(replyTo.type, replyTo.text, replyTo.file_name)}</div>
          </div>
          <button onClick={() => setReplyTo(null)} aria-label="Не отвечать" className="tap-sm rounded-xl text-muted">
            <IconX size={20} stroke={2} />
          </button>
        </div>
      )}

      {/* Input */}
      {/* Отступ снизу с запасом на системную полосу: на телефонах с тремя
          кнопками (треугольник, круг, квадрат) она рисуется поверх страницы,
          и поле ввода оказывалось под ней. Считаем в calc, а не классом
          pb-safe: рядом стоит py-2, и какое из двух правил победит —
          зависит от порядка в собранном CSS. */}
      <div
        className="bg-bg px-2 pt-2 flex items-center gap-1 flex-shrink-0"
        style={{
          borderTop: '1px solid var(--border)',
          paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {recording ? (
          <>
            <button
              onClick={() => stopRecording(true)}
              className="tap rounded-2xl text-danger"
              aria-label="Отменить запись"
            >
              <IconTrash size={24} stroke={1.9} />
            </button>
            <div className="flex-1 flex items-center gap-2 px-2">
              <span className="w-3 h-3 rounded-full bg-danger animate-pulse flex-shrink-0" />
              <span className="text-lg font-bold text-primary tabular-nums">{fmtRecording(recordMs)}</span>
              <span className="text-md text-muted ellipsis">Отпустите, чтобы отправить</span>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setAttachOpen(true)}
              disabled={!!uploading}
              className={`tap rounded-2xl flex-shrink-0 ${uploading ? 'opacity-40 text-muted' : 'text-muted hover:text-accent'}`}
              aria-label="Прикрепить"
            >
              <IconPaperclip size={24} stroke={2} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              hidden
              onChange={handleFile}
            />
            {/* Документы: список типов совпадает с тем, что принимает сервер
                (ALLOWED_DOC_TYPES). Иначе человек выберет файл, дождётся
                загрузки и получит отказ. */}
            <input
              ref={docRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.rtf,.txt,.csv,.zip"
              hidden
              onChange={handleFile}
            />
            <div className="flex-1 bg-surface rounded-[20px] flex items-center pl-4 pr-2 py-1 shadow-soft">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px' }}
                onKeyDown={onKey}
                placeholder="Сообщение…"
                rows={1}
                className="flex-1 bg-transparent outline-none resize-none text-lg text-primary placeholder:text-muted max-h-[110px] py-2"
              />
            </div>
            {/* Одна кнопка, которая меняется: пусто — микрофон, есть текст —
                самолётик в полную силу цвета. Раньше их было две, и человек
                жал ту, что заметнее, — микрофон. */}
            {text.trim() ? (
              <button
                onClick={send}
                aria-label="Отправить"
                className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-onAccent flex-shrink-0 shadow-pop"
              >
                <IconSend size={20} stroke={1.8} />
              </button>
            ) : (
              <button
                onPointerDown={e => { e.preventDefault(); startRecording() }}
                onPointerUp={() => stopRecording(false)}
                onPointerLeave={() => stopRecording(true)}
                onPointerCancel={() => stopRecording(true)}
                onContextMenu={e => e.preventDefault()}
                disabled={sendingAudio}
                aria-label="Записать голосовое: удерживайте"
                className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center text-accent flex-shrink-0 disabled:opacity-50 no-callout"
              >
                <IconMicrophone size={22} stroke={1.9} />
              </button>
            )}
          </>
        )}
      </div>

      {attachOpen && (
        <AttachSheet
          onPhoto={() => { setAttachOpen(false); fileRef.current?.click() }}
          onFile={() => { setAttachOpen(false); docRef.current?.click() }}
          onClose={() => setAttachOpen(false)}
        />
      )}

      {actionMsg && (
        <MessageActions
          canDelete={(actionMsg.sender_id || actionMsg.writer) === userId}
          canForward={actionMsg.type !== 'text' || !!onForwardText}
          canCopy={actionMsg.type === 'text'}
          onClose={() => setActionMsg(null)}
          onReply={() => { setReplyTo(actionMsg); setActionMsg(null); textareaRef.current?.focus() }}
          onCopy={() => { copyText(actionMsg); setActionMsg(null) }}
          onForward={() => { setForwardMsg(actionMsg); setActionMsg(null) }}
          onDelete={() => { const m = actionMsg; setActionMsg(null); handleDelete(m) }}
        />
      )}

      {forwardMsg && (
        <ForwardModal
          userId={userId}
          onClose={() => setForwardMsg(null)}
          onForward={targetChatId => forwardMsg.type === 'text'
            ? onForwardText!(targetChatId, forwardMsg.text)
            : api.forwardMessage(targetChatId, {
                text: forwardMsg.text,
                type: forwardMsg.type,
                thumbnail_url: forwardMsg.thumbnail_url || null,
                // Без имени пересланный документ станет просто «Файл».
                file_name: forwardMsg.file_name || null,
              })}
        />
      )}

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
