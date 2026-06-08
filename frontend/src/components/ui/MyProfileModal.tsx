import React, { useEffect, useRef, useState } from 'react'
import { IconX, IconPhone, IconAlignLeft, IconLogout, IconId, IconPencil, IconCheck, IconCamera } from '@tabler/icons-react'
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
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getUser(userId).then(setUser).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  function startEdit() {
    setName(user?.name || '')
    setDescription(user?.description || '')
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const updated = await api.updateProfile({ name, description })
      setUser((prev: any) => ({ ...prev, ...updated }))
      setEditing(false)
    } catch (err: any) {
      alert('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAvatarUploading(true)
    try {
      await api.uploadAvatar(file)
      const fresh = await api.getUser(userId)
      setUser(fresh)
    } catch (err: any) {
      alert('Ошибка: ' + err.message)
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-border flex-shrink-0">
          <span className="text-lg font-medium text-primary">Профиль</span>
          <div className="flex items-center gap-1">
            {!loading && user && !editing && (
              <button onClick={startEdit} title="Редактировать" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-bg">
                <IconPencil size={17} stroke={1.5} />
              </button>
            )}
            {editing && (
              <button onClick={saveEdit} disabled={saving} title="Сохранить" className="w-8 h-8 rounded-lg flex items-center justify-center text-accent hover:bg-bg disabled:opacity-50">
                <IconCheck size={18} stroke={1.5} />
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-bg"><IconX size={18} stroke={1.5} /></button>
          </div>
        </div>

        <div className="overflow-y-auto">
          {loading && <div className="py-12 text-center text-sm text-muted">Загрузка…</div>}

          {!loading && user && (
            <>
              {/* Avatar area */}
              <div className="flex flex-col items-center px-6 py-6 gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative group"
                  title="Изменить фото"
                >
                  <Avatar name={user.name} id={user.id} imageUrl={user.image_url} isActive={user.is_active} size={104} />
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconCamera size={24} stroke={1.5} className="text-white" />
                  </div>
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white text-xs">…</div>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleAvatarFile} />
                <div className="text-center">
                  {!editing && <div className="text-xl font-medium text-primary">{user.name}</div>}
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
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted mb-0.5">Имя</div>
                    {editing
                      ? <input
                          value={name}
                          onChange={e => setName(e.target.value)}
                          maxLength={50}
                          className="w-full text-md text-primary bg-bg rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent"
                        />
                      : <div className="text-md text-primary">{user.name}</div>
                    }
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
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted mb-0.5">О себе</div>
                    {editing
                      ? <textarea
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          maxLength={200}
                          rows={3}
                          placeholder="Расскажите о себе…"
                          className="w-full text-md text-primary bg-bg rounded-lg px-2 py-1.5 outline-none resize-none focus:ring-1 focus:ring-accent"
                        />
                      : <div className="text-md text-primary whitespace-pre-wrap break-words">{user.description || '—'}</div>
                    }
                  </div>
                </div>

                {editing && (
                  <div className="flex gap-2 px-5 pb-3.5">
                    <button
                      onClick={() => setEditing(false)}
                      className="flex-1 text-sm font-medium text-muted bg-bg rounded-xl py-2.5 hover:bg-border transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex-1 text-sm font-medium text-white bg-accent rounded-xl py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                )}
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
