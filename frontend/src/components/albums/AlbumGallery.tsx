import React, { useEffect, useRef, useState } from 'react'
import {
  IconArrowLeft, IconUpload, IconUserPlus, IconX, IconPlayerPlayFilled, IconDownload, IconUsers,
} from '@tabler/icons-react'
import { api } from '../../api'
import Avatar from '../ui/Avatar'
import AddMemberModal from './AddMemberModal'
import type { AlbumDetail, AlbumMaterial } from '../../types'

function isVideo(link: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(link)
}

function dayKey(dt: string) {
  return new Date(dt).toDateString()
}

function fmtDay(dt: string) {
  return new Date(dt).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
}

function groupByDay(materials: AlbumMaterial[]) {
  const groups: { date: string; items: AlbumMaterial[] }[] = []
  for (const m of materials) {
    const last = groups[groups.length - 1]
    if (last && dayKey(last.items[0].published_at) === dayKey(m.published_at)) {
      last.items.push(m)
    } else {
      groups.push({ date: m.published_at, items: [m] })
    }
  }
  return groups
}

async function downloadMaterial(m: AlbumMaterial) {
  const filename = m.link.split('/').pop() || 'file'
  try {
    const res = await fetch(m.link)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    window.open(m.link, '_blank')
  }
}

interface Props {
  albumId: string
  onBack: () => void
  onChanged: () => void
}

export default function AlbumGallery({ albumId, onBack, onChanged }: Props) {
  const [album, setAlbum] = useState<AlbumDetail | null>(null)
  const [materials, setMaterials] = useState<AlbumMaterial[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [active, setActive] = useState<AlbumMaterial | null>(null)
  const [showAddMember, setShowAddMember] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function load() {
    api.getAlbum(albumId).then(setAlbum).catch(() => {})
    api.getAlbumMaterials(albumId).then(setMaterials).catch(() => setMaterials([]))
  }

  useEffect(() => { setAlbum(null); setMaterials(null); load() }, [albumId])

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    try {
      await api.uploadAlbumMaterials(albumId, Array.from(files))
      load()
      onChanged()
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function addMember(userId: string) {
    await api.addAlbumMember(albumId, userId)
    const updated = await api.getAlbum(albumId)
    setAlbum(updated)
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onBack} className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface flex-shrink-0">
              <IconArrowLeft size={18} stroke={1.5} />
            </button>
            <h1 className="text-xl font-semibold text-primary truncate">{album?.name || 'Альбом'}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowAddMember(true)}
              className="flex items-center gap-1.5 border border-border bg-surface rounded-xl px-3 py-2 text-sm font-medium text-primary hover:border-accent transition-colors"
            >
              <IconUserPlus size={16} stroke={1.5} />
              <span className="hidden sm:inline">Добавить</span>
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 bg-accent text-white rounded-xl px-3.5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <IconUpload size={16} stroke={1.5} />
              <span className="hidden sm:inline">{uploading ? 'Загрузка…' : 'Загрузить'}</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={e => onFiles(e.target.files)}
            />
          </div>
        </div>

        {album?.members && album.members.length > 0 && (
          <div className="flex items-center gap-1.5 mb-5">
            <IconUsers size={14} stroke={1.5} className="text-muted" />
            <div className="flex -space-x-2">
              {album.members.map(m => (
                <Avatar key={m.id} name={m.name} id={m.id} imageUrl={m.image_url} size={24} className="ring-2 ring-surface" />
              ))}
            </div>
            <span className="text-xs text-muted ml-1">{album.members.length} участник{album.members.length === 1 ? '' : album.members.length < 5 ? 'а' : 'ов'}</span>
          </div>
        )}

        {materials === null && (
          <div className="text-center text-sm text-muted py-16">Загрузка…</div>
        )}

        {materials !== null && materials.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-accent-light flex items-center justify-center mx-auto mb-4">
              <IconUpload size={28} stroke={1.5} className="text-accent" />
            </div>
            <p className="text-primary font-medium mb-1">Здесь пока пусто</p>
            <p className="text-sm text-muted">Загрузите первые фото и видео</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {groupByDay(materials || []).map(group => (
            <div key={group.date}>
              <div className="text-sm font-medium text-muted mb-2 capitalize">{fmtDay(group.date)}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.items.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActive(m)}
                    className="relative aspect-square rounded-xl overflow-hidden bg-surface border border-border group"
                  >
                    {isVideo(m.link) ? (
                      <>
                        <video src={m.link} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                          <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                            <IconPlayerPlayFilled size={16} className="text-primary ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img src={m.link} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setActive(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={() => downloadMaterial(active)}
              title="Скачать"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
            >
              <IconDownload size={20} stroke={1.5} />
            </button>
            <button
              onClick={() => setActive(null)}
              title="Закрыть"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
            >
              <IconX size={20} stroke={1.5} />
            </button>
          </div>
          {isVideo(active.link) ? (
            <video src={active.link} className="max-w-full max-h-full rounded-lg" controls autoPlay />
          ) : (
            <img src={active.link} className="max-w-full max-h-full rounded-lg object-contain" />
          )}
        </div>
      )}

      {showAddMember && album && (
        <AddMemberModal
          members={album.members}
          onClose={() => setShowAddMember(false)}
          onAdd={addMember}
        />
      )}
    </div>
  )
}
