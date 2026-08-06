import React, { useEffect, useState } from 'react'
import { IconX, IconMessage2, IconPhone, IconAlignLeft, IconShieldLock, IconAlertTriangle } from '@tabler/icons-react'
import Avatar from './Avatar'
import { api } from '../../api'
import { computeSafetyNumber, myPublicKeyBase64, checkPeerKey, trustPeerKey } from '../../crypto'
import { useBackHandler } from '../../hooks/useBackHandler'

interface Props {
  userId: string
  myId?: string
  isMe?: boolean
  onClose: () => void
  onStartChat?: (userId: string) => void
}

export default function ProfileModal({ userId, myId, isMe, onClose, onStartChat }: Props) {
  const [user,    setUser]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Safety number: чтобы убедиться, что переписку шифруют именно вашим ключом,
  // а не подставленным сервером, номера сверяют вживую — они должны совпасть.
  const [safety,  setSafety]  = useState<string | null>(null)
  const [keyChanged, setKeyChanged] = useState(false)
  const [showSafety, setShowSafety] = useState(false)

  useBackHandler(onClose)

  useEffect(() => {
    api.getUser(userId).then(setUser).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  useEffect(() => {
    if (isMe || !myId || myId === userId) return
    let cancelled = false
    ;(async () => {
      try {
        const [mine, theirs] = await Promise.all([
          myPublicKeyBase64(myId),
          api.getUserPublicKey(userId).then((r: any) => r.public_key),
        ])
        if (cancelled || !mine || !theirs) return
        setSafety(await computeSafetyNumber(mine, theirs))
        setKeyChanged((await checkPeerKey(myId, userId, theirs)) === 'changed')
      } catch {
        // У собеседника может не быть ключа (не заходил после введения E2EE) —
        // это не ошибка, просто сверять нечего.
      }
    })()
    return () => { cancelled = true }
  }, [userId, myId, isMe])

  async function acceptNewKey() {
    try {
      const { public_key } = await api.getUserPublicKey(userId)
      await trustPeerKey(myId!, userId, public_key)
      setKeyChanged(false)
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-card w-full max-w-xs shadow-xl overflow-hidden">
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
                <div className="text-lg font-extrabold text-primary">{user.name}</div>
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

            {/* Шифрование */}
            {safety && (
              <div className="border-t border-border">
                {keyChanged && (
                  <div className="flex items-start gap-3 px-5 py-3 bg-amber-500/10">
                    <IconAlertTriangle size={15} stroke={1.5} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-md text-primary font-bold">Ключ собеседника изменился</div>
                      <div className="text-xs text-muted mt-0.5">
                        Обычно это смена устройства или переустановка приложения. Но так же
                        выглядит и попытка подменить ключ — сверьте номер безопасности лично,
                        прежде чем продолжать.
                      </div>
                      <button onClick={acceptNewKey}
                        className="mt-2 text-xs font-bold text-accent hover:opacity-80">
                        Я сверил(а) — доверять новому ключу
                      </button>
                    </div>
                  </div>
                )}
                <button onClick={() => setShowSafety(v => !v)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-bg">
                  <IconShieldLock size={15} stroke={1.5} className="text-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-muted mb-0.5">Номер безопасности</div>
                    <div className="text-md text-primary">
                      {showSafety ? 'Скрыть' : 'Показать и сверить'}
                    </div>
                  </div>
                </button>
                {showSafety && (
                  <div className="px-5 pb-4">
                    <div className="font-mono text-sm text-primary leading-6 tracking-wide break-all select-all">
                      {safety}
                    </div>
                    <div className="text-xs text-muted mt-2">
                      Откройте этот же экран у собеседника. Если числа совпадают, переписку
                      читаете только вы двое.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action */}
            {!isMe && onStartChat && (
              <div className="p-4">
                <button
                  onClick={() => { onStartChat(user.id); onClose() }}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-2xl py-2.5 text-sm font-bold shadow-pop transition-opacity hover:opacity-90"
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
