import React, { useState } from 'react'
import { IconHeart, IconMessageCircle, IconBookmark, IconPhoto } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import ImageLightbox from '../ui/ImageLightbox'
import type { Post } from '../../types'
import { api } from '../../api'

function fmtAgo(dt: string): string {
  const diff = Date.now() - new Date(dt).getTime()
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
  const [lightbox,setLightbox]= useState<number | null>(null)

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
        className="bg-surface border border-[#E0E0E8] rounded-xl overflow-hidden cursor-pointer hover:shadow-sm transition-shadow"
        onClick={onClick}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-[13px] pt-[11px] pb-[7px]">
          <Avatar name={post.created_by?.name} id={post.created_by_id} imageUrl={post.created_by?.image_url} size={30} />
          <span className="text-md font-medium text-primary flex-1 ellipsis">
            {post.created_by?.name || 'Аноним'}
          </span>
          <span className="text-sm text-[#bbb] ml-auto">{fmtAgo(post.created_at)}</span>
        </div>

        {/* Cover */}
        {(coverImg || coverVid) && (
          <div
            className="w-full overflow-hidden relative flex items-center justify-center"
            style={{ height: 160, background: '#F3F3FA' }}
          >
            {coverImg ? (
              <button
                className="w-full h-full focus:outline-none flex items-center justify-center"
                onClick={e => { e.stopPropagation(); setLightbox(0) }}
              >
                <img src={coverImg} alt="" className="max-w-full max-h-full w-full h-full object-contain hover:opacity-95 transition-opacity" />
              </button>
            ) : (
              <video src={coverVid} className="max-w-full max-h-full object-contain" preload="metadata" muted />
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
        <div className="px-[13px] pt-[9px] pb-[11px]">
          <h3 className="text-md font-medium text-primary mb-[3px] ellipsis">{post.title}</h3>
          {post.description && (
            <p
              className="text-sm text-[#888] leading-relaxed mb-[9px]"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {post.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-[14px] border-t border-[#F0F0F4] pt-2">
            <button className={`flex items-center gap-1 text-sm transition-colors ${liked ? 'text-[#E24B4A]' : 'text-[#aaa] hover:text-[#E24B4A]'}`} onClick={handleLike}>
              <IconHeart size={14} stroke={1.5} fill={liked ? '#E24B4A' : 'none'} />
              <span>{likes || ''}</span>
            </button>
            <button
              className="flex items-center gap-1 text-sm text-[#aaa] hover:text-primary transition-colors"
              onClick={e => { e.stopPropagation(); onClick() }}
            >
              <IconMessageCircle size={14} stroke={1.5} />
              <span>комментарии</span>
            </button>
            <button className={`flex items-center gap-1 text-sm transition-colors ml-auto ${saved ? 'text-accent' : 'text-[#aaa] hover:text-accent'}`} onClick={handleBookmark}>
              <IconBookmark size={14} stroke={1.5} fill={saved ? '#5B5EF4' : 'none'} />
              <span>сохранить</span>
            </button>
          </div>
        </div>
      </article>

      {/* Лайтбокс — открывается внутри сайта, не на S3 */}
      {lightbox !== null && images.length > 0 && (
        <ImageLightbox
          images={images}
          startIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
