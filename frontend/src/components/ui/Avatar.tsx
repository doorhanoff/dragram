import React from 'react'
import { mediaSrc } from '../../api'

const PALETTE = [
  ['#F0C29B','#9C5A28'], ['#9FC2D2','#2E586B'], ['#B7C3A8','#46562F'],
  ['#C9B7E0','#5E4A82'], ['#E8B4B0','#8A3A34'], ['#C7D9A8','#4C6B2E'],
  ['#E3C9A0','#7A5222'], ['#A9C9C4','#2E5E58'],
]

function paletteFrom(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

interface AvatarProps {
  name?: string
  id?: string
  imageUrl?: string | null
  isActive?: boolean
  size?: number
  className?: string
}

export default function Avatar({ name = '', id = '', imageUrl, isActive, size = 34, className = '' }: AvatarProps) {
  const [bg, fg] = paletteFrom(id)
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      {imageUrl ? (
        <img
          src={mediaSrc(imageUrl)}
          alt={name}
          loading="lazy"
          className="rounded-full object-cover w-full h-full"
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-extrabold select-none"
          style={{ ...style, backgroundColor: bg, color: fg }}
        >
          {initials(name)}
        </div>
      )}
      {isActive && (
        // Точка растёт вместе с аватаром: на 26 px она была почти не видна,
        // а на 112 px терялась совсем.
        <span
          className="absolute bottom-0 right-0 rounded-full bg-online border-2 border-surface"
          style={{ width: Math.max(10, Math.round(size * 0.24)), height: Math.max(10, Math.round(size * 0.24)) }}
        />
      )}
    </div>
  )
}
