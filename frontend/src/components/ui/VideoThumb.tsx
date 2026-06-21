import React, { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  className?: string
  onClick?: () => void
}

export default function VideoThumb({ src, className, onClick }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [poster, setPoster] = useState<string | null>(null)

  useEffect(() => {
    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'

    const capture = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = video.videoWidth  || 320
        canvas.height = video.videoHeight || 240
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        setPoster(canvas.toDataURL('image/jpeg', 0.8))
      } catch {}
    }

    video.addEventListener('seeked', capture)
    video.addEventListener('loadedmetadata', () => { video.currentTime = 0.01 })
    video.load()

    return () => { video.src = '' }
  }, [src])

  return (
    <div className={`relative cursor-pointer ${className ?? ''}`} onClick={onClick}>
      {poster
        ? <img src={poster} className="max-w-[260px] max-h-[320px] rounded-xl block object-cover" alt="" />
        : <div className="w-[200px] h-[140px] rounded-xl bg-[#1a1a2e] animate-pulse" />
      }
      {/* кнопка play */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
    </div>
  )
}
