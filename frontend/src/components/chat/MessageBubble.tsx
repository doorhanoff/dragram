import React, { useState } from 'react'
import type { Message, Member } from '../../types'
import Avatar from '../ui/Avatar'
import ImageLightbox from '../ui/ImageLightbox'
import VideoLightbox from '../ui/VideoLightbox'
import VideoThumb from '../ui/VideoThumb'
import VoiceMessage from './VoiceMessage'
import ForwardModal from './ForwardModal'
import CachedImg from '../ui/CachedImg'
import { IconFileText } from '@tabler/icons-react'
import { api, mediaSrc } from '../../api'
import { parseDate, nameColor, downloadUrl } from '../../utils'
import { useTheme } from '../../theme'

function fmtTime(dt?: string): string {
  const d = parseDate(dt)
  return d ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : ''
}

// Одна галочка — отправлено, две — прочитано
function Checks({ isRead, white }: { isRead: boolean; white?: boolean }) {
  const color = white ? 'rgba(255,255,255,0.75)' : 'var(--muted)'
  const readColor = white ? '#fff' : 'var(--accent)'
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="inline-block align-middle flex-shrink-0">
      <path d="M1 5L4 8L9 2" stroke={isRead ? readColor : color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      {isRead && (
        <path d="M5 5L8 8L13 2" stroke={readColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  )
}

/** Короткая подпись вместо содержимого — для превью цитаты. */
export function shortContent(type: string, text: string, fileName?: string | null): string {
  if (type === 'image') return '📷 Фото'
  if (type === 'video') return '🎥 Видео'
  if (type === 'audio') return '🎵 Голосовое сообщение'
  if (type === 'file') return `📎 ${fileName || 'Файл'}`
  return text
}

interface Props {
  msg: Message
  userId: string
  isGroup?: boolean
  senderMember?: Member
  /** Прокрутить к процитированному сообщению по нажатию на цитату. */
  onQuoteClick?: (messageId: string) => void
  /** Все фотографии чата: открытое фото листается по ним пальцем. */
  photos?: { url: string; link: string }[]
  /** Место этого фото среди остальных. */
  photoIndex?: number
}

export default function MessageBubble({ msg, userId, isGroup, senderMember, onQuoteClick, photos, photoIndex }: Props) {
  const isSent = (msg.writer || msg.sender_id) === userId
  const time   = fmtTime(msg.date || msg.created_at)
  const [lightbox, setLightbox] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  // Ссылка на пересылаемое фото: после листания это уже не обязательно то,
  // с которого просмотр начали.
  const [forwardLink, setForwardLink] = useState<string | null>(null)
  const { dark } = useTheme()

  // Левая часть: аватар в группе или пустой спейсер. 34 px вместо 26 —
  // лицо в кружке меньшего размера просто не узнаётся.
  const leftSlot = !isSent && (
    isGroup && senderMember
      ? <div className="flex-shrink-0 self-end mb-0.5">
          <Avatar name={senderMember.name} id={senderMember.id} imageUrl={senderMember.image_url} size={34} />
        </div>
      : <div className="w-[34px] flex-shrink-0" />
  )

  const mediaMeta = (
    <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-black/45 rounded-full px-2 py-0.5">
      <span className="text-xs text-white">{time}</span>
      {isSent && <Checks isRead={msg.is_read} white />}
    </div>
  )

  if (msg.type === 'image') {
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <div className="relative">
          <CachedImg url={msg.text} alt="" loading="lazy" className="max-w-[240px] rounded-[20px] cursor-pointer block"
            onClick={() => setLightbox(true)} />
          {mediaMeta}
        </div>
        {lightbox && (
          <ImageLightbox
            images={photos?.length ? photos.map(p => p.url) : [mediaSrc(msg.text)]}
            startIndex={photos?.length ? (photoIndex ?? 0) : 0}
            onClose={() => setLightbox(false)}
            onForward={i => setForwardLink(photos?.length ? (photos[i]?.link ?? msg.text) : msg.text)}
          />
        )}
        {forwardLink && (
          <ForwardModal
            userId={userId}
            onClose={() => setForwardLink(null)}
            onForward={chatId => api.forwardMessage(chatId, { text: forwardLink, type: 'image' })}
          />
        )}
      </div>
    )
  }

  if (msg.type === 'video') {
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <div className="relative">
          <VideoThumb src={mediaSrc(msg.text)} poster={mediaSrc(msg.thumbnail_url)} onClick={() => setVideoOpen(true)} />
          {mediaMeta}
        </div>
        {videoOpen && <VideoLightbox src={mediaSrc(msg.text)} onClose={() => setVideoOpen(false)} />}
      </div>
    )
  }

  if (msg.type === 'audio') {
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <div className={`px-3 py-2 max-w-[280px] shadow-soft ${isSent ? 'bg-accent text-onAccent rounded-msg-out' : 'bg-bubbleIn text-bubbleIn-text rounded-msg-in'}`}>
          <VoiceMessage src={mediaSrc(msg.text)} onAccent={isSent} />
          <div className={`flex items-center gap-1 justify-end mt-1 ${isSent ? 'opacity-80' : 'text-muted'}`}>
            <span className="text-xs">{time}</span>
            {isSent && <Checks isRead={msg.is_read} white />}
          </div>
        </div>
      </div>
    )
  }

  if (msg.type === 'file') {
    const name = msg.file_name || 'Файл'
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <button
          onClick={() => downloadUrl(mediaSrc(msg.text), name)}
          className={`flex items-center gap-2.5 px-3 py-2 max-w-[280px] text-left shadow-soft ${
            isSent ? 'bg-accent text-onAccent rounded-msg-out' : 'bg-bubbleIn text-bubbleIn-text rounded-msg-in'
          }`}
        >
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: isSent ? 'rgba(255,255,255,.22)' : 'var(--surface2)', color: isSent ? '#fff' : 'var(--accent)' }}
          >
            <IconFileText size={22} stroke={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-md font-bold truncate">{name}</span>
            <span className={`block text-xs ${isSent ? 'opacity-85' : 'text-muted'}`}>
              Нажмите, чтобы сохранить
            </span>
          </span>
          <span className={`flex items-center gap-1 self-end flex-shrink-0 ${isSent ? 'opacity-85' : 'text-muted'}`}>
            <span className="text-xs">{time}</span>
            {isSent && <Checks isRead={msg.is_read} white />}
          </span>
        </button>
      </div>
    )
  }

  // Сообщение, которое не расшифровывается: человеку не нужны ни «ключ», ни
  // «E2EE» — нужно понять, что тут ничего не сломалось у него.
  const undecryptable = (msg as any)._msgStatus === 'key_changed'

  return (
    <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
      {leftSlot}

      <div
        className={[
          // Пузырь плотнее: поля и межстрочный интервал раздували короткое
          // «ок» до половины экрана. Размер самого текста не трогаем —
          // читаемость важнее компактности.
          'relative max-w-[78%] px-3 py-1.5 text-lg leading-snug break-words shadow-soft',
          isSent
            ? 'bg-accent text-onAccent rounded-msg-out'
            : 'bg-bubbleIn text-bubbleIn-text rounded-msg-in',
        ].join(' ')}
      >
        {isGroup && !isSent && msg.sender_name && (
          <div
            className="text-base font-bold mb-0.5"
            style={{ color: nameColor(msg.sender_id || msg.writer || '', dark) }}
          >
            {msg.sender_name}
          </div>
        )}

        {/* Цитата: на что отвечают */}
        {msg.reply_to && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); if (msg.reply_to) onQuoteClick?.(msg.reply_to.id) }}
            className="block w-full text-left mb-1.5 pl-2.5 py-1 rounded-lg border-l-[3px]"
            style={{
              borderColor: isSent ? 'rgba(255,255,255,.65)' : 'var(--accent)',
              background: isSent ? 'rgba(255,255,255,.14)' : 'var(--bg)',
            }}
          >
            <div className={`text-xs font-bold ${isSent ? '' : 'text-accent'}`}>
              {msg.reply_to.sender_id === userId ? 'Вы' : (msg.reply_to.sender_name || 'Сообщение')}
            </div>
            <div className={`text-sm ellipsis ${isSent ? 'opacity-85' : 'text-muted'}`}>
              {shortContent(msg.reply_to.type, msg.reply_to.text, msg.reply_to.file_name)}
            </div>
          </button>
        )}

        {undecryptable ? (
          <span className={isSent ? 'italic opacity-85' : 'italic text-muted'}>
            Это сообщение не открывается на этом телефоне
          </span>
        ) : (
          <span>{msg.text}</span>
        )}

        {/* Распорка под время: короткое сообщение остаётся в одну строку,
            длинное переносится, и время не прилипает к последнему слову. */}
        <span className="inline-block align-bottom" style={{ width: isSent ? 56 : 34, height: 1 }} />

        <span
          className={`absolute bottom-1 right-2.5 flex items-center gap-1 whitespace-nowrap ${isSent ? 'opacity-85' : 'text-muted'}`}
        >
          <span className="text-xs">{time}</span>
          {isSent && <Checks isRead={msg.is_read} white />}
        </span>
      </div>
    </div>
  )
}
