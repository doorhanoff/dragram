import React, { useEffect, useRef, useState } from 'react'
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'

/**
 * Свой плеер голосового: кружок «играть», полоса с перемоткой и скорость.
 *
 * Стандартный <audio controls> внутри пузыря — серая браузерная полоска,
 * которая выглядит чужеродно и на Android рисуется по-своему в каждой версии.
 */

const SPEEDS = [1, 1.5, 2]

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
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    /**
     * Голосовые пишутся MediaRecorder в webm, а у такой записи браузер
     * сначала отдаёт duration = Infinity: полоса не заполняется и перемотка
     * не работает вовсе. Лечится принудительной перемоткой в конец — после
     * неё длительность становится известна.
     */
    const settleDuration = () => {
      if (isFinite(el.duration) && el.duration > 0) { setDuration(el.duration); return }
      const onTick = () => {
        el.removeEventListener('timeupdate', onTick)
        if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration)
        el.currentTime = 0
        setPosition(0)
      }
      el.addEventListener('timeupdate', onTick)
      el.currentTime = 1e101
    }

    const onTime = () => { if (!draggingRef.current) setPosition(el.currentTime) }
    const onEnd  = () => { setPlaying(false); setPosition(0); el.currentTime = 0 }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    el.addEventListener('loadedmetadata', settleDuration)
    el.addEventListener('durationchange', settleDuration)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('loadedmetadata', settleDuration)
      el.removeEventListener('durationchange', settleDuration)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [src])

  // playbackRate сбрасывается при загрузке нового файла — проставляем следом.
  useEffect(() => {
    const el = audioRef.current
    if (el) el.playbackRate = speed
  }, [speed, src])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  function cycleSpeed(e: React.MouseEvent) {
    e.stopPropagation()
    setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])
  }

  function seekToX(clientX: number) {
    const el = audioRef.current
    const track = trackRef.current
    if (!el || !track || !duration) return
    const r = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    el.currentTime = ratio * duration
    setPosition(ratio * duration)
  }

  const progress = duration ? Math.min(100, position / duration * 100) : 0
  const track = onAccent ? 'rgba(255,255,255,.35)' : 'var(--border)'
  const fill  = onAccent ? '#fff' : 'var(--accent)'

  return (
    <div className="flex items-center gap-2.5 min-w-[210px]">
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
        {/* Зона перетаскивания выше самой полосы: попасть пальцем в 6 px
            нельзя, а промах по голосовому открывает меню сообщения.
            touchstart не пускаем наверх — иначе долгое нажатие при перемотке
            откроет это меню поверх плеера. */}
        <div
          className="py-2 -my-2 cursor-pointer touch-none"
          onTouchStart={e => e.stopPropagation()}
          onPointerDown={e => {
            e.stopPropagation()
            draggingRef.current = true
            try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
            seekToX(e.clientX)
          }}
          onPointerMove={e => { if (draggingRef.current) seekToX(e.clientX) }}
          onPointerUp={e => {
            draggingRef.current = false
            // Бросает, если захвата не было (мышь вошла уже нажатой).
            try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
          }}
          onPointerCancel={() => { draggingRef.current = false }}
          onClick={e => e.stopPropagation()}
        >
          <div ref={trackRef} className="h-1.5 rounded-full relative" style={{ background: track }}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: fill }} />
            {/* Бегунок: показывает, что полосу можно тянуть. */}
            <span
              className="absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 -translate-y-1/2 top-1/2 shadow"
              style={{ left: `${progress}%`, background: fill }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs tabular-nums" style={{ opacity: .85 }}>
            {fmtDuration(position)} / {fmtDuration(duration)}
          </span>
          <button
            onClick={cycleSpeed}
            aria-label={`Скорость ${String(speed).replace('.', ',')}×`}
            className="text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0"
            style={{
              background: onAccent ? 'rgba(255,255,255,.22)' : 'var(--surface2)',
              color: onAccent ? '#fff' : 'var(--text)',
            }}
          >
            {String(speed).replace('.', ',')}×
          </button>
        </div>
      </div>
    </div>
  )
}
