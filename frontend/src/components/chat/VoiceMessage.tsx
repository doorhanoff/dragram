import React, { useEffect, useRef, useState } from 'react'
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'

/**
 * Свой плеер голосового: кружок «играть», полоса и длительность.
 *
 * Стандартный <audio controls> внутри пузыря — серая браузерная полоска,
 * которая выглядит чужеродно и на Android рисуется по-своему в каждой версии.
 */
function fmtDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  src: string
  /** Пузырь на акценте — значит, всё внутри белое. */
  onAccent?: boolean
}

export default function VoiceMessage({ src, onAccent }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = () => setDuration(el.duration)
    const onTime = () => setPosition(el.currentTime)
    const onEnd  = () => { setPlaying(false); setPosition(0) }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
    }
  }, [src])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const el = audioRef.current
    if (!el) return
    if (el.paused) { el.play().then(() => setPlaying(true)).catch(() => {}) }
    else { el.pause(); setPlaying(false) }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.currentTime = Math.min(duration, Math.max(0, (e.clientX - rect.left) / rect.width * duration))
  }

  const progress = duration ? Math.min(100, position / duration * 100) : 0
  const track = onAccent ? 'rgba(255,255,255,.35)' : 'var(--border)'
  const fill  = onAccent ? '#fff' : 'var(--accent)'

  return (
    <div className="flex items-center gap-2.5 min-w-[190px]">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Слушать'}
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: onAccent ? 'rgba(255,255,255,.22)' : 'var(--accent)', color: onAccent ? '#fff' : 'var(--on-accent)' }}
      >
        {playing ? <IconPlayerPauseFilled size={18} /> : <IconPlayerPlayFilled size={18} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full cursor-pointer" style={{ background: track }} onClick={seek}>
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: fill }} />
        </div>
        <div className="text-xs mt-1 tabular-nums" style={{ opacity: .85 }}>
          {fmtDuration(playing || position ? position : duration)}
        </div>
      </div>
    </div>
  )
}
