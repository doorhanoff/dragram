import React, { useEffect, useState } from 'react'
import { IconPlus, IconAlbum, IconX } from '@tabler/icons-react'
import { api } from '../../api'
import type { Album } from '../../types'
import { parseDate } from '../../utils'

const SEASONS = ['Зима', 'Зима', 'Весна', 'Весна', 'Весна', 'Лето', 'Лето', 'Лето', 'Осень', 'Осень', 'Осень', 'Зима']

function seasonAndYear(dt: string) {
  const d = parseDate(dt)
  if (!d) return ''
  const season = SEASONS[d.getMonth()]
  return `${season} ${d.getFullYear()}`
}

interface Props {
  albums: Album[]
  activeAlbumId: string | null
  onSelect: (id: string) => void
  onCreated: () => void
}

export default function AlbumsList({ albums, activeAlbumId, onSelect, onCreated }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (!showCreate) setName('') }, [showCreate])

  async function createAlbum(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await api.createAlbum(name.trim())
      setShowCreate(false)
      onCreated()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="w-full md:w-[300px] flex-1 md:flex-shrink-0 bg-surface border-r border-border flex flex-col min-h-0">
      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <h2 className="text-3xl font-black text-primary tracking-tight">Альбомы</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-2xl px-4 py-2 text-md font-extrabold shadow-pop transition-opacity hover:opacity-90"
        >
          <IconPlus size={17} stroke={2.4} />
          <span className="hidden sm:inline">Новый</span>
        </button>
      </div>

      {albums.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="w-14 h-14 rounded-2xl bg-surface2 flex items-center justify-center mx-auto mb-3">
            <IconAlbum size={26} stroke={1.5} className="text-accent" />
          </div>
          <p className="text-primary font-extrabold mb-1">Пока нет альбомов</p>
          <p className="text-md font-semibold text-muted">Создайте первый альбом и добавьте близких</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 grid grid-cols-2 sm:grid-cols-2 gap-3.5 content-start">
        {albums.map(a => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="group rounded-[22px] overflow-hidden text-left shadow-soft transition-shadow"
            style={activeAlbumId === a.id ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : undefined}
          >
            <div className="aspect-square bg-surface2 overflow-hidden flex items-center justify-center">
              {a.cover ? (
                <img src={a.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
              ) : (
                <IconAlbum size={28} stroke={1.5} className="text-accent" />
              )}
            </div>
            <div className="bg-surface px-3.5 py-2.5">
              <div className="font-extrabold text-primary truncate text-md">{a.name}</div>
              <div className="text-sm font-semibold text-muted mt-0.5">{seasonAndYear(a.created_at)}</div>
            </div>
          </button>
        ))}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-surface rounded-card w-full max-w-sm shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <span className="font-extrabold text-lg text-primary">Новый альбом</span>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:bg-bg">
                <IconX size={18} stroke={1.5} />
              </button>
            </div>
            <form onSubmit={createAlbum} className="p-5 flex flex-col gap-3">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                required
                maxLength={50}
                placeholder="Например, «Лето 2026»"
                className="w-full px-4 py-3 rounded-2xl border border-border bg-bg text-md font-semibold outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-2xl py-3 text-md font-extrabold shadow-pop transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating ? 'Создание…' : 'Создать'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
