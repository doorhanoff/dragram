import React, { useEffect, useState } from 'react'
import { IconPlus, IconAlbum, IconX } from '@tabler/icons-react'
import { api } from '../../api'
import CachedImg from '../ui/CachedImg'
import type { Album } from '../../types'
import { parseDate } from '../../utils'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * Подпись под названием альбома.
 *
 * Раньше здесь стояло время года: у альбома «Янтарный 2026» получалось
 * «Янтарный 2026 / Лето 2026» — строка, которая повторяет год и не сообщает
 * ничего нового. Нужно другое: сколько фотографий и когда добавляли последние.
 */
function albumSubtitle(album: Album): string {
  const count = album.materials_count ?? 0
  if (!count) return 'Пока пусто'
  const word = count % 10 === 1 && count % 100 !== 11 ? 'фото' : 'фото'
  const parts = [`${count} ${word}`]
  const last = parseDate(album.last_added_at || '')
  if (last) {
    const now = new Date()
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
    if (last.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
    parts.push(`последнее ${last.toLocaleDateString('ru', opts)}`)
  }
  return parts.join(' · ')
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
    <div className="w-full md:w-[340px] flex-1 md:flex-shrink-0 bg-surface md:border-r border-border flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <h2 className="text-3xl font-bold text-primary tracking-tight">Альбомы</h2>
        {/* Подпись видна на всех телефонах: голая зелёная таблетка с плюсом
            выглядела ровно как «Загрузить» внутри альбома, но делала другое. */}
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <IconPlus size={20} stroke={2.4} />
          <span>Новый альбом</span>
        </button>
      </div>

      {albums.length === 0 && (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 rounded-2xl bg-surface2 flex items-center justify-center mx-auto mb-3">
            <IconAlbum size={28} stroke={1.5} className="text-accent" />
          </div>
          <p className="text-xl font-bold text-primary mb-1">Пока нет альбомов</p>
          <p className="text-md text-muted">Создайте первый и пригласите в него близких</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 grid grid-cols-2 gap-3.5 content-start">
        {albums.map(a => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="group rounded-card overflow-hidden text-left shadow-soft transition-shadow"
            style={activeAlbumId === a.id ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : undefined}
          >
            <div className="aspect-square bg-surface2 overflow-hidden flex items-center justify-center">
              {/* CachedImg, а не <img src={a.cover}>: адрес из базы ведёт
                  напрямую в хранилище, а оно закрыто и без подписи-тикета
                  ничего не отдаёт — вместо обложки был значок «битое
                  изображение». Везде остальное грузится именно так. */}
              {a.cover ? (
                <CachedImg url={a.cover} alt="" loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <IconAlbum size={32} stroke={1.5} className="text-accent" />
              )}
            </div>
            <div className="bg-surface px-3.5 py-2.5">
              <div className="font-bold text-primary truncate text-md">{a.name}</div>
              <div className="text-sm text-muted mt-0.5 truncate">{albumSubtitle(a)}</div>
            </div>
          </button>
        ))}
      </div>

      {showCreate && <CreateAlbumSheet
        name={name}
        creating={creating}
        onName={setName}
        onSubmit={createAlbum}
        onClose={() => setShowCreate(false)}
      />}
    </div>
  )
}

function CreateAlbumSheet({ name, creating, onName, onSubmit, onClose }: {
  name: string
  creating: boolean
  onName: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  useBackHandler(onClose)
  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-xl font-bold text-primary flex-1">Новый альбом</span>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted">
            <IconX size={22} stroke={2} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-4 flex flex-col gap-3 pb-safe">
          <input
            value={name}
            onChange={e => onName(e.target.value)}
            autoFocus
            required
            maxLength={50}
            placeholder="Например, «Лето 2026»"
            className="field"
          />
          <button type="submit" disabled={creating} className="btn btn-primary w-full">
            {creating ? 'Создаём…' : 'Создать альбом'}
          </button>
        </form>
      </div>
    </div>
  )
}
