import React, { useState, useEffect, useMemo, useRef } from 'react'
import { IconX, IconCamera, IconCheck } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
import { useBackHandler } from '../../hooks/useBackHandler'
import type { User } from '../../types'

interface Props {
  currentUserId: string
  onClose: () => void
  onCreate: (data: { name: string; members: string[]; photo: File | null }) => void
}

export default function GroupChatModal({ currentUserId, onClose, onCreate }: Props) {
  useBackHandler(onClose)
  const [name,     setName]     = useState('')
  const [query,    setQuery]    = useState('')
  const [people,   setPeople]   = useState<User[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState<string | null>(null)
  const [photo,    setPhoto]    = useState<File | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  // Список родных целиком, а не поиск от трёх букв: при полусотне знакомых
  // все помещаются в один список, и галочками отмечать проще, чем искать.
  useEffect(() => {
    api.getDirectory()
      .then((list: User[]) => setPeople((list || []).filter(u => String(u.id) !== String(currentUserId))))
      .catch(() => setPeople([]))
  }, [currentUserId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people || []
    return (people || []).filter(u => u.name.toLowerCase().includes(q))
  }, [people, query])

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(f)
    setPreview(URL.createObjectURL(f))
    e.target.value = ''
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submit() {
    if (!name.trim()) { setError('Придумайте название — по нему группу будут узнавать'); return }
    if (selected.size < 1) { setError('Отметьте хотя бы одного человека'); return }
    setError(''); setCreating(true)
    try { await onCreate({ name: name.trim(), members: [...selected], photo }) }
    catch (err: any) { setError('Не получилось создать группу. Попробуйте ещё раз.'); console.warn(err); setCreating(false) }
  }

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-primary flex-1">Новая группа</h2>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted">
            <IconX size={22} stroke={2} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Фото группы"
              className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center relative overflow-hidden bg-surface2 border-2 border-dashed border-border hover:border-accent transition-colors"
            >
              {preview
                ? <img src={preview} className="w-full h-full object-cover" alt="" />
                : <IconCamera size={22} stroke={1.6} className="text-accent" />
              }
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Название группы"
              maxLength={100}
              autoFocus
              className="field flex-1"
            />
          </div>

          <div>
            <div className="text-md text-muted mb-2">
              Кого добавить{selected.size ? `: выбрано ${selected.size}` : ''}
            </div>
            {(people?.length || 0) > 8 && (
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Найти по имени"
                className="field mb-2"
              />
            )}
            {people === null && <p className="text-md text-muted py-4 text-center">Загрузка…</p>}
            <div className="flex flex-col">
              {shown.map(u => {
                const isOn = selected.has(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className="flex items-center gap-3 py-2 rounded-2xl hover:bg-bg transition-colors text-left"
                  >
                    <Avatar name={u.name} id={u.id} imageUrl={u.image_url} size={48} />
                    <span className="flex-1 min-w-0 text-lg font-bold text-primary ellipsis">{u.name}</span>
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-1"
                      style={isOn
                        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                        : { border: '2px solid var(--border)' }}
                    >
                      {isOn && <IconCheck size={16} stroke={3} />}
                    </span>
                  </button>
                )
              })}
              {people !== null && shown.length === 0 && (
                <p className="text-md text-muted py-4 text-center">Никого не нашлось</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex-shrink-0 pb-safe">
          {error && <p className="text-md font-bold text-danger text-center mb-2">{error}</p>}
          <button onClick={submit} disabled={creating} className="btn btn-primary w-full">
            {creating ? 'Создаём…' : 'Создать группу'}
          </button>
        </div>
      </div>
    </div>
  )
}
