import React, { useState, useEffect, useRef } from 'react'
import { IconArrowLeft, IconSend, IconCornerDownRight, IconTrash, IconX, IconMessageCircle } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import ImageLightbox from '../ui/ImageLightbox'
import CachedImg from '../ui/CachedImg'
import type { Post, Comment } from '../../types'
import { api, mediaSrc } from '../../api'
// Время без даты врало: комментарий недельной давности выглядел написанным
// сегодня. fmtDateTime добавляет «вчера» и число, когда это не сегодня.
import { fmtDateTime } from '../../utils'
import { ask, sayError } from '../ui/dialogs'
import { withCache } from '../../dataCache'

interface Props {
  postId: string | null
  userId: string
  onBack: () => void
}

export default function PostThread({ postId, userId, onBack }: Props) {
  const [post,          setPost]     = useState<Post | null>(null)
  const [comments,      setComments] = useState<Comment[]>([])
  const [text,          setText]     = useState('')
  const [loading,       setLoading]  = useState(true)
  const [sending,       setSending]  = useState(false)
  const [lightbox,      setLightbox] = useState<number | null>(null)
  const [deleting,      setDeleting] = useState(false)
  const [replyTo,       setReplyTo]  = useState<Comment | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!postId) return
    setLoading(true)
    Promise.all([
      withCache<Post>(`post:${postId}`, () => api.getPost(postId), setPost),
      withCache<Comment[]>(`comments:${postId}`, async () => (await api.getComments(postId)) || [], setComments),
    ]).finally(() => setLoading(false))
  }, [postId])

  async function removePost() {
    // Запись уносит с собой комментарии и загруженные файлы, поэтому
    // переспрашиваем: вернуть их будет неоткуда.
    if (!post) return
    const ok = await ask({
      title: 'Удалить запись?',
      text: 'Вместе с ней исчезнут комментарии и загруженные фотографии. Вернуть их будет нельзя.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Оставить',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await api.deletePost(post.id)
      onBack()
    } catch (e) {
      sayError('Не удалось удалить запись', e)
    } finally {
      setDeleting(false)
    }
  }

  async function send() {
    if (!text.trim() || !postId || sending) return
    setSending(true)
    const currentReplyTo = replyTo
    try {
      const c = await api.addComment(postId, {
        text: text.trim(),
        reply_to_id: currentReplyTo?.id || null,
      })
      // Сразу показываем ответ с цитатой — без ожидания следующего рефреша
      const enriched = currentReplyTo ? { ...c, reply_to: currentReplyTo } : c
      setComments(prev => [...prev, enriched])
      setText('')
      setReplyTo(null)
    } catch {}
    finally { setSending(false) }
  }

  async function del(id: string) {
    try { await api.deleteComment(id); setComments(p => p.filter(c => c.id !== id)) } catch {}
  }

  if (!postId) return (
    <div className="flex-1 flex items-center justify-center bg-bg">
      <p className="text-sm text-muted">Выберите публикацию</p>
    </div>
  )

  if (loading) return <div className="flex-1 flex items-center justify-center bg-bg"><p className="text-sm text-muted">Загрузка…</p></div>
  if (!post)   return <div className="flex-1 flex items-center justify-center bg-bg"><p className="text-sm text-muted">Пост не найден</p></div>

  const media = post.materials || []

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg overflow-hidden">
      {/* Header */}
      <div className="bg-bg flex items-center gap-1 px-2 py-2 flex-shrink-0">
        <button onClick={onBack} aria-label="Назад" className="tap rounded-2xl text-accent">
          <IconArrowLeft size={26} stroke={2.2} />
        </button>
        <span className="text-xl font-bold text-primary ellipsis flex-1 px-1">{post.title}</span>
        {post.created_by_id === userId && (
          <button
            onClick={removePost}
            disabled={deleting}
            aria-label="Удалить запись"
            className="tap rounded-2xl text-muted hover:text-danger transition-colors disabled:opacity-40"
          >
            <IconTrash size={22} stroke={1.9} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
          {/* Post card */}
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            {/* Author */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Avatar name={post.created_by?.name} id={post.created_by_id} imageUrl={post.created_by?.image_url} size={40} />
              <div>
                <div className="text-lg font-bold text-primary">{post.created_by?.name || 'Аноним'}</div>
                <div className="text-sm text-muted">{fmtDateTime(post.created_at)}</div>
              </div>
            </div>

            {/* Description */}
            {post.description && (
              <p className="text-md text-primary leading-relaxed px-4 pb-3">{post.description}</p>
            )}

            {/* Media — все файлы, фото открываются в лайтбоксе */}
            {media.length > 0 && (
              <div className={`grid gap-1 ${media.length === 1 ? 'grid-cols-1' : media.length === 3 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {media.map((url, i) => {
                  const isVid = url.match(/\.(mp4|webm|mov)$/i)
                  const isFirst3 = media.length === 3 && i === 0
                  return isVid
                    ? <video key={i} src={mediaSrc(url)} controls className={`w-full object-cover ${isFirst3 ? 'col-span-2' : ''}`} style={{ aspectRatio: '16/9' }} />
                    : <button
                        key={i}
                        onClick={() => setLightbox(i)}
                        className={`w-full overflow-hidden ${isFirst3 ? 'col-span-2' : ''} focus:outline-none`}
                        style={{ aspectRatio: '16/9' }}
                      >
                        <CachedImg url={url} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                      </button>
                })}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <IconMessageCircle size={18} stroke={1.8} className="text-muted" />
              <span className="text-md font-bold text-primary">
                {comments.length === 0 ? 'Комментариев пока нет' : `Комментариев: ${comments.length}`}
              </span>
            </div>

            {/* Reply banner */}
            {replyTo && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border" style={{ background: 'var(--surface2)' }}>
                <IconCornerDownRight size={16} stroke={2} className="text-accent flex-shrink-0" />
                <span className="text-sm text-primary flex-1 ellipsis">
                  Ответ: <b>{replyTo.created_by?.name || 'Аноним'}</b> — {replyTo.text.slice(0, 60)}{replyTo.text.length > 60 ? '…' : ''}
                </span>
                <button onClick={() => setReplyTo(null)} aria-label="Не отвечать" className="tap-sm rounded-xl text-muted">
                  <IconX size={20} stroke={2} />
                </button>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 items-end px-4 py-3 border-b border-border">
              <textarea
                ref={textRef}
                value={text}
                onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={replyTo ? `Ответить ${replyTo.created_by?.name || ''}…` : 'Написать комментарий…'}
                rows={1}
                autoFocus={!!replyTo}
                className="flex-1 bg-bg rounded-2xl px-4 py-3 text-md text-primary outline-none resize-none placeholder:text-muted border border-transparent focus:border-accent transition-colors"
              />
              <button
                onClick={send}
                disabled={!text.trim() || sending}
                aria-label="Отправить комментарий"
                className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-onAccent disabled:opacity-40 transition-opacity flex-shrink-0"
              >
                <IconSend size={18} stroke={1.8} />
              </button>
            </div>

            {/* Comment list */}
            <div className="divide-y divide-border">
              {comments.map(c => (
                <div key={c.id} className="flex gap-3 px-4 py-3">
                  <Avatar name={c.created_by?.name} id={c.created_by_id} imageUrl={c.created_by?.image_url} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-md font-bold text-primary">{c.created_by?.name || 'Аноним'}</span>
                      <span className="text-sm text-muted">{fmtDateTime(c.created_at)}</span>
                    </div>
                    {/* Цитата если ответ */}
                    {(c as any).reply_to && (
                      <div className="flex items-start gap-1.5 mb-1.5 pl-2 border-l-2 border-accent">
                        <span className="text-sm text-muted leading-relaxed ellipsis">
                          <b className="text-accent">{(c as any).reply_to.created_by?.name || 'Аноним'}:</b>{' '}
                          {(c as any).reply_to.text.slice(0, 80)}{(c as any).reply_to.text.length > 80 ? '…' : ''}
                        </span>
                      </div>
                    )}
                    <p className="text-md text-primary leading-relaxed">{c.text}</p>
                    {/* Кнопки, а не текст 10 px: попасть по надписи в две
                        строчки высотой пожилой палец не может. */}
                    <div className="flex items-center gap-1 -ml-2 mt-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); setReplyTo(c); textRef.current?.focus() }}
                        className="tap-sm px-3 rounded-xl text-sm font-bold text-accent"
                      >
                        Ответить
                      </button>
                      {c.created_by_id === userId && (
                        <button
                          onClick={e => { e.stopPropagation(); del(c.id) }}
                          className="tap-sm px-3 rounded-xl text-sm font-bold text-muted hover:text-danger transition-colors"
                        >Удалить</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {lightbox !== null && (
        <ImageLightbox
          images={(post?.materials || []).filter(u => !u.match(/\.(mp4|webm|mov)$/i))}
          startIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
