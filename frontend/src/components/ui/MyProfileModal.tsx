import React, { useEffect, useState } from 'react'
import { IconX, IconPhone, IconAlignLeft, IconLogout, IconId } from '@tabler/icons-react'
import Avatar from './Avatar'
import { api } from '../../api'

interface Props {
  userId: string
  onClose: () => void
  onLogout: () => void
}

export default function MyProfileModal({ userId, onClose, onLogout }: Props) {
  const [user,    setUser]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getUser(userId).then(setUser).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-border flex-shrink-0">
          <span className="text-lg font-medium text-primary">Профиль</span>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-bg"><IconX size={18} stroke={1.5} /></button>
        </div>

        <div className="overflow-y-auto">
          {loading && <div className="py-12 text-center text-sm text-muted">Загрузка…</div>}

          {!loading && user && (
            <>
              {/* Avatar area */}
              <div className="flex flex-col items-center px-6 py-6 gap-3">
                <Avatar name={user.name} id={user.id} imageUrl={user.image_url} isActive={user.is_active} size={104} />
                <div className="text-center">
                  <div className="text-xl font-medium text-primary">{user.name}</div>
                  {user.is_active
                    ? <div className="flex items-center justify-center gap-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-online" /><span className="text-sm text-online">в сети</span></div>
                    : <div className="text-sm text-muted mt-1">не в сети</div>
                  }
                </div>
              </div>

              {/* Info */}
              <div className="border-t border-border">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                  <IconId size={16} stroke={1.5} className="text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted mb-0.5">Имя</div>
                    <div className="text-md text-primary">{user.name}</div>
                  </div>
                </div>
                {user.phone_number && (
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                    <IconPhone size={16} stroke={1.5} className="text-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted mb-0.5">Телефон</div>
                      <div className="text-md text-primary">{user.phone_number}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 px-5 py-3.5">
                  <IconAlignLeft size={16} stroke={1.5} className="text-muted flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted mb-0.5">О себе</div>
                    <div className="text-md text-primary whitespace-pre-wrap break-words">{user.description || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Logout */}
              <div className="p-4 pb-safe">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 bg-bg text-red-500 rounded-xl py-2.5 text-sm font-medium hover:bg-border transition-colors"
                >
                  <IconLogout size={16} stroke={1.5} />
                  Выйти из аккаунта
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
