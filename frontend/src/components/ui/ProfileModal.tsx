import React, { useEffect, useState } from 'react'
import { IconX, IconMessage2, IconAlignLeft } from '@tabler/icons-react'
import Avatar from './Avatar'
import { api } from '../../api'
import { withCache } from '../../dataCache'
import { fmtPresence } from '../../utils'
import { useBackHandler } from '../../hooks/useBackHandler'

interface Props {
  userId: string
  isMe?: boolean
  onClose: () => void
  onStartChat?: (userId: string) => void
}

export default function ProfileModal({ userId, isMe, onClose, onStartChat }: Props) {
  const [user,    setUser]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useBackHandler(onClose)

  useEffect(() => {
    // Профиль тоже кешируем: без сети иначе пустое окно с «Загрузка…».
    // Статус «в сети» при этом может быть вчерашним — но он и так живёт
    // минуту, а имя с фотографией не меняются.
    withCache<any>(`user:${userId}`, () => api.getUser(userId), setUser)
      .finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex justify-end px-2 pt-2">
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted">
            <IconX size={22} stroke={2} />
          </button>
        </div>

        {loading && <div className="py-12 text-center text-md text-muted">Загрузка…</div>}

        {!loading && user && (
          <div className="pb-safe">
            <div className="flex flex-col items-center px-6 pb-5 gap-3">
              <Avatar name={user.name} id={user.id} imageUrl={user.image_url} isActive={user.is_active} size={96} />
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{user.name}</div>
                {/* Строка есть всегда: «в сети», «был(а) недавно» или
                    «был(а) вчера в 21:40» — иначе непонятно, ждать ли ответа. */}
                <div className={`text-md mt-0.5 ${user.is_active ? 'text-online' : 'text-muted'}`}>
                  {fmtPresence(!!user.is_active, user.last_seen)}
                </div>
              </div>
            </div>

            {user.description && (
              <div className="flex items-start gap-3 px-5 py-3 border-t border-border">
                <IconAlignLeft size={20} stroke={1.7} className="text-muted flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm text-muted mb-0.5">О себе</div>
                  <div className="text-md text-primary">{user.description}</div>
                </div>
              </div>
            )}

            {!isMe && onStartChat && (
              <div className="p-4">
                <button onClick={() => { onStartChat(user.id); onClose() }} className="btn btn-primary w-full">
                  <IconMessage2 size={20} stroke={1.8} />
                  Написать
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
