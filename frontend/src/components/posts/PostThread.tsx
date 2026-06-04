import React, { useState, useEffect, useRef } from 'react'
import { IconArrowLeft, IconSend, IconCornerDownRight, IconX } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import ImageLightbox from '../ui/ImageLightbox'
import type { Post, Comment } from '../../types'
import { api } from '../../api'

function fmtTime(dt?: string) {
  if (!dt) return ''
  const d = new Date(dt)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

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
  const [replyTo,       setReplyTo]  = useState<Comment | null>(null)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!postId) return
    setLoading(true)
    Promise.all([api.getPost(postId), api.getComments(postId)])
      .then(([p, c]) => { setPost(p); setComments(c || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [postId])

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
      <div className="bg-surface border-b border-border flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-accent hover:bg-bg transition-colors">
          <IconArrowLeft size={18} stroke={1.5} />
        </button>
        <span className="text-lg font-medium text-primary ellipsis flex-1">{post.title}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
          {/* Post card */}
          <div className="bg-surface border border-[#E0E0E8] rounded-xl overflow-hidden">
            {/* Author */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Avatar name={post.created_by?.name} id={post.created_by_id} imageUrl={post.created_by?.image_url} size={34} />
              <div>
                <div className="text-md font-medium text-primary">{post.created_by?.name || 'Аноним'}</div>
                <div className="text-xs text-muted">{fmtTime(post.created_at)}</div>
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
                    ? <video key={i} src={url} controls className={`w-full object-cover ${isFirst3 ? 'col-span-2' : ''}`} style={{ aspectRatio: '16/9' }} />
                    : <button
                        key={i}
                        onClick={() => setLightbox(i)}
                        className={`w-full overflow-hidden ${isFirst3 ? 'col-span-2' : ''} focus:outline-none`}
                        style={{ aspectRatio: '16/9' }}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                      </button>
                })}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="bg-surface border border-[#E0E0E8] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A0A0B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="text-md font-medium text-primary">{comments.length} комментариев</span>
            </div>

            {/* Reply banner */}
            {replyTo && (
              <div className="flex items-center gap-2 px-4 py-2 bg-accent-light border-b border-border">
                <IconCornerDownRight size={13} stroke={2} className="text-accent flex-shrink-0" />
                <span className="text-xs text-accent flex-1 ellipsis">
                  Ответ на: <b>{replyTo.created_by?.name || 'Аноним'}</b> — {replyTo.text.slice(0, 60)}{replyTo.text.length > 60 ? '…' : ''}
                </span>
                <button onClick={() => setReplyTo(null)} className="text-muted hover:text-primary transition-colors">
                  <IconX size={14} stroke={2} />
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
                className="flex-1 bg-bg rounded-lg px-3 py-2 text-md text-primary outline-none resize-none placeholder:text-muted border border-transparent focus:border-accent transition-colors"
              />
              <button
                onClick={send}
                disabled={!text.trim() || sending}
                className="w-8 h-8 rounded-[9px] bg-accent flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
              >
                <IconSend size={14} stroke={1.5} />
              </button>
            </div>

            {/* Comment list */}
            <div className="divide-y divide-[#F0F0F4]">
              {comments.map(c => {
                const isCActive = activeComment === c.id
                return (
                <div
                  key={c.id}
                  className="flex gap-3 px-4 py-3 group"
                  onTouchStart={() => setActiveComment(prev => prev === c.id ? null : c.id)}
                >
                  <Avatar name={c.created_by?.name} id={c.created_by_id} imageUrl={c.created_by?.image_url} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-md font-medium text-primary">{c.created_by?.name || 'Аноним'}</span>
                      <span className="text-xs text-[#bbb]">{fmtTime(c.created_at)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setReplyTo(c); setActiveComment(null); textRef.current?.focus() }}
                        className={`text-xs text-accent transition-all hover:underline ${isCActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        ответить
                      </button>
                      {c.created_by_id === userId && (
                        <button
                          onClick={e => { e.stopPropagation(); del(c.id); setActiveComment(null) }}
                          className={`ml-auto text-xs text-muted hover:text-red-400 transition-all ${isCActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >удалить</button>
                      )}
                    </div>
                    {/* Цитата если ответ */}
                    {(c as any).reply_to && (
                      <div className="flex items-start gap-1.5 mb-1.5 pl-2 border-l-2 border-accent/40">
                        <span className="text-xs text-muted leading-relaxed ellipsis">
                          <b className="text-accent-text">{(c as any).reply_to.created_by?.name || 'Аноним'}:</b>{' '}
                          {(c as any).reply_to.text.slice(0, 80)}{(c as any).reply_to.text.length > 80 ? '…' : ''}
                        </span>
                      </div>
                    )}
                    <p className="text-md text-primary leading-relaxed">{c.text}</p>
                  </div>
                </div>
              )
              })}
              {comments.length === 0 && (
                <p className="text-sm text-muted text-center py-6">Комментариев пока нет</p>
              )}
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
