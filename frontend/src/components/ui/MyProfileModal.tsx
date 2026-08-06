import React, { useEffect, useRef, useState } from 'react'
import { IconX, IconPhone, IconAlignLeft, IconLogout, IconId, IconPencil, IconCheck, IconCamera, IconPalette, IconChevronRight } from '@tabler/icons-react'
import Avatar from './Avatar'
import AppearanceModal from './AppearanceModal'
import { useTheme } from '../../theme'
import { api } from '../../api'
import { useBackHandler } from '../../hooks/useBackHandler'

interface Props {
  userId: string
  onClose: () => void
  onLogout: () => void
  /** Смена ключевой пары E2EE — сама операция живёт в App, где хранятся ключи. */
  onRotateKeys: (password: string) => Promise<void>
}

export default function MyProfileModal({ userId, onClose, onLogout, onRotateKeys }: Props) {
  const [user,    setUser]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotatePassword, setRotatePassword] = useState('')
  const [rotateError, setRotateError] = useState('')
  const [rotateBusy, setRotateBusy] = useState(false)
  const [rotateDone, setRotateDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { palette } = useTheme()
  const paletteLabel = { hearth: 'Очаг', forest: 'Лес', sky: 'Небо' }[palette]

  useBackHandler(onClose)

  useEffect(() => {
    // Свой профиль берём через /auth/me: телефон отдаётся только там —
    // в чужих профилях его больше нет.
    api.getMe().then(setUser).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  async function confirmDelete() {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.deleteAccount(deletePassword)
      onLogout()
    } catch (err: any) {
      setDeleteError(err.message === '401' || err.message === 'Invalid credentials'
        ? 'Неверный пароль'
        : 'Не получилось удалить: ' + err.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmRotate() {
    setRotateBusy(true)
    setRotateError('')
    try {
      await onRotateKeys(rotatePassword)
      setRotateDone(true)
      setRotatePassword('')
    } catch (err: any) {
      setRotateError(err.message === '401' || err.message === 'Invalid credentials'
        ? 'Неверный пароль'
        : 'Не получилось сменить ключ: ' + err.message)
    } finally {
      setRotateBusy(false)
    }
  }

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
      <div className="bg-surface rounded-card w-full max-w-md shadow-xl overflow-hidden max-h-[90dvh] flex flex-col">
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

              {/* Внешний вид */}
              <div className="p-4 pb-0">
                <button
                  onClick={() => setShowAppearance(true)}
                  className="w-full flex items-center gap-3.5 bg-bg rounded-2xl px-4 py-3.5 text-left hover:bg-surface2 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-accent flex-shrink-0">
                    <IconPalette size={19} stroke={1.5} />
                  </div>
                  <span className="flex-1 text-md font-bold text-primary">Внешний вид</span>
                  <span className="text-sm font-bold text-accent">{paletteLabel}</span>
                  <IconChevronRight size={18} stroke={2} className="text-muted" />
                </button>
              </div>

              {/* Logout */}
              <div className="p-4 pb-safe flex flex-col gap-2">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 bg-bg text-red-500 rounded-2xl py-2.5 text-sm font-bold hover:bg-border transition-colors"
                >
                  <IconLogout size={16} stroke={1.5} />
                  Выйти из аккаунта
                </button>
                <button
                  onClick={() => setRotating(true)}
                  className="w-full text-center text-xs text-muted py-1 hover:text-accent transition-colors"
                >
                  Сменить ключ шифрования
                </button>
                <button
                  onClick={() => setDeleting(true)}
                  className="w-full text-center text-xs text-muted py-1 hover:text-red-500 transition-colors"
                >
                  Удалить аккаунт
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showAppearance && <AppearanceModal onClose={() => setShowAppearance(false)} />}

      {/* Смена ключа E2EE: последствия необратимы, поэтому объясняем их
          заранее и подтверждаем паролем */}
      {rotating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={e => e.target === e.currentTarget && !rotateBusy && setRotating(false)}>
          <div className="bg-surface rounded-card w-full max-w-xs p-5 shadow-xl">
            {rotateDone ? (
              <>
                <div className="text-lg font-extrabold text-primary mb-1">Ключ сменён</div>
                <p className="text-xs text-muted mb-3">
                  Собеседники увидят пометку «ключ изменился» — это нормально, но
                  стоит сверить с ними новый код безопасности в профиле.
                  В групповых чатах переписка появится, когда кто-нибудь из
                  участников откроет чат.
                </p>
                <button
                  onClick={() => { setRotating(false); setRotateDone(false) }}
                  className="w-full bg-accent text-onAccent rounded-xl py-2.5 text-sm font-bold"
                >
                  Понятно
                </button>
              </>
            ) : (
              <>
                <div className="text-lg font-extrabold text-primary mb-1">Сменить ключ шифрования?</div>
                <p className="text-xs text-muted mb-3">
                  Нужно, если ключ мог попасть в чужие руки. Вся переписка,
                  зашифрованная прежним ключом, <b>перестанет открываться</b> —
                  и у вас, и у собеседников. Отменить это будет нельзя.
                </p>
                <input
                  type="password"
                  value={rotatePassword}
                  onChange={e => setRotatePassword(e.target.value)}
                  placeholder="Введите пароль"
                  className="w-full h-11 bg-bg border border-border rounded-xl px-3 text-md text-primary outline-none mb-3"
                />
                {rotateError && <p className="text-xs font-bold text-red-500 mb-2">{rotateError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRotating(false); setRotatePassword(''); setRotateError('') }}
                    disabled={rotateBusy}
                    className="flex-1 bg-bg text-primary rounded-xl py-2.5 text-sm font-bold hover:bg-border transition-colors disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={confirmRotate}
                    disabled={rotateBusy || rotatePassword.length < 8}
                    className="flex-1 bg-accent text-onAccent rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    {rotateBusy ? 'Меняю…' : 'Сменить'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Удаление аккаунта: необратимо, поэтому подтверждается паролем */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={e => e.target === e.currentTarget && setDeleting(false)}>
          <div className="bg-surface rounded-card w-full max-w-xs p-5 shadow-xl">
            <div className="text-lg font-extrabold text-primary mb-1">Удалить аккаунт?</div>
            <p className="text-xs text-muted mb-3">
              Будут удалены ваш профиль, сообщения, посты, комментарии, альбомы и
              загруженные файлы. Восстановить их будет нельзя.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="Введите пароль"
              className="w-full h-11 bg-bg border border-border rounded-xl px-3 text-md text-primary outline-none mb-3"
            />
            {deleteError && <p className="text-xs font-bold text-red-500 mb-2">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleting(false); setDeletePassword(''); setDeleteError('') }}
                className="flex-1 bg-bg text-primary rounded-xl py-2.5 text-sm font-bold hover:bg-border transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteBusy || deletePassword.length < 8}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {deleteBusy ? 'Удаляю…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
