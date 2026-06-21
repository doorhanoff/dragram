import React, { useRef } from 'react'

interface Props {
  src: string
  poster?: string | null
  className?: string
  onClick?: () => void
}

export default function VideoThumb({ src, poster, className, onClick }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  return (
    <div className={`relative cursor-pointer ${className ?? ''}`} onClick={onClick}>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        preload="metadata"
        playsInline
        muted
        onLoadedMetadata={() => {
          // fallback: seek to first frame if no poster provided
          if (!poster && videoRef.current) videoRef.current.currentTime = 0.01
        }}
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
