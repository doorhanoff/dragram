import React, { useEffect, useState } from 'react'
import { IconX, IconMessage2, IconPhone, IconAlignLeft } from '@tabler/icons-react'
import Avatar from './Avatar'
import { api } from '../../api'

interface Props {
  userId: string
  isMe?: boolean
  onClose: () => void
  onStartChat?: (userId: string) => void
}

export default function ProfileModal({ userId, isMe, onClose, onStartChat }: Props) {
  const [user,    setUser]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getUser(userId).then(setUser).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-xs shadow-xl overflow-hidden">
        {/* Close */}
        <div className="flex justify-end p-3">
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-bg"><IconX size={16} stroke={1.5} /></button>
        </div>

        {loading && <div className="py-12 text-center text-sm text-muted">Загрузка…</div>}

        {!loading && user && (
          <>
            {/* Avatar area */}
            <div className="flex flex-col items-center px-6 pb-5 gap-3">
              <Avatar name={user.name} id={user.id} imageUrl={user.image_url} isActive={user.is_active} size={80} />
              <div className="text-center">
                <div className="text-lg font-medium text-primary">{user.name}</div>
                {user.is_active
                  ? <div className="flex items-center justify-center gap-1 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-online" /><span className="text-sm text-online">в сети</span></div>
                  : <div className="text-sm text-muted mt-0.5">не в сети</div>
                }
              </div>
            </div>

            {/* Info */}
            <div className="border-t border-border">
              {user.phone_number && (
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
                  <IconPhone size={15} stroke={1.5} className="text-muted flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted mb-0.5">Телефон</div>
                    <div className="text-md text-primary">{user.phone_number}</div>
                  </div>
                </div>
              )}
              {user.description && (
                <div className="flex items-start gap-3 px-5 py-3">
                  <IconAlignLeft size={15} stroke={1.5} className="text-muted flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted mb-0.5">О себе</div>
                    <div className="text-md text-primary">{user.description}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Action */}
            {!isMe && onStartChat && (
              <div className="p-4">
                <button
                  onClick={() => { onStartChat(user.id); onClose() }}
                  className="w-full flex items-center justify-center gap-2 bg-accent text-white rounded-xl py-2.5 text-sm font-medium hover:bg-accent-text transition-colors"
                >
                  <IconMessage2 size={16} stroke={1.5} />
                  Написать
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
