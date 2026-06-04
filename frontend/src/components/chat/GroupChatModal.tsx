import React, { useState, useEffect, useRef } from 'react'
import { IconX, IconSearch, IconPlus, IconCamera } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import { api } from '../../api'

interface Props {
  currentUserId: string
  onClose: () => void
  onCreate: (data: { name: string; members: string[]; photo: File | null }) => void
}

export default function GroupChatModal({ currentUserId, onClose, onCreate }: Props) {
  const [name,     setName]     = useState('')
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<any[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string }[]>([])
  const [searching,setSearching]= useState(false)
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState<string | null>(null)
  const [photo,    setPhoto]    = useState<File | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(query.trim())
        setResults((res || []).filter((u: any) => u.id !== currentUserId && !selected.find(s => s.id === u.id)))
      } catch {}
      finally { setSearching(false) }
    }, 300)
  }, [query, currentUserId, selected])

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(f)
    setPreview(URL.createObjectURL(f))
    e.target.value = ''
  }

  function add(u: any) {
    setSelected(p => [...p, { id: u.id, name: u.name }])
    setQuery(''); setResults([])
    inputRef.current?.focus()
  }

  function remove(id: string) { setSelected(p => p.filter(m => m.id !== id)) }

  async function submit() {
    if (!name.trim()) { setError('Введите название'); return }
    if (selected.length < 1) { setError('Добавьте хотя бы одного участника'); return }
    setError(''); setCreating(true)
    try { await onCreate({ name: name.trim(), members: selected.map(m => m.id), photo }) }
    catch (err: any) { setError(err.message); setCreating(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-primary">Новая группа</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-bg"><IconX size={16} stroke={1.5} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Avatar + name row */}
          <div className="flex items-center gap-3">
            <button onClick={() => fileRef.current?.click()}
              className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center relative overflow-hidden bg-accent-light border-2 border-dashed border-accent/30 hover:border-accent transition-colors">
              {preview
                ? <img src={preview} className="w-full h-full object-cover" alt="" />
                : <IconCamera size={20} stroke={1.5} className="text-accent" />
              }
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Название группы"
              className="flex-1 bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted"
            />
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(m => (
                <div key={m.id} className="flex items-center gap-1.5 bg-accent-light text-accent-text text-sm px-2.5 py-1 rounded-full">
                  <span>{m.name}</span>
                  <button onClick={() => remove(m.id)} className="text-muted hover:text-red-400 transition-colors leading-none">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2 border border-transparent focus-within:border-accent transition-colors">
            <IconSearch size={14} stroke={1.5} className="text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Найти участника…"
              className="flex-1 bg-transparent outline-none text-md text-primary placeholder:text-muted"
            />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
            {searching && <p className="text-sm text-muted py-2 text-center">Поиск…</p>}
            {!searching && query && results.length === 0 && <p className="text-sm text-muted py-2 text-center">Никого не найдено</p>}
            {results.map(u => (
              <button key={u.id} onClick={() => add(u)}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-bg transition-colors text-left">
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

        {/* Footer */}
        {error && <p className="text-xs text-red-500 text-center px-5">{error}</p>}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted hover:bg-bg transition-colors">Отмена</button>
          <button onClick={submit} disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-text transition-colors disabled:opacity-50">
            {creating ? 'Создаём…' : `Создать${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
