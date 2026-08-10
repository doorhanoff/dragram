import React, { useEffect, useMemo, useState } from 'react'
import { IconUsersGroup, IconX } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
import type { User } from '../../types'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * «Кому написать» — шторка снизу со списком всех родных.
 *
 * Раньше единственной кнопкой на экране чатов была иконка с людьми без
 * подписи, и она создавала ГРУППУ. Чтобы написать одному человеку, надо было
 * догадаться воспользоваться поиском и набрать не меньше трёх букв — самый
 * частый сценарий в приложении был спрятан лучше всех.
 */
interface Props {
  myId: string
  onClose: () => void
  onPick: (userId: string) => void
  onNewGroup: () => void
}

export default function NewChatSheet({ myId, onClose, onPick, onNewGroup }: Props) {
  const [people, setPeople] = useState<User[] | null>(null)
  const [query, setQuery] = useState('')

  useBackHandler(onClose)

  useEffect(() => {
    api.getDirectory()
      .then((list: User[]) => setPeople((list || []).filter(u => String(u.id) !== String(myId))))
      .catch(() => setPeople([]))
  }, [myId])

  // Фильтрация прямо на устройстве: список целиком уже здесь, ходить за
  // этим на сервер незачем.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people || []
    return (people || []).filter(u => u.name.toLowerCase().includes(q))
  }, [people, query])

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-xl font-bold text-primary flex-1">Кому написать</span>
          <button onClick={onClose} className="tap-sm rounded-xl text-muted" aria-label="Закрыть">
            <IconX size={22} stroke={2} />
          </button>
        </div>

        <div className="overflow-y-auto pb-safe">
          <button
            onClick={onNewGroup}
            className="flex items-center gap-3.5 w-full px-4 py-3 text-left hover:bg-bg transition-colors"
          >
            <span className="w-[52px] h-[52px] rounded-full bg-accent text-onAccent flex items-center justify-center flex-shrink-0">
              <IconUsersGroup size={24} stroke={1.8} />
            </span>
            <span className="text-lg font-bold text-primary">Новая группа</span>
          </button>

          <div className="h-px bg-border mx-4" />

          {people === null && <p className="text-md text-muted px-4 py-6 text-center">Загрузка…</p>}

          {people !== null && (
            <>
              {people.length > 8 && (
                <div className="px-4 pt-3 pb-1">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Найти по имени"
                    className="field"
                  />
                </div>
              )}
              {shown.map(u => (
                <button
                  key={u.id}
                  onClick={() => onPick(u.id)}
                  className="flex items-center gap-3.5 w-full px-4 py-2.5 text-left hover:bg-bg transition-colors"
                >
                  <Avatar name={u.name} id={u.id} imageUrl={u.image_url} isActive={u.is_active} size={52} />
                  <span className="text-lg font-bold text-primary ellipsis">{u.name}</span>
                </button>
              ))}
              {shown.length === 0 && (
                <p className="text-md text-muted px-4 py-6 text-center">
                  {query ? 'Никого с таким именем нет' : 'Кроме вас здесь пока никого нет'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
