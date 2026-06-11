import React, { useEffect, useRef, useState } from 'react'
import { IconX, IconSearch, IconPlus } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'
import type { Member } from '../../types'

interface Props {
  members: Member[]
  onClose: () => void
  onAdd: (userId: string) => Promise<void>
}

export default function AddMemberModal({ members, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(query.trim())
        setResults((res || []).filter((u: any) => !members.find(m => m.id === u.id)))
      } catch {}
      finally { setSearching(false) }
    }, 300)
  }, [query, members])

  async function add(u: any) {
    setAdding(u.id)
    try {
      await onAdd(u.id)
      setResults(prev => prev.filter(r => r.id !== u.id))
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-primary">Добавить участника</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-bg"><IconX size={16} stroke={1.5} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2 border border-transparent focus-within:border-accent transition-colors">
            <IconSearch size={14} stroke={1.5} className="text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Найти пользователя по имени или телефону…"
              className="flex-1 bg-transparent outline-none text-md text-primary placeholder:text-muted"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            {searching && <p className="text-sm text-muted py-2 text-center">Поиск…</p>}
            {!searching && query && results.length === 0 && <p className="text-sm text-muted py-2 text-center">Никого не найдено</p>}
            {results.map(u => (
              <button key={u.id} onClick={() => add(u)} disabled={adding === u.id}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-bg transition-colors text-left disabled:opacity-50">
                <Avatar name={u.name} id={u.id} imageUrl={u.image_url} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-md font-medium text-primary">{u.name}</div>
                  <div className="text-sm text-muted">{u.phone_number}</div>
                </div>
                <IconPlus size={14} stroke={2} className="text-accent flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
