import React, { useRef } from 'react'

interface Props {
  src: string
  className?: string
  onClick?: () => void
}

export default function VideoThumb({ src, className, onClick }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleMetadata = () => {
    const v = videoRef.current
    if (v) v.currentTime = 0.01
  }

  return (
    <div className={`relative cursor-pointer ${className ?? ''}`} onClick={onClick}>
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        muted
        onLoadedMetadata={handleMetadata}
        className="max-w-[260px] max-h-[320px] rounded-xl block bg-[#1a1a2e] pointer-events-none"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
    </div>
  )
}
