import React, { useEffect, useState, useCallback, useRef } from 'react'
import { IconX, IconChevronLeft, IconChevronRight, IconDownload, IconShare } from '@tabler/icons-react'
import { downloadUrl } from '../../utils'
import { useBackHandler } from '../../hooks/useBackHandler'

const MIN_SCALE = 1
const MAX_SCALE = 4

interface Props {
  images: string[]
  startIndex?: number
  onClose: () => void
  onForward?: () => void
}

function dist(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

export default function ImageLightbox({ images, startIndex = 0, onClose, onForward }: Props) {
  const [idx, setIdx] = useState(startIndex)
  const [visible, setVisible] = useState(false)
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const pinchRef  = useRef<{ dist: number; scale: number } | null>(null)
  const panRef    = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const swipeRef  = useRef<{ x: number } | null>(null)
  const lastTapRef = useRef(0)
  const draggedRef = useRef(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 180)
  }, [onClose])

  useBackHandler(close)

  const resetZoom = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }) }, [])

  const prev = useCallback(() => { resetZoom(); setIdx(i => (i - 1 + images.length) % images.length) }, [images.length, resetZoom])
  const next = useCallback(() => { resetZoom(); setIdx(i => (i + 1) % images.length) }, [images.length, resetZoom])

  const toggleZoom = useCallback(() => {
    if (scale > 1) resetZoom()
    else { setScale(2.5); setPos({ x: 0, y: 0 }) }
  }, [scale, resetZoom])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      close()
      if (e.key === 'ArrowLeft')   prev()
      if (e.key === 'ArrowRight')  next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, prev, next])

  // ── Зум колесом мыши (десктоп) ──────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setScale(s => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.0018 * s))
      if (next === MIN_SCALE) setPos({ x: 0, y: 0 })
      return next
    })
  }

  // ── Drag для панорамирования мышью, когда приближено ────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return
    draggedRef.current = false
    const startX = e.clientX, startY = e.clientY
    const base = { ...pos }
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true
      setPos({ x: base.x + dx, y: base.y + dy })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Тач: свайп между фото, pinch-to-zoom, панорамирование, двойной тап ──
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: dist(e.touches[0], e.touches[1]), scale }
      swipeRef.current = null
      panRef.current = null
      return
    }
    if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTapRef.current < 280) {
        toggleZoom()
        lastTapRef.current = 0
        return
      }
      lastTapRef.current = now
      if (scale > 1) {
        panRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, startX: pos.x, startY: pos.y }
      } else {
        swipeRef.current = { x: e.touches[0].clientX }
      }
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const d = dist(e.touches[0], e.touches[1])
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.scale * (d / pinchRef.current.dist)))
      setScale(next)
      return
    }
    if (panRef.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - panRef.current.x
      const dy = e.touches[0].clientY - panRef.current.y
      setPos({ x: panRef.current.startX + dx, y: panRef.current.startY + dy })
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (pinchRef.current) {
      pinchRef.current = null
      if (scale <= MIN_SCALE) resetZoom()
    }
    if (panRef.current) {
      panRef.current = null
      return
    }
    if (swipeRef.current) {
      const dx = e.changedTouches[0].clientX - swipeRef.current.x
      if (Math.abs(dx) > 50) dx < 0 ? next() : prev()
      swipeRef.current = null
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[500] flex flex-col transition-all duration-200 ${visible ? 'bg-black/85 backdrop-blur-xl' : 'bg-black/0 backdrop-blur-none'}`}
      onClick={close}
    >
      {/* Close — в углу поверх фотографии, как в галерее телефона */}
      <button
        onClick={close}
        aria-label="Закрыть"
        className="absolute right-3 z-10 w-12 h-12 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-colors"
        style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}
      >
        <IconX size={24} stroke={2.2} />
      </button>

      {/* Действия: скачать / переслать */}
      <div className="absolute left-3 z-10 flex items-center gap-2" style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}>
        <button
          onClick={e => { e.stopPropagation(); downloadUrl(images[idx]) }}
          aria-label="Сохранить в галерею"
          className="w-12 h-12 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-colors"
        >
          <IconDownload size={22} stroke={1.8} />
        </button>
        {onForward && (
          <button
            onClick={e => { e.stopPropagation(); onForward() }}
            aria-label="Переслать"
            className="w-12 h-12 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-colors"
          >
            <IconShare size={22} stroke={1.8} />
          </button>
        )}
      </div>

      {/* Который по счёту: единственная подсказка, что фото можно листать */}
      {images.length > 1 && (
        <div className="absolute left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white text-md font-bold px-3.5 py-1.5 rounded-full pointer-events-none"
          style={{ top: 'max(1.25rem, calc(env(safe-area-inset-top, 0px) + 1rem))' }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Фотография занимает весь экран: поля и полоса миниатюр съедали
          половину высоты, и снимок открывался размером с почтовую марку. */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden touch-none"
        onClick={e => e.stopPropagation()}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={images[idx]}
          alt=""
          onMouseDown={onMouseDown}
          onDoubleClick={toggleZoom}
          onClick={e => { if (draggedRef.current) e.stopPropagation() }}
          className={`select-none object-contain transition-opacity duration-180 ${visible ? 'opacity-100' : 'opacity-0'} ${scale > 1 ? 'cursor-grab' : 'cursor-zoom-in'}`}
          style={{
            maxWidth: '100vw',
            maxHeight: '100dvh',
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: pinchRef.current || panRef.current ? 'none' : 'transform 0.15s ease-out',
          }}
          draggable={false}
        />
      </div>

      {/* Стрелки — только там, где есть мышь. На телефоне листают пальцем,
          а поверх фотографии во весь экран стрелки только мешали бы. */}
      {images.length > 1 && scale === 1 && (
        <div className="hidden [@media(hover:hover)]:block">
          <button
            onClick={e => { e.stopPropagation(); prev() }}
            aria-label="Предыдущее фото"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-colors"
          >
            <IconChevronLeft size={26} stroke={1.8} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next() }}
            aria-label="Следующее фото"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white transition-colors"
          >
            <IconChevronRight size={26} stroke={1.8} />
          </button>
        </div>
      )}
    </div>
  )
}
