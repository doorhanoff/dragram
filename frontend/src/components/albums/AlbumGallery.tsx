import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconArrowLeft, IconUpload, IconUserPlus, IconX, IconPlayerPlayFilled, IconDownload, IconUsers,
  IconChecks, IconTrash,
} from '@tabler/icons-react'
import { api, mediaSrc } from '../../api'
import Avatar from '../ui/Avatar'
import CachedImg from '../ui/CachedImg'
import ImageLightbox from '../ui/ImageLightbox'
import VideoLightbox from '../ui/VideoLightbox'
import AddMemberModal from './AddMemberModal'
import { downloadUrl, showToast, parseDate } from '../../utils'
import { ask } from '../ui/dialogs'
import { withCache } from '../../dataCache'
import type { AlbumDetail, AlbumMaterial } from '../../types'

function isVideo(link: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(link)
}

function dayKey(dt: string) {
  return parseDate(dt)?.toDateString() ?? ''
}

function fmtDay(dt: string) {
  return parseDate(dt)?.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) ?? ''
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const [selectMode, setSelectMode] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>()
  const longPressFired = useRef(false)
  const touchStartPos = useRef({ x: 0, y: 0 })

  function load() {
    // Сначала показываем сохранённое, затем обновляем с сервера: альбом
    // открывается сразу и листается без сети.
    withCache<AlbumDetail>(`album:${albumId}`, () => api.getAlbum(albumId), setAlbum)
    withCache<AlbumMaterial[]>(`albumMaterials:${albumId}`, () => api.getAlbumMaterials(albumId), setMaterials)
      // Ни кеша, ни сети — показываем пустой альбом, а не вечную загрузку.
      .finally(() => setMaterials(prev => prev ?? []))
  }

  useEffect(() => { setAlbum(null); setMaterials(null); setSelectMode(false); setSelected(new Set()); load() }, [albumId])

  // Кнопку «назад» перехватывает сам лайтбокс, пока открыт.
  const closeActive = useCallback(() => setActive(null), [])

  // Листать пальцем можно только фотографии: видео открывается своим плеером.
  const photos = (materials || []).filter(m => !isVideo(m.link))

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Долгое нажатие на фото включает режим выбора и сразу выделяет его —
  // как в стандартной галерее телефона, без отдельной кнопки "Выбрать"
  function onTileTouchStart(e: React.TouchEvent, id: string) {
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    longPressFired.current = false
    clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setSelectMode(true)
      toggleSelect(id)
    }, 450)
  }
  function onTileTouchMove(e: React.TouchEvent) {
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y)
    if (dx > 10 || dy > 10) clearTimeout(longPressTimer.current)
  }
  function onTileTouchEnd() {
    clearTimeout(longPressTimer.current)
  }
  function onTileClick(m: AlbumMaterial) {
    if (longPressFired.current) { longPressFired.current = false; return }
    selectMode ? toggleSelect(m.id) : setActive(m)
  }

  async function downloadSelected() {
    if (!materials || selected.size === 0) return
    setDownloading(true)
    try {
      for (const m of materials) {
        if (!selected.has(m.id)) continue
        await downloadUrl(mediaSrc(m.link), m.link.split('/').pop())
        await sleep(300) // браузеры блокируют слишком частые одновременные скачивания
      }
    } finally {
      setDownloading(false)
      setSelectMode(false)
      setSelected(new Set())
    }
  }

  async function deleteSelected() {
    if (!materials || selected.size === 0) return
    const count = selected.size
    const ok = await ask({
      title: count === 1 ? 'Удалить файл из альбома?' : `Удалить ${count} файла(ов) из альбома?`,
      text: 'Их увидят все участники альбома, и вернуть удалённое будет нельзя.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Оставить',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    const failed: string[] = []
    try {
      for (const m of materials) {
        if (!selected.has(m.id)) continue
        // Сервер разрешает удалять свои файлы и всё — создателю альбома;
        // чужие в общем альбоме вернут 403, и это не повод обрывать остальные.
        try { await api.deleteAlbumMaterial(albumId, m.id) } catch { failed.push(m.id) }
      }
      if (failed.length) showToast(`Не удалось удалить: ${failed.length} — это чужие файлы`)
      load()
      onChanged()
    } finally {
      setDeleting(false)
      setSelectMode(false)
      setSelected(new Set())
    }
  }

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
        <div className="flex items-center mb-3 gap-2">
          <button onClick={onBack} aria-label="Назад" className="md:hidden tap rounded-2xl text-accent flex-shrink-0">
            <IconArrowLeft size={26} stroke={2.2} />
          </button>
          <h1 className="text-3xl font-bold text-primary tracking-tight truncate flex-1 min-w-0">{album?.name || 'Альбом'}</h1>
        </div>

        {selectMode ? (
          // Подпись и кнопки — разными строками. В одну строку они не
          // помещались: на узком экране «Выбрано: N» налезало на «Скачать».
          <div className="flex flex-col gap-2.5 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-md font-bold text-muted flex-1 min-w-0 truncate">
                {selected.size ? `Выбрано: ${selected.size}` : 'Отметьте файлы'}
              </span>
              <button
                onClick={() => { setSelectMode(false); setSelected(new Set()) }}
                aria-label="Выйти из режима выбора"
                className="tap rounded-2xl text-muted flex-shrink-0"
              >
                <IconX size={24} stroke={2} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadSelected}
                disabled={selected.size === 0 || downloading}
                className="btn btn-primary flex-1 min-w-0"
              >
                <IconDownload size={20} stroke={1.8} />
                {downloading ? 'Сохраняем…' : 'Сохранить'}
              </button>
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0 || deleting}
                className="btn btn-secondary flex-1 min-w-0"
                style={{ color: 'var(--danger)' }}
              >
                <IconTrash size={20} stroke={1.8} />
                {deleting ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="btn btn-primary"
            >
              <IconUpload size={20} stroke={1.8} />
              {uploading ? 'Загружаем…' : 'Загрузить'}
            </button>
            <button onClick={() => setShowAddMember(true)} className="btn btn-secondary">
              <IconUserPlus size={20} stroke={1.8} />
              <span className="hidden sm:inline">Добавить людей</span>
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
        )}

        {album?.members && album.members.length > 0 && (
          <div className="flex items-center gap-1.5 mb-5">
            <IconUsers size={14} stroke={1.5} className="text-muted" />
            <div className="flex -space-x-2">
              {album.members.map(m => (
                <Avatar key={m.id} name={m.name} id={m.id} imageUrl={m.image_url} size={24} className="ring-2 ring-surface" />
              ))}
            </div>
            <span className="text-sm text-muted ml-1">{album.members.length} участник{album.members.length === 1 ? '' : album.members.length < 5 ? 'а' : 'ов'}</span>
          </div>
        )}

        {materials === null && (
          <div className="text-center text-md text-muted py-16">Загрузка…</div>
        )}

        {materials !== null && materials.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-surface2 flex items-center justify-center mx-auto mb-4">
              <IconUpload size={28} stroke={1.5} className="text-accent" />
            </div>
            <p className="text-xl font-bold text-primary mb-1">Здесь пока пусто</p>
            <p className="text-md font-semibold text-muted">Загрузите первые фото и видео</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {groupByDay(materials || []).map(group => (
            <div key={group.date}>
              <div className="text-md font-extrabold text-muted mb-2.5 capitalize">{fmtDay(group.date)}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {group.items.map(m => {
                  const isSelected = selected.has(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => onTileClick(m)}
                      onTouchStart={e => onTileTouchStart(e, m.id)}
                      onTouchMove={onTileTouchMove}
                      onTouchEnd={onTileTouchEnd}
                      onTouchCancel={onTileTouchEnd}
                      onContextMenu={e => e.preventDefault()}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-surface shadow-soft group no-callout"
                    >
                      {isVideo(m.link) ? (
                        <>
                          <video src={mediaSrc(m.link)} className="w-full h-full object-cover" preload="metadata" muted />
                          {!selectMode && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                              <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                                <IconPlayerPlayFilled size={16} className="text-primary ml-0.5" />
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <CachedImg url={m.link} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                      )}
                      {selectMode && (
                        <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-accent/30' : 'bg-black/10'}`}>
                          <div
                            className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                              isSelected ? 'bg-accent border-accent text-onAccent' : 'bg-black/30 border-white/80 text-transparent'
                            }`}
                          >
                            <IconChecks size={14} stroke={3} />
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Просмотр — общий лайтбокс: фотография во весь экран, крестик в углу
          и листание пальцем по всему альбому, а не по одному снимку. */}
      {active && !isVideo(active.link) && (
        <ImageLightbox
          images={photos.map(m => mediaSrc(m.link))}
          startIndex={Math.max(0, photos.findIndex(m => m.id === active.id))}
          onClose={closeActive}
        />
      )}
      {active && isVideo(active.link) && (
        <VideoLightbox src={mediaSrc(active.link)} onClose={closeActive} />
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
