import React, { useCallback, useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'

interface Props {
  src: string
  onClose: () => void
}

export default function VideoLightbox({ src, onClose }: Props) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className={`fixed inset-0 z-[500] flex items-center justify-center transition-all duration-200 ${visible ? 'bg-black/90 backdrop-blur-xl' : 'bg-black/0 backdrop-blur-none'}`}
      onClick={close}
    >
      <button
        onClick={close}
        className="absolute right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}
      >
        <IconX size={18} stroke={2} />
      </button>

      <div className="px-4 w-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <video
          src={src}
          controls
          autoPlay
          playsInline
          preload="auto"
          className={`rounded-xl object-contain transition-opacity duration-180 ${visible ? 'opacity-100' : 'opacity-0'}`}
          style={{ maxWidth: '94vw', maxHeight: '82vh', minWidth: 200, minHeight: 120 }}
        />
      </div>
    </div>
  )
}
