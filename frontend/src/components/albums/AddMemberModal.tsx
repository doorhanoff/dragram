import React, { useEffect, useMemo, useState } from 'react'
import { IconX, IconPlus, IconCheck } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
import { useBackHandler } from '../../hooks/useBackHandler'
import type { Member, User } from '../../types'

interface Props {
  members: Member[]
  onClose: () => void
  onAdd: (userId: string) => Promise<void>
}

export default function AddMemberModal({ members, onClose, onAdd }: Props) {
  useBackHandler(onClose)
  const [people, setPeople] = useState<User[] | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Список родных целиком: при полусотне знакомых искать не нужно, а поиск
  // «от трёх букв» на пустом экране выглядел так, будто человека здесь нет.
  useEffect(() => {
    api.getDirectory().then((list: User[]) => setPeople(list || [])).catch(() => setPeople([]))
  }, [])

  const shown = useMemo(() => {
    const already = new Set(members.map(m => String(m.id)))
    const q = query.trim().toLowerCase()
    return (people || [])
      .filter(u => !already.has(String(u.id)))
      .filter(u => !q || u.name.toLowerCase().includes(q))
  }, [people, members, query])

  async function add(u: User) {
    setAdding(u.id)
    try {
      await onAdd(u.id)
      setAdded(prev => new Set(prev).add(u.id))
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-primary flex-1">Кого добавить в альбом</h2>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted">
            <IconX size={22} stroke={2} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 pb-safe">
          {(people?.length || 0) > 8 && (
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Найти по имени"
              className="field mb-3"
            />
          )}

          {people === null && <p className="text-md text-muted py-6 text-center">Загрузка…</p>}

          <div className="flex flex-col">
            {shown.map(u => {
              const isAdded = added.has(u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => !isAdded && add(u)}
                  disabled={adding === u.id || isAdded}
                  className="flex items-center gap-3 py-2 rounded-2xl hover:bg-bg transition-colors text-left disabled:opacity-60"
                >
                  <Avatar name={u.name} id={u.id} imageUrl={u.image_url} size={48} />
                  <span className="flex-1 min-w-0 text-lg font-bold text-primary ellipsis">{u.name}</span>
                  <span className="tap-sm text-accent flex-shrink-0">
                    {isAdded ? <IconCheck size={22} stroke={2.4} /> : <IconPlus size={22} stroke={2.2} />}
                  </span>
                </button>
              )
            })}
            {people !== null && shown.length === 0 && (
              <p className="text-md text-muted py-6 text-center">
                {query ? 'Никого с таким именем нет' : 'Все уже в альбоме'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
