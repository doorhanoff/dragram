import React, { useState, useRef } from 'react'
import { IconX, IconPhoto } from '@tabler/icons-react'
import { api } from '../../api'
import { useBackHandler } from '../../hooks/useBackHandler'

interface Props {
  onClose: () => void
  onCreate: () => void
}

export default function CreatePostModal({ onClose, onCreate }: Props) {
  useBackHandler(onClose)
  const [title,    setTitle]    = useState('')
  const [desc,     setDesc]     = useState('')
  const [files,    setFiles]    = useState<File[]>([])
  const [previews, setPreviews] = useState<{ url: string; type: string }[]>([])
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [error,    setError]    = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setFiles(p => [...p, ...picked])
    setPreviews(p => [...p, ...picked.map(f => ({ url: URL.createObjectURL(f), type: f.type }))])
    e.target.value = ''
  }

  function remove(i: number) {
    URL.revokeObjectURL(previews[i].url)
    setFiles(p => p.filter((_, idx) => idx !== i))
    setPreviews(p => p.filter((_, idx) => idx !== i))
  }

  async function submit() {
    if (title.trim().length < 5) { setError('Напишите заголовок — хотя бы несколько слов'); return }
    setError(''); setLoading(true)
    try {
      const post = await api.createPost({ title: title.trim(), description: desc.trim() || null })
      if (files.length > 0) {
        await api.uploadPostMedia(post.id, files, (pct: number) => setProgress(pct))
      }
      previews.forEach(p => URL.revokeObjectURL(p.url))
      onCreate()
    } catch (err) {
      console.warn('Не удалось опубликовать:', err)
      setError('Не получилось опубликовать. Проверьте связь и попробуйте ещё раз.')
    } finally {
      setLoading(false); setProgress(0)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-primary flex-1">Новая запись</h2>
          <button onClick={onClose} aria-label="Закрыть" className="tap-sm rounded-xl text-muted">
            <IconX size={22} stroke={2} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
          <div>
            <label className="text-md text-muted block mb-1.5">О чём расскажете?</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Например, «Съездили на дачу»"
              maxLength={200}
              autoFocus
              className="field"
            />
          </div>

          <div>
            <label className="text-md text-muted block mb-1.5">Подробнее (необязательно)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Что было интересного…"
              rows={4}
              maxLength={1024}
              className="field resize-none py-3"
              style={{ minHeight: 100 }}
            />
          </div>

          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden">
                  {p.type.startsWith('video/')
                    ? <video src={p.url} className="w-full h-full object-cover" preload="metadata" muted />
                    : <img src={p.url} alt="" className="w-full h-full object-cover" />
                  }
                  <button
                    onClick={() => remove(i)}
                    aria-label="Убрать"
                    className="absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1.5"
                  >
                    <span className="w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center">
                      <IconX size={16} stroke={2.4} />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => fileRef.current?.click()} className="btn btn-secondary w-full">
            <IconPhoto size={20} stroke={1.8} />
            {previews.length > 0 ? `Добавить ещё (выбрано ${previews.length})` : 'Прикрепить фото или видео'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={pick} />

          {loading && progress > 0 && (
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all rounded-full" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex-shrink-0 pb-safe">
          {error && <p className="text-md font-bold text-danger text-center mb-2">{error}</p>}
          <button onClick={submit} disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Публикуем…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  )
}
