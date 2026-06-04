import React, { useState, useRef } from 'react'
import { IconX, IconPhoto } from '@tabler/icons-react'
import { api } from '../../api'

interface Props {
  onClose: () => void
  onCreate: () => void
}

export default function CreatePostModal({ onClose, onCreate }: Props) {
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
    if (!title.trim()) { setError('Введите заголовок'); return }
    setError(''); setLoading(true)
    try {
      const post = await api.createPost({ title: title.trim(), description: desc.trim() || null })
      if (files.length > 0) {
        await api.uploadPostMedia(post.id, files, (pct: number) => setProgress(pct))
      }
      previews.forEach(p => URL.revokeObjectURL(p.url))
      onCreate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false); setProgress(0)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-primary">Новая публикация</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-bg transition-colors">
            <IconX size={16} stroke={1.5} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">Заголовок *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="О чём публикация?"
              className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">Описание</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Подробнее…"
              rows={3}
              className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none resize-none border border-transparent focus:border-accent transition-colors placeholder:text-muted"
            />
          </div>

          {/* Previews */}
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  {p.type.startsWith('video/')
                    ? <video src={p.url} className="w-full h-full object-cover" preload="metadata" muted />
                    : <img src={p.url} alt="" className="w-full h-full object-cover" />
                  }
                  <button onClick={() => remove(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs leading-none">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-sm text-muted border border-dashed border-border rounded-lg px-4 py-3 hover:border-accent hover:text-accent transition-colors"
          >
            <IconPhoto size={16} stroke={1.5} />
            {previews.length > 0 ? `Добавить ещё (${previews.length} выбрано)` : 'Прикрепить фото / видео'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={pick} />

          {loading && progress > 0 && (
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all rounded-full" style={{ width: `${progress}%` }} />
            </div>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg text-sm text-muted hover:bg-bg transition-colors">Отмена</button>
          <button onClick={submit} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-text transition-colors disabled:opacity-50">
            {loading ? 'Публикация…' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  )
}
