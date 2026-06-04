import React from 'react'
import type { Message, Member } from '../../types'
import Avatar from '../ui/Avatar'

function fmtTime(dt?: string): string {
  if (!dt) return ''
  const d = new Date(dt)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

// Одна галочка — отправлено, две — прочитано
function Checks({ isRead, white }: { isRead: boolean; white?: boolean }) {
  const color = white ? 'rgba(255,255,255,0.65)' : '#A0A0B0'
  const readColor = white ? '#fff' : '#5B5EF4'
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
          <img src={msg.text} alt="" className="max-w-[220px] rounded-xl cursor-pointer block"
            onClick={() => window.open(msg.text, '_blank')} />
          {isSent && (
            <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5 bg-black/30 rounded-full px-1.5 py-0.5">
              <span className="text-[10px] text-white/80">{time}</span>
              <Checks isRead={msg.is_read} white />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (msg.type === 'audio') {
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
        {leftSlot}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-[14px] max-w-[260px] ${isSent ? 'bg-accent text-white rounded-br-[3px]' : 'bg-[#ECEDF5] text-primary rounded-bl-[3px]'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          <audio src={msg.text} controls className="h-7 flex-1" style={{ minWidth: 0 }} />
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
          'max-w-[68%] px-3 py-2 text-md leading-relaxed',
          isSent
            ? 'bg-accent text-white rounded-[14px] rounded-br-[3px]'
            : 'bg-[#ECEDF5] text-primary rounded-[14px] rounded-bl-[3px]',
        ].join(' ')}
      >
        {isGroup && !isSent && msg.sender_name && (
          <div className="text-xs font-medium text-accent-text mb-0.5">{msg.sender_name}</div>
        )}
        <span>{msg.text}</span>
        {/* Индикатор статуса шифрования */}
        {(msg as any)._msgStatus === 'unencrypted' && (
          <span className="text-[10px] opacity-50 ml-1" title="Отправлено до включения E2EE">🔓</span>
        )}
        {/* Время + галочки */}
        <span className={`text-xs ml-1.5 align-bottom whitespace-nowrap ${isSent ? 'text-white/55' : 'text-[#888]'}`}>
          {time}
          {isSent && <Checks isRead={msg.is_read} white={isSent} />}
        </span>
      </div>
    </div>
  )
}
