import React, { useEffect, useState } from 'react'
import { IconPlus, IconAlbum, IconX } from '@tabler/icons-react'
import { api } from '../../api'
import type { Album } from '../../types'

const SEASONS = ['Зима', 'Зима', 'Весна', 'Весна', 'Весна', 'Лето', 'Лето', 'Лето', 'Осень', 'Осень', 'Осень', 'Зима']

function seasonAndYear(dt: string) {
  const d = new Date(dt)
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
    <div className="w-full md:w-[280px] flex-shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h2 className="text-xl font-medium text-primary">Альбомы</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-accent text-white rounded-xl px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <IconPlus size={16} stroke={2} />
          <span className="hidden sm:inline">Новый</span>
        </button>
      </div>

      {albums.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mx-auto mb-3">
            <IconAlbum size={26} stroke={1.5} className="text-accent" />
          </div>
          <p className="text-primary font-medium mb-1">Пока нет альбомов</p>
          <p className="text-sm text-muted">Создайте первый альбом и добавьте близких</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 grid grid-cols-2 sm:grid-cols-2 gap-2 content-start">
        {albums.map(a => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className={[
              'group bg-bg border rounded-2xl p-2.5 flex flex-col gap-2 text-left transition-colors',
              activeAlbumId === a.id ? 'border-accent' : 'border-border hover:border-accent/50',
            ].join(' ')}
          >
            <div className="aspect-square rounded-xl bg-accent-light overflow-hidden flex items-center justify-center">
              {a.cover ? (
                <img src={a.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
              ) : (
                <IconAlbum size={28} stroke={1.5} className="text-accent" />
              )}
            </div>
            <div>
              <div className="font-medium text-primary truncate text-sm">{a.name}</div>
              <div className="text-xs text-muted mt-0.5">{seasonAndYear(a.created_at)}</div>
            </div>
          </button>
        ))}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-surface rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="font-medium text-primary">Новый альбом</span>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-bg">
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
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-bg text-sm outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-accent text-white rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
