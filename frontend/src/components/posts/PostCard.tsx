import React, { useState } from 'react'
import { IconHeart, IconMessageCircle, IconBookmark, IconPhoto, IconPlayerPlayFilled } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import ImageLightbox from '../ui/ImageLightbox'
import CachedImg from '../ui/CachedImg'
import VideoLightbox from '../ui/VideoLightbox'
import type { Post } from '../../types'
import { api, mediaSrc } from '../../api'
import { parseDate } from '../../utils'

function fmtAgo(dt: string): string {
  const parsed = parseDate(dt)
  if (!parsed) return ''
  const diff = Date.now() - parsed.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч.`
  return `${Math.floor(h / 24)} дн.`
}

interface Props {
  post: Post
  onClick: () => void
}

export default function PostCard({ post, onClick }: Props) {
  const [liked,   setLiked]   = useState((post as any).is_liked ?? false)
  const [saved,   setSaved]   = useState((post as any).is_bookmarked ?? false)
  const [likes,   setLikes]   = useState((post as any).likes_count ?? 0)
  const comments = (post as any).comments_count ?? 0
  const [lightbox,setLightbox]= useState<number | null>(null)
  const [videoOpen,setVideoOpen] = useState(false)
  const [portrait,setPortrait] = useState(false)

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    const wasLiked = liked
    setLiked(!wasLiked); setLikes(n => wasLiked ? n - 1 : n + 1)
    try { await api.likePost(post.id) } catch { setLiked(wasLiked); setLikes(n => wasLiked ? n + 1 : n - 1) }
  }

  async function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation()
    const wasSaved = saved
    setSaved(!wasSaved)
    try { await api.bookmarkPost(post.id) } catch { setSaved(wasSaved) }
  }

  const media    = post.materials || []
  const images   = media.filter(u => !u.match(/\.(mp4|webm|mov)$/i))
  const coverImg = images[0]
  const coverVid = !coverImg ? media.find(u => u.match(/\.(mp4|webm|mov)$/i)) : undefined
  const extraCount = images.length - 1  // сколько фото скрыто за обложкой

  return (
    <>
      <article
        className="bg-surface border border-border rounded-card overflow-hidden cursor-pointer shadow-soft transition-shadow"
        onClick={onClick}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-[14px] pt-[14px] pb-[10px]">
          <Avatar name={post.created_by?.name} id={post.created_by_id} imageUrl={post.created_by?.image_url} size={44} />
          <span className="text-lg font-extrabold text-primary flex-1 ellipsis">
            {post.created_by?.name || 'Аноним'}
          </span>
          <span className="text-sm font-bold text-muted ml-auto">{fmtAgo(post.created_at)}</span>
        </div>

        {/* Cover. Пропорция по содержимому, а не полоса в 200 px на всех:
            вертикальная фотография вписывалась в широкую полосу и обрастала
            пустыми полями по бокам. */}
        {(coverImg || coverVid) && (
          <div
            className="w-full overflow-hidden relative flex items-center justify-center"
            style={{ aspectRatio: portrait ? '4 / 5' : '16 / 9', background: 'var(--surface2)' }}
          >
            {coverImg ? (
              <button
                className="w-full h-full focus:outline-none flex items-center justify-center"
                onClick={e => { e.stopPropagation(); setLightbox(0) }}
              >
                <CachedImg
                  url={coverImg}
                  alt=""
                  className="w-full h-full object-cover hover:opacity-95 transition-opacity"
                  onLoad={(e: any) => {
                    const img = e.currentTarget
                    if (img.naturalHeight > img.naturalWidth) setPortrait(true)
                  }}
                />
              </button>
            ) : (
              <button
                className="w-full h-full focus:outline-none relative flex items-center justify-center"
                onClick={e => { e.stopPropagation(); setVideoOpen(true) }}
              >
                <video src={mediaSrc(coverVid)} className="max-w-full max-h-full object-contain" preload="metadata" muted playsInline />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors">
                  <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center">
                    <IconPlayerPlayFilled size={18} className="text-primary ml-0.5" />
                  </div>
                </div>
              </button>
            )}

            {/* Бейдж "ещё N фото" */}
            {extraCount > 0 && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
                <IconPhoto size={11} stroke={2} />
                +{extraCount}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-[14px] pt-[12px] pb-[14px]">
          <h3 className="text-xl font-extrabold text-primary mb-[3px] ellipsis">{post.title}</h3>
          {post.description && (
            <p
              className="text-md font-semibold text-muted leading-relaxed mb-[12px]"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {post.description}
            </p>
          )}

          {/* Actions. Числа вместо слов: по подписи «комментарии» не видно
              ни сколько их, ни сохранён ли уже пост. Ноль показываем нулём,
              а не пустотой. Если комментариев нет — зовём написать первый. */}
          <div className="flex items-center gap-1 border-t border-border pt-1.5">
            <button
              className={`tap gap-1.5 rounded-2xl text-md font-bold transition-colors px-2 ${liked ? 'text-danger' : 'text-muted hover:text-danger'}`}
              onClick={handleLike}
              aria-label={liked ? 'Убрать отметку «нравится»' : 'Нравится'}
            >
              <IconHeart size={22} stroke={1.8} fill={liked ? 'var(--danger)' : 'none'} />
              <span className="tabular-nums">{likes}</span>
            </button>
            <button
              className="tap gap-1.5 rounded-2xl text-md font-bold text-muted hover:text-primary transition-colors px-2"
              onClick={e => { e.stopPropagation(); onClick() }}
            >
              <IconMessageCircle size={22} stroke={1.8} />
              <span className="tabular-nums">{comments > 0 ? comments : 'Прокомментировать'}</span>
            </button>
            <button
              className={`tap rounded-2xl transition-colors ml-auto px-2 ${saved ? 'text-accent' : 'text-muted hover:text-accent'}`}
              onClick={handleBookmark}
              aria-label={saved ? 'Убрать из сохранённых' : 'Сохранить'}
            >
              <IconBookmark size={21} stroke={1.8} fill={saved ? 'var(--accent)' : 'none'} />
            </button>
          </div>
        </div>
      </article>

      {/* Лайтбокс — открывается внутри сайта, не на S3 */}
      {lightbox !== null && images.length > 0 && (
        <ImageLightbox
          images={images.map(mediaSrc)}
          startIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {videoOpen && coverVid && (
        <VideoLightbox src={mediaSrc(coverVid)} onClose={() => setVideoOpen(false)} />
      )}
    </>
  )
}
