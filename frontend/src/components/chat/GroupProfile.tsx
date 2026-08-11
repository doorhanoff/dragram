import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { IconX, IconUserPlus, IconCheck, IconArrowLeft } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
import { sayError } from '../ui/dialogs'
import { fmtPresence } from '../../utils'
import { useBackHandler } from '../../hooks/useBackHandler'
import type { Chat, User } from '../../types'

/**
 * Профиль группы: название, фото и кто в ней состоит.
 *
 * Раньше состав группы нигде не показывался — в шапке была только строка
 * «5 участников», и узнать, кто эти пятеро, было неоткуда.
 */
interface Props {
  chat: Chat
  myId: string
  onClose: () => void
  /** Добавляет людей и раздаёт им ключ группы (ключа у сервера нет). */
  onAddMembers: (userIds: string[]) => Promise<void>
}

export default function GroupProfile({ chat, myId, onClose, onAddMembers }: Props) {
  const [adding, setAdding] = useState(false)
  const [people, setPeople] = useState<User[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  // «Назад» закрывает сначала выбор людей, потом сам профиль. Ссылка на
  // обработчик должна быть стабильной: стек «назад» общий на все оверлеи, и
  // новая функция на каждый рендер переставляла бы нас в его конец.
  const handleBack = useCallback(() => {
    setAdding(prev => {
      if (prev) return false
      onClose()
      return prev
    })
  }, [onClose])
  useBackHandler(handleBack)

  const members = chat.members || []
  const memberIds = useMemo(() => new Set(members.map(m => String(m.id))), [members])

  useEffect(() => {
    if (!adding || people) return
    api.getDirectory()
      .then((list: User[]) => setPeople(list || []))
      .catch(() => setPeople([]))
  }, [adding, people])

  // Тех, кто уже в группе, в списке не показываем: отметить их всё равно
  // нельзя, а искать среди них — только мешать.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (people || [])
      .filter(u => !memberIds.has(String(u.id)))
      .filter(u => !q || u.name.toLowerCase().includes(q))
  }, [people, memberIds, query])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submit() {
    if (!selected.size) return
    setBusy(true)
    try {
      await onAddMembers([...selected])
      setSelected(new Set())
      setAdding(false)
    } catch (e) {
      sayError('Не удалось добавить', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          {adding && (
            <button onClick={() => setAdding(false)} aria-label="Назад" className="tap-sm rounded-xl text-accent">
              <IconArrowLeft size={22} stroke={2.2} />
            </button>
          )}
          <h2 className="text-xl font-bold text-primary flex-1 ellipsis">
            {adding ? 'Кого добавить' : 'О группе'}
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted">
            <IconX size={22} stroke={2} />
          </button>
        </div>

        {adding ? (
          <>
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {(people?.length || 0) > 8 && (
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Найти по имени"
                  className="field mb-2"
                />
              )}
              {people === null && <p className="text-md text-muted py-4 text-center">Загрузка…</p>}
              {people !== null && candidates.length === 0 && (
                <p className="text-md text-muted py-6 text-center">
                  Все ваши родные уже в этой группе
                </p>
              )}
              <div className="flex flex-col">
                {candidates.map(u => {
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
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex-shrink-0 pb-safe">
              <button onClick={submit} disabled={busy || !selected.size} className="btn btn-primary w-full">
                {busy ? 'Добавляем…' : selected.size ? `Добавить (${selected.size})` : 'Добавить'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="overflow-y-auto flex-1">
              <div className="flex flex-col items-center gap-2 px-4 py-5">
                <Avatar name={chat.name || 'Группа'} id={chat.id} imageUrl={chat.image_url} size={96} />
                <div className="text-2xl font-bold text-primary text-center ellipsis w-full">
                  {chat.name || 'Группа'}
                </div>
                <div className="text-md text-muted">{members.length} участников</div>
              </div>

              <div className="px-4 pb-2">
                <button onClick={() => setAdding(true)} className="btn btn-secondary w-full">
                  <IconUserPlus size={20} stroke={1.8} />
                  Добавить людей
                </button>
              </div>

              <div className="px-4 pt-3 pb-safe">
                <div className="text-md text-muted mb-1">Участники</div>
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 py-2">
                    <Avatar name={m.name} id={m.id} imageUrl={m.image_url} isActive={m.is_active} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-bold text-primary ellipsis">
                        {String(m.id) === String(myId) ? 'Вы' : m.name}
                      </div>
                      <div className={`text-sm ellipsis ${m.is_active ? 'text-online' : 'text-muted'}`}>
                        {fmtPresence(!!m.is_active, m.last_seen)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
