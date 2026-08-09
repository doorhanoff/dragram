import React, { useState } from 'react'
import type { Message, Member } from '../../types'
import Avatar from '../ui/Avatar'
import ImageLightbox from '../ui/ImageLightbox'
import VideoLightbox from '../ui/VideoLightbox'
import VideoThumb from '../ui/VideoThumb'
import ForwardModal from './ForwardModal'
import CachedImg from '../ui/CachedImg'
import { api, mediaSrc } from '../../api'
import { parseDate } from '../../utils'

function fmtTime(dt?: string): string {
  const d = parseDate(dt)
  return d ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : ''
}

// Одна галочка — отправлено, две — прочитано
function Checks({ isRead, white }: { isRead: boolean; white?: boolean }) {
  const color = white ? 'rgba(255,255,255,0.65)' : 'var(--muted)'
  const readColor = white ? '#fff' : 'var(--accent)'
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="inline-block align-middle ml-1 flex-shrink-0">
      {/* первая галочка */}
      <path d="M1 5L4 8L9 2" stroke={isRead ? readColor : color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      {/* вторая галочка — только если прочитано */}
      {isRead && (
        <path d="M5 5L8 8L13 2" stroke={readColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  )
}

interface Props {
  msg: Message
  userId: string
  isGroup?: boolean
  senderMember?: Member
}

export default function MessageBubble({ msg, userId, isGroup, senderMember }: Props) {
  const isSent = (msg.writer || msg.sender_id) === userId
  const time   = fmtTime(msg.date || msg.created_at)
  const [lightbox, setLightbox] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [forwarding, setForwarding] = useState(false)

  // Левая часть: аватар в группе или пустой спейсер
  const leftSlot = !isSent && (
    isGroup && senderMember
      ? <div className="flex-shrink-0 self-end mb-0.5">
          <Avatar name={senderMember.name} id={senderMember.id} imageUrl={senderMember.image_url} size={26} />
        </div>
      : <div className="w-[26px] flex-shrink-0" />
  )

  if (msg.type === 'image') {
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <div className="relative">
          <CachedImg url={msg.text} alt="" loading="lazy" className="max-w-[220px] rounded-[18px] cursor-pointer block"
            onClick={() => setLightbox(true)} />
          {isSent && (
            <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5 bg-black/30 rounded-full px-1.5 py-0.5">
              <span className="text-[10px] text-white/80">{time}</span>
              <Checks isRead={msg.is_read} white />
            </div>
          )}
        </div>
        {lightbox && (
          <ImageLightbox
            images={[mediaSrc(msg.text)]}
            startIndex={0}
            onClose={() => setLightbox(false)}
            onForward={() => setForwarding(true)}
          />
        )}
        {forwarding && (
          <ForwardModal
            userId={userId}
            onClose={() => setForwarding(false)}
            onForward={chatId => api.forwardMessage(chatId, { text: msg.text, type: 'image' })}
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
          {isSent && (
            <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5 bg-black/30 rounded-full px-1.5 py-0.5">
              <span className="text-[10px] text-white/80">{time}</span>
              <Checks isRead={msg.is_read} white />
            </div>
          )}
        </div>
        {videoOpen && <VideoLightbox src={mediaSrc(msg.text)} onClose={() => setVideoOpen(false)} />}
      </div>
    )
  }

  if (msg.type === 'audio') {
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <div className={`flex items-center gap-2 px-3.5 py-2.5 max-w-[260px] shadow-soft ${isSent ? 'bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-msg-out' : 'bg-bubbleIn text-bubbleIn-text rounded-msg-in'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          <audio src={mediaSrc(msg.text)} controls className="h-7 flex-1" style={{ minWidth: 0 }} />
          {isSent && <Checks isRead={msg.is_read} white />}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
      {leftSlot}

      <div
        className={[
          'max-w-[78%] px-4 py-2.5 text-lg font-semibold leading-relaxed break-words overflow-hidden shadow-soft',
          isSent
            ? 'bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-msg-out'
            : 'bg-bubbleIn text-bubbleIn-text rounded-msg-in',
        ].join(' ')}
      >
        {isGroup && !isSent && msg.sender_name && (
          <div className="text-sm font-extrabold text-accent mb-0.5">{msg.sender_name}</div>
        )}
        <span>{msg.text}</span>
        {/* Индикатор статуса шифрования */}
        {(msg as any)._msgStatus === 'unencrypted' && (
          <span className="text-[10px] opacity-50 ml-1" title="Отправлено до включения E2EE">🔓</span>
        )}
        {/* Время + галочки */}
        <span className={`text-sm ml-1.5 align-bottom whitespace-nowrap font-bold ${isSent ? 'opacity-70' : 'text-muted'}`}>
          {time}
          {isSent && <Checks isRead={msg.is_read} white={isSent} />}
        </span>
      </div>
    </div>
  )
}
