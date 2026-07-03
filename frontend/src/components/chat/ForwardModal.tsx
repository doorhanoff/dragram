import React, { useEffect, useState } from 'react'
import { IconX, IconCheck } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
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
    } catch (err: any) {
      alert('Не удалось переслать: ' + err.message)
      setSendingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[600] p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-sm shadow-xl flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-extrabold text-primary">Переслать</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-bg"><IconX size={16} stroke={1.5} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2">
          {chats === null && <p className="text-sm text-muted text-center py-8">Загрузка…</p>}
          {chats !== null && chats.length === 0 && <p className="text-sm text-muted text-center py-8">Нет чатов</p>}
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg transition-colors disabled:opacity-60 text-left"
              >
                <Avatar name={name} id={c.id} imageUrl={imgUrl} size={40} />
                <span className="flex-1 min-w-0 text-md font-extrabold text-primary ellipsis">{name}</span>
                {isDone ? (
                  <IconCheck size={18} className="text-online flex-shrink-0" />
                ) : isSending ? (
                  <span className="text-xs text-muted flex-shrink-0">…</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
