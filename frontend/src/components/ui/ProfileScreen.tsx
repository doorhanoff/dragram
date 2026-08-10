import React, { useEffect, useRef, useState } from 'react'
import {
  IconAlignLeft, IconLogout, IconPencil, IconCheck, IconCamera, IconPalette,
  IconChevronRight, IconBookmark, IconAddressBook, IconX,
} from '@tabler/icons-react'
import Avatar from './Avatar'
import AppearanceScreen from './AppearanceScreen'
import { ask, sayError } from './dialogs'
import { api } from '../../api'
import { withCache } from '../../dataCache'
import { useTheme } from '../../theme'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * Профиль — полноэкранный раздел, а не окошко посреди экрана.
 *
 * Раньше он открывался карточкой с полями по краям, сквозь которые
 * просвечивали «Альбомы», а нижняя панель оставалась на месте: человек не
 * понимал, вышел он из альбомов или нет и куда нажать, чтобы выйти.
 */
interface Props {
  userId: string
  onLogout: () => void
  onOpenSaved: () => void
  /** Повторный поиск знакомых по телефонной книге. Только в приложении. */
  onSyncContacts?: () => Promise<void>
}

export default function ProfileScreen({ userId, onLogout, onOpenSaved, onSyncContacts }: Props) {
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
  const [syncing, setSyncing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { palette } = useTheme()
  const paletteLabel = { hearth: 'Очаг', forest: 'Лес', sky: 'Небо' }[palette]

  useEffect(() => {
    // Свой профиль берём через /auth/me: телефон отдаётся только там —
    // в чужих профилях его больше нет. Кешируем: без сети иначе не посмотреть
    // даже собственный номер, а его как раз чаще всего и ищут, чтобы продиктовать.
    withCache<any>(`me:${userId}`, () => api.getMe(), setUser)
      .finally(() => setLoading(false))
  }, [userId])

  async function confirmDelete() {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.deleteAccount(deletePassword)
      onLogout()
    } catch (err: any) {
      console.warn('Удаление аккаунта:', err)
      setDeleteError(err?.message === '401' || err?.message === 'Invalid credentials'
        ? 'Неверный пароль'
        : 'Не получилось удалить. Попробуйте ещё раз.')
    } finally {
      setDeleteBusy(false)
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
    } catch (err) {
      sayError('Не удалось сохранить', err)
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
      setUser(await api.getMe())
    } catch (err) {
      sayError('Не удалось поставить фото', err)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function requestLogout() {
    const ok = await ask({
      title: 'Выйти из Dragram?',
      text: 'Чтобы войти снова, понадобится номер телефона и пароль. Переписка на этом устройстве будет очищена.',
      confirmLabel: 'Выйти',
      cancelLabel: 'Остаться',
    })
    if (ok) onLogout()
  }

  if (showAppearance) return <AppearanceScreen onBack={() => setShowAppearance(false)} />

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-bg">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-8">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl font-bold text-primary tracking-tight flex-1">Профиль</h1>
          {!loading && user && (
            editing ? (
              <button onClick={saveEdit} disabled={saving} aria-label="Сохранить" className="tap rounded-2xl text-accent disabled:opacity-50">
                <IconCheck size={26} stroke={2.2} />
              </button>
            ) : (
              <button onClick={startEdit} aria-label="Редактировать" className="tap rounded-2xl text-muted">
                <IconPencil size={24} stroke={1.9} />
              </button>
            )
          )}
        </div>

        {loading && <div className="py-12 text-center text-md text-muted">Загрузка…</div>}

        {!loading && user && (
          <>
            <div className="flex flex-col items-center py-4 gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative group" aria-label="Изменить фото">
                <Avatar name={user.name} id={user.id} imageUrl={user.image_url} size={112} />
                <span className="absolute bottom-0 right-0 w-11 h-11 rounded-full bg-accent text-onAccent flex items-center justify-center border-4" style={{ borderColor: 'var(--bg)' }}>
                  <IconCamera size={20} stroke={1.8} />
                </span>
                {avatarUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white text-md">…</div>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleAvatarFile} />

              {/* Имя показано один раз. Раньше оно стояло крупно под аватаром
                  и тут же повторялось строкой «Имя» с иконкой. */}
              {editing ? (
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={50}
                  className="field text-center"
                  placeholder="Ваше имя"
                />
              ) : (
                <>
                  <div className="text-2xl font-bold text-primary text-center">{user.name}</div>
                  {/* В своём профиле полезен номер, а не «в сети»: открывая
                      свой профиль, человек всегда в сети. Номер здесь ищут
                      чаще всего — чтобы продиктовать. */}
                  {user.phone_number && (
                    <div className="text-xl text-muted tabular-nums">{user.phone_number}</div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-start gap-3 px-4 py-3.5 bg-surface rounded-card mb-3">
              <IconAlignLeft size={20} stroke={1.7} className="text-muted flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted mb-0.5">О себе</div>
                {editing
                  ? <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder="Расскажите о себе…"
                      className="w-full text-md text-primary bg-bg rounded-2xl px-3 py-2 outline-none resize-none focus:ring-1 focus:ring-accent"
                    />
                  : <div className="text-md text-primary whitespace-pre-wrap break-words">{user.description || '—'}</div>
                }
              </div>
            </div>

            {editing && (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setEditing(false)} className="btn btn-secondary flex-1">Отмена</button>
                <button onClick={saveEdit} disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            )}

            {/* Все действия — однотипные строки списка. */}
            <div className="flex flex-col gap-2">
              <button onClick={() => setShowAppearance(true)} className="row-item">
                <span className="w-10 h-10 rounded-2xl bg-surface2 flex items-center justify-center text-accent flex-shrink-0">
                  <IconPalette size={21} stroke={1.7} />
                </span>
                <span className="flex-1 text-lg font-bold">Внешний вид</span>
                <span className="text-md text-accent">{paletteLabel}</span>
                <IconChevronRight size={20} stroke={2} className="text-muted" />
              </button>

              {/* «Сохранённые» переехали сюда из фильтров ленты — здесь их и ищут. */}
              <button onClick={onOpenSaved} className="row-item">
                <span className="w-10 h-10 rounded-2xl bg-surface2 flex items-center justify-center text-accent flex-shrink-0">
                  <IconBookmark size={21} stroke={1.7} />
                </span>
                <span className="flex-1 text-lg font-bold">Сохранённые записи</span>
                <IconChevronRight size={20} stroke={2} className="text-muted" />
              </button>

              {onSyncContacts && (
                <button
                  onClick={async () => { setSyncing(true); try { await onSyncContacts() } finally { setSyncing(false) } }}
                  disabled={syncing}
                  className="row-item disabled:opacity-50"
                >
                  <span className="w-10 h-10 rounded-2xl bg-surface2 flex items-center justify-center text-accent flex-shrink-0">
                    <IconAddressBook size={21} stroke={1.7} />
                  </span>
                  <span className="flex-1 text-lg font-bold">
                    {syncing ? 'Ищем родных…' : 'Найти родных по телефонной книге'}
                  </span>
                  <IconChevronRight size={20} stroke={2} className="text-muted" />
                </button>
              )}

              {/* Выход — обычный пункт, без красноты: красный цвет приберегаем
                  для по-настоящему необратимого, то есть удаления аккаунта. */}
              <button onClick={requestLogout} className="row-item">
                <span className="w-10 h-10 rounded-2xl bg-surface2 flex items-center justify-center text-muted flex-shrink-0">
                  <IconLogout size={21} stroke={1.7} />
                </span>
                <span className="flex-1 text-lg font-bold">Выйти</span>
              </button>

              <button onClick={() => setDeleting(true)} className="row-item" style={{ color: 'var(--danger)' }}>
                <span className="flex-1 text-md font-bold pl-1">Удалить аккаунт навсегда</span>
              </button>
            </div>
          </>
        )}
      </div>

      {deleting && (
        <DeleteAccountSheet
          password={deletePassword}
          error={deleteError}
          busy={deleteBusy}
          onPassword={setDeletePassword}
          onConfirm={confirmDelete}
          onClose={() => { setDeleting(false); setDeletePassword(''); setDeleteError('') }}
        />
      )}
    </div>
  )
}

function DeleteAccountSheet({ password, error, busy, onPassword, onConfirm, onClose }: {
  password: string
  error: string
  busy: boolean
  onPassword: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  useBackHandler(onClose)
  return (
    <div className="sheet-backdrop" style={{ zIndex: 60 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-xl font-bold text-primary flex-1" style={{ color: 'var(--danger)' }}>Удалить аккаунт?</span>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted"><IconX size={22} stroke={2} /></button>
        </div>
        <div className="p-4 pb-safe flex flex-col gap-3">
          <p className="text-md text-muted leading-relaxed">
            Будут удалены ваш профиль, сообщения, записи, комментарии, альбомы и
            загруженные файлы. Восстановить их будет нельзя.
          </p>
          <input
            type="password"
            value={password}
            onChange={e => onPassword(e.target.value)}
            placeholder="Введите пароль"
            className="field"
          />
          {error && <p className="text-md font-bold text-danger">{error}</p>}
          <button
            onClick={onConfirm}
            disabled={busy || password.length < 8}
            className="btn btn-primary w-full"
            style={{ background: 'var(--danger)', color: '#fff' }}
          >
            {busy ? 'Удаляем…' : 'Удалить навсегда'}
          </button>
          <button onClick={onClose} className="btn btn-secondary w-full">Оставить всё как есть</button>
        </div>
      </div>
    </div>
  )
}
