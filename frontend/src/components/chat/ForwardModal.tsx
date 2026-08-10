import React, { useEffect, useState } from 'react'
import { IconX, IconCheck } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
import { sayError } from '../ui/dialogs'
import { useBackHandler } from '../../hooks/useBackHandler'
import type { Chat } from '../../types'

function chatName(chat: Chat, myId: string): string {
  if (chat.name) return chat.name
  const other = chat.members?.find(m => String(m.id) !== String(myId))
  return other?.name || `Чат ${chat.id.slice(0, 6)}`
}

interface Props {
  userId: string
  onClose: () => void
  /** Пересылка в выбранный чат. Текст App перешифровывает ключом этого чата. */
  onForward: (chatId: string) => Promise<void>
}

export default function ForwardModal({ userId, onClose, onForward }: Props) {
  useBackHandler(onClose)
  const [chats,   setChats]   = useState<Chat[] | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [doneId,  setDoneId]  = useState<string | null>(null)

  useEffect(() => { api.getChats().then(setChats).catch(() => setChats([])) }, [])

  async function pick(chatId: string) {
    if (sendingId) return
    setSendingId(chatId)
    try {
      await onForward(chatId)
      setDoneId(chatId)
      setTimeout(onClose, 500)
    } catch (err) {
      sayError('Не удалось переслать', err)
      setSendingId(null)
    }
  }

  return (
    <div className="sheet-backdrop" style={{ zIndex: 600 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-primary flex-1">Кому переслать</h2>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted"><IconX size={22} stroke={2} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2 pb-safe">
          {chats === null && <p className="text-md text-muted text-center py-8">Загрузка…</p>}
          {chats !== null && chats.length === 0 && <p className="text-md text-muted text-center py-8">Пока не с кем — начните первый чат</p>}
          {chats?.map(c => {
            const isGroup = (c.members?.length || 0) > 2
            const other   = c.members?.find(m => String(m.id) !== String(userId))
            const imgUrl  = isGroup ? c.image_url : other?.image_url
            const name    = chatName(c, userId)
            const isSending = sendingId === c.id
            const isDone    = doneId === c.id
            return (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                disabled={!!sendingId}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-bg transition-colors disabled:opacity-60 text-left"
              >
                <Avatar name={name} id={c.id} imageUrl={imgUrl} size={48} />
                <span className="flex-1 min-w-0 text-lg font-bold text-primary ellipsis">{name}</span>
                {isDone ? (
                  <IconCheck size={20} className="text-online flex-shrink-0" />
                ) : isSending ? (
                  <span className="text-md text-muted flex-shrink-0">…</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
