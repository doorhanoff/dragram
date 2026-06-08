import React, { useEffect, useState, useCallback } from 'react'
import { IconX, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

interface Props {
  images: string[]
  startIndex?: number
  onClose: () => void
}

export default function ImageLightbox({ images, startIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 180)
  }, [onClose])

  const prev = useCallback(() => setIdx(i => (i - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() => setIdx(i => (i + 1) % images.length), [images.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      close()
      if (e.key === 'ArrowLeft')   prev()
      if (e.key === 'ArrowRight')  next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, prev, next])

  // Свайп на мобильном
  let touchStartX = 0
  const onTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) > 50) dx < 0 ? next() : prev()
  }

  return (
    <div
      className={`fixed inset-0 z-[500] flex flex-col transition-all duration-200 ${visible ? 'bg-black/85 backdrop-blur-xl' : 'bg-black/0 backdrop-blur-none'}`}
      onClick={close}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Close */}
      <button
        onClick={close}
        className="absolute right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}
      >
        <IconX size={18} stroke={2} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white text-xs px-3 py-1 rounded-full"
          style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center px-12 py-6"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={images[idx]}
          alt=""
          className={`select-none rounded-xl object-contain transition-opacity duration-180 ${visible ? 'opacity-100' : 'opacity-0'}`}
          style={{ maxWidth: '90vw', maxHeight: '78vh' }}
          draggable={false}
        />
      </div>

      {/* Nav arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev() }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          >
            <IconChevronLeft size={22} stroke={1.5} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          >
            <IconChevronRight size={22} stroke={1.5} />
          </button>
        </>
      )}

      {/* Thumbnails strip */}
      {images.length > 1 && (
        <div className="flex gap-1.5 justify-center pb-4 px-4 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-10 h-10 rounded-md overflow-hidden flex-shrink-0 transition-all ${i === idx ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-80'}`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
